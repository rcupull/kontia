import { useState } from "react";
import { AlertTriangle, CheckCircle2, Database, Upload } from "lucide-react";
import initSqlJs, { type Database as SqliteDatabase } from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { api } from "../api";

type Row = Record<string, unknown>;
const sourceBusinessId = "46803d79-afbc-4606-8636-836af5469593";

function rows(database: SqliteDatabase, table: string) {
  const result = database.exec(`SELECT * FROM ${table}`)[0];
  if (!result) return [];
  return result.values.map((values: unknown[]) =>
    Object.fromEntries(
      result.columns.map((column: string, index: number) => [
        column,
        values[index],
      ]),
    ),
  ) as Row[];
}

function sourceRows(database: SqliteDatabase, table: string) {
  return rows(database, table).filter(
    (row) => String(row.businessId ?? "") === sourceBusinessId,
  );
}

async function optimizeImage(dataUrl: string) {
  const original = await fetch(dataUrl).then((response) => response.blob());
  let blob = original;
  if (blob.size > 590_000) {
    const bitmap = await createImageBitmap(original);
    const scale = Math.min(1, Math.sqrt(560_000 / blob.size));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas
      .getContext("2d")
      ?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.86, 0.76, 0.66, 0.56]) {
      const candidate = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", quality),
      );
      if (candidate) blob = candidate;
      if (blob.size <= 590_000) break;
    }
    bitmap.close();
  }
  if (blob.size > 600_000)
    throw new Error("No se pudo reducir una de las imágenes a menos de 600 KB");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return {
    imageBase64: btoa(binary),
    imageContentType: blob.type === "image/jpg" ? "image/jpeg" : blob.type,
    imageSizeBytes: blob.size,
  };
}

async function readLitePos(file: File, onProgress: (message: string) => void) {
  onProgress("Leyendo la base de datos SQLite...");
  const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
  const database = new SQL.Database(new Uint8Array(await file.arrayBuffer()));
  try {
    const business = rows(database, "businesses").find(
      (row) => String(row.id) === sourceBusinessId,
    );
    if (!business)
      throw new Error("El archivo no contiene el negocio Pos64 esperado");

    const categories = sourceRows(database, "categories");
    const categoryIds = new Set(categories.map((row) => String(row.id)));
    const products = sourceRows(database, "products");
    onProgress(`Procesando ${products.length} imágenes...`);
    for (const product of products) {
      if (!categoryIds.has(String(product.categoryId ?? "")))
        product.categoryId = null;
      const image = String(product.imageBase64 ?? "");
      if (image) Object.assign(product, await optimizeImage(image));
    }

    const invoices = sourceRows(database, "supplier_invoices");
    const canonicalInvoices = new Map<string, Row>();
    const invoiceIds = new Map<string, string>();
    for (const invoice of invoices) {
      const key = `${invoice.supplierId}\u0000${invoice.invoiceNumber}`;
      const existing = canonicalInvoices.get(key);
      if (!existing) {
        canonicalInvoices.set(key, invoice);
        invoiceIds.set(String(invoice.id), String(invoice.id));
      } else {
        invoiceIds.set(String(invoice.id), String(existing.id));
        existing.totalAmount =
          Number(existing.totalAmount ?? 0) + Number(invoice.totalAmount ?? 0);
        existing.notes =
          [existing.notes, invoice.notes].filter(Boolean).join(" | ") || null;
      }
    }
    const inventoryBatches = sourceRows(database, "inventory_batches");
    for (const batch of inventoryBatches) {
      const invoiceId = String(batch.supplierInvoiceId ?? "");
      batch.supplierInvoiceId = invoiceId
        ? (invoiceIds.get(invoiceId) ?? null)
        : null;
    }

    return {
      business,
      categories,
      products,
      productComponents: sourceRows(database, "product_components"),
      suppliers: sourceRows(database, "suppliers"),
      supplierInvoices: [...canonicalInvoices.values()],
      inventoryBatches,
      inventoryMovements: sourceRows(database, "inventory_movements"),
      cashSessions: sourceRows(database, "cash_sessions"),
      sales: sourceRows(database, "sales"),
      saleItems: sourceRows(database, "sale_items"),
      saleRefunds: sourceRows(database, "sale_refunds"),
      financialMovements: sourceRows(database, "financial_movements"),
      auditLogs: sourceRows(database, "audit_logs"),
    };
  } finally {
    database.close();
  }
}

const importTables = [
  "categories",
  "products",
  "productComponents",
  "suppliers",
  "supplierInvoices",
  "inventoryBatches",
  "cashSessions",
  "sales",
  "saleItems",
  "saleRefunds",
  "inventoryMovements",
  "financialMovements",
  "auditLogs",
] as const;

async function sendImport(
  payload: Awaited<ReturnType<typeof readLitePos>>,
  onProgress: (message: string) => void,
) {
  const empty = () =>
    Object.fromEntries(
      importTables.map((table) => [table, []]),
    ) as unknown as Record<(typeof importTables)[number], Row[]>;
  onProgress("Eliminando los datos actuales y preparando el almacén...");
  await api.importLitePos({
    mode: "replace",
    business: payload.business,
    ...empty(),
  });

  let completed = 0;
  const total = importTables.reduce(
    (sum, table) => sum + payload[table].length,
    0,
  );
  for (const table of importTables) {
    const tableRows = payload[table];
    const chunkSize =
      table === "products" || table === "inventoryBatches" ? 20 : 35;
    for (let index = 0; index < tableRows.length; index += chunkSize) {
      const data = empty();
      data[table] = tableRows.slice(index, index + chunkSize);
      onProgress(
        `Importando datos ${completed + 1}–${Math.min(completed + chunkSize, total)} de ${total}...`,
      );
      await api.importLitePos({
        mode: "append",
        business: payload.business,
        ...data,
      });
      completed += Math.min(chunkSize, tableRows.length - index);
    }
  }
  return {
    ok: true,
    imported: {
      products: payload.products.length,
      images: payload.products.filter((row) => row.imageBase64).length,
      batches: payload.inventoryBatches.length,
      movements: payload.inventoryMovements.filter(
        (row) =>
          !["transferToPos", "transferToWarehouse"].includes(
            String(row.movementType),
          ),
      ).length,
      sales: payload.sales.length,
    },
  };
}

export function MaintenancePage() {
  const [file, setFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof api.importLitePos>
  > | null>(null);
  const [working, setWorking] = useState(false);

  async function importDatabase() {
    if (!file || !confirmed) return;
    setWorking(true);
    setError("");
    setResult(null);
    try {
      const payload = await readLitePos(file, setStatus);
      setStatus("Importando Pos64 en Kontia. No cierres esta ventana...");
      const imported = await sendImport(payload, setStatus);
      setResult(imported);
      setStatus("Importación terminada correctamente.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo importar la base de datos",
      );
      setStatus("");
    } finally {
      setWorking(false);
    }
  }

  return (
    <section>
      <p className="text-sm font-black uppercase tracking-wider text-emerald-700">
        Administración
      </p>
      <h1 className="mt-1 text-3xl font-black">Mantenimiento</h1>
      <p className="mt-2 text-slate-500">
        Herramientas de migración e integridad del negocio.
      </p>

      <div className="mt-7 max-w-3xl rounded-3xl bg-white p-7 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
            <Database />
          </div>
          <div>
            <h2 className="text-xl font-black">
              Importar base de datos de LitePOS
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Importa exclusivamente Pos64, conserva el propietario actual y
              concentra todo el inventario en el almacén principal.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-black">
            <AlertTriangle size={18} /> Esta operación es destructiva
          </p>
          <p className="mt-1">
            Se eliminarán los datos actuales del negocio. Los usuarios
            históricos y los traslados entre POS y almacén no serán importados.
          </p>
        </div>

        <label className="mt-6 flex cursor-pointer items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center hover:border-emerald-500">
          <Upload className="text-emerald-700" />
          <span className="font-bold">
            {file?.name ?? "Seleccionar litepos.sqlite"}
          </span>
          <input
            type="file"
            accept=".sqlite,.db,application/x-sqlite3"
            className="hidden"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>

        <label className="mt-5 flex items-start gap-3 text-sm font-bold">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-0.5 size-4"
          />
          Confirmo que deseo reemplazar todos los datos actuales del negocio.
        </label>

        {status && (
          <p className="mt-5 rounded-2xl bg-blue-50 p-4 text-sm font-bold text-blue-800">
            {status}
          </p>
        )}
        {error && (
          <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
            {error}
          </p>
        )}
        {result && (
          <div className="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="flex items-center gap-2 font-black">
              <CheckCircle2 size={18} /> Datos importados
            </p>
            <p className="mt-2">
              {result.imported.products} productos · {result.imported.images}{" "}
              imágenes · {result.imported.batches} lotes ·{" "}
              {result.imported.movements} movimientos · {result.imported.sales}{" "}
              ventas
            </p>
          </div>
        )}

        <button
          type="button"
          disabled={!file || !confirmed || working}
          onClick={() => void importDatabase()}
          className="mt-6 rounded-2xl bg-emerald-700 px-6 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {working ? "Importando..." : "Importar y reemplazar datos"}
        </button>
      </div>
    </section>
  );
}
