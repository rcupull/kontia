import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Archive,
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  Boxes,
  CreditCard,
  Check,
  DollarSign,
  Landmark,
  ReceiptText,
  RotateCcw,
  ShoppingCart,
  SlidersHorizontal,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import {
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { api, type DashboardMetrics } from "../api";
import type { MoneySettings } from "../types";
import { Chart, type ChartData } from "../components/chart";
import { PageSpinner } from "../components/Spinner";

type DashboardData = Awaited<ReturnType<typeof api.dashboard>>;
type Tab = "general" | "products" | "finance" | "accounts" | "inventory";
type RangeKey = "all" | "thisMonth" | "lastMonth" | "thisWeek" | "lastWeek";
const money = (value: number) =>
  new Intl.NumberFormat("es", { style: "currency", currency: "CUP" }).format(
    Number(value || 0) / 100,
  );
const metricOptions: Array<{
  key: MetricKey;
  label: string;
  description: string;
  color: string;
  icon: ReactNode;
}> = [
  {
    key: "grossSales",
    label: "Ventas totales",
    description: "Total vendido antes de descontar reintegros.",
    color: "#0f172a",
    icon: <ShoppingCart />,
  },
  {
    key: "netSales",
    label: "Ventas netas",
    description: "Ventas totales menos reintegros registrados.",
    color: "#2563eb",
    icon: <WalletCards />,
  },
  {
    key: "refunds",
    label: "Reintegros",
    description: "Monto total devuelto a clientes.",
    color: "#dc2626",
    icon: <RotateCcw />,
  },
  {
    key: "grossCashSales",
    label: "Ventas efectivo",
    description: "Ventas cobradas en efectivo antes de reintegros.",
    color: "#16a34a",
    icon: <Banknote />,
  },
  {
    key: "netCashSales",
    label: "Neto efectivo",
    description: "Ventas en efectivo menos sus reintegros.",
    color: "#16a34a",
    icon: <Banknote />,
  },
  {
    key: "cashRefunds",
    label: "Reintegros efectivo",
    description: "Dinero devuelto en efectivo.",
    color: "#b91c1c",
    icon: <RotateCcw />,
  },
  {
    key: "grossTransferSales",
    label: "Ventas transferencias",
    description: "Ventas cobradas por transferencia antes de reintegros.",
    color: "#7c3aed",
    icon: <CreditCard />,
  },
  {
    key: "netTransferSales",
    label: "Neto transferencias",
    description: "Transferencias menos sus reintegros.",
    color: "#7c3aed",
    icon: <CreditCard />,
  },
  {
    key: "transferRefunds",
    label: "Reintegros transferencias",
    description: "Dinero devuelto por transferencias.",
    color: "#be123c",
    icon: <RotateCcw />,
  },
  {
    key: "cost",
    label: "Costo",
    description: "Costo de compra de los productos vendidos.",
    color: "#f97316",
    icon: <ReceiptText />,
  },
  {
    key: "profit",
    label: "Utilidad",
    description: "Utilidad luego del costo e impuesto estimado.",
    color: "#0891b2",
    icon: <TrendingUp />,
  },
  {
    key: "expenses",
    label: "Gastos operativos",
    description: "Salidas registradas como gastos operativos.",
    color: "#92400e",
    icon: <ArrowDownCircle />,
  },
  {
    key: "wasteLoss",
    label: "Pérdida por merma",
    description: "Valor de productos perdidos por merma.",
    color: "#be123c",
    icon: <ReceiptText />,
  },
  {
    key: "operatingResult",
    label: "Resultado operativo",
    description: "Utilidad menos gastos y pérdidas por merma.",
    color: "#4f46e5",
    icon: <DollarSign />,
  },
];
type MetricKey = Exclude<keyof DashboardMetrics, "orders" | "units">;
const metricStorageKey = "kontia_dashboard_metrics";
const defaultMetricKeys: MetricKey[] = [
  "grossSales",
  "netSales",
  "refunds",
  "netCashSales",
  "netTransferSales",
  "profit",
  "expenses",
  "wasteLoss",
  "operatingResult",
];
function storedMetricKeys(): MetricKey[] {
  try {
    const stored = JSON.parse(localStorage.getItem(metricStorageKey) ?? "null");
    const valid = new Set(metricOptions.map((option) => option.key));
    return Array.isArray(stored)
      ? stored.filter((key): key is MetricKey => valid.has(key))
      : defaultMetricKeys;
  } catch {
    return defaultMetricKeys;
  }
}
const typeLabels: Record<string, string> = {
  capitalInjection: "Inyección de capital",
  sessionClose: "Cierres de caja",
  operatingExpense: "Gastos operativos",
  inventoryReinvestment: "Reinversión en inventario",
  ownerWithdrawal: "Retiros del propietario",
  saleRefund: "Reintegros",
  positiveAdjustment: "Ajustes positivos",
  negativeAdjustment: "Ajustes negativos",
  salary: "Salarios",
  bonus: "Bonificaciones",
  tax: "Impuestos",
  rent: "Alquiler",
  utilities: "Servicios",
  marketing: "Marketing",
  supplies: "Suministros",
  maintenance: "Mantenimiento",
  transportation: "Transporte",
  software: "Software",
  other: "Otros",
};

function rangeFor(key: RangeKey) {
  const today = new Date(),
    week = { weekStartsOn: 1 as const };
  let from: Date | undefined, to: Date | undefined;
  if (key === "thisMonth")
    [from, to] = [startOfMonth(today), endOfMonth(today)];
  if (key === "lastMonth") {
    const day = subMonths(today, 1);
    [from, to] = [startOfMonth(day), endOfMonth(day)];
  }
  if (key === "thisWeek")
    [from, to] = [startOfWeek(today, week), endOfWeek(today, week)];
  if (key === "lastWeek") {
    const day = subWeeks(today, 1);
    [from, to] = [startOfWeek(day, week), endOfWeek(day, week)];
  }
  return { from: from?.toISOString(), to: to?.toISOString() };
}

function Card({
  title,
  value,
  icon,
  tone = "emerald",
}: {
  title: string;
  value: string;
  icon: ReactNode;
  tone?: "emerald" | "red" | "amber" | "blue" | "violet";
}) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-700",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-blue-50 text-blue-700",
    violet: "bg-violet-50 text-violet-700",
  };
  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm">
      <span className={`inline-grid rounded-2xl p-2.5 ${tones[tone]}`}>
        {icon}
      </span>
      <p className="mt-3 text-sm font-bold text-slate-500">{title}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}

function Bars({
  title,
  entries,
  color = "#16a34a",
}: {
  title: string;
  entries: Array<[string, number]>;
  color?: string;
}) {
  const data: ChartData = {
    labels: entries.map(([label]) => label),
    datasets: [
      {
        label: "Monto",
        data: entries.map(([, value]) => value),
        backgroundColor: entries.map(([, value]) =>
          value < 0 ? "#dc2626" : color,
        ),
        borderColor: entries.map(([, value]) =>
          value < 0 ? "#dc2626" : color,
        ),
        borderRadius: 6,
      },
    ],
  };
  return (
    <Chart
      type="bar"
      title={title}
      data={data}
      height={360}
      options={{
        indexAxis: "y",
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: (context: any) => money(Number(context.raw)) },
          },
        },
        scales: { x: { beginAtZero: true } },
      }}
    />
  );
}

function TrendChart({
  rows,
  selected,
}: {
  rows: DashboardData["daily"];
  selected: MetricKey[];
}) {
  const series = metricOptions.filter((option) =>
    selected.includes(option.key),
  );
  const data: ChartData = {
    labels: rows.map((row) => row.day),
    datasets: series.map((option) => ({
      label: option.label,
      data: rows.map((row) => row[option.key]),
      borderColor: option.color,
      backgroundColor: option.color,
      fill: false,
      tension: 0.3,
    })),
  };
  return (
    <Chart
      type="line"
      title="Evolución de ventas y resultados"
      data={data}
      height={320}
      options={{
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            labels: { color: "#334155", font: { weight: "bold" } },
          },
          tooltip: {
            callbacks: {
              label: (context: any) =>
                `${context.dataset.label}: ${money(Number(context.raw))}`,
            },
          },
        },
        scales: { y: { beginAtZero: true } },
      }}
    />
  );
}

function FinancialFlowChart({
  rows,
}: {
  rows: DashboardData["finance"]["daily"];
}) {
  const data: ChartData = {
    labels: rows.map((row) => row.day),
    datasets: [
      {
        label: "Entradas",
        data: rows.map((row) => row.in),
        backgroundColor: "#16a34a",
        borderColor: "#16a34a",
      },
      {
        label: "Salidas",
        data: rows.map((row) => -row.out),
        backgroundColor: "#dc2626",
        borderColor: "#dc2626",
      },
      {
        label: "Neto",
        data: rows.map((row) => row.net),
        backgroundColor: "#2563eb",
        borderColor: "#2563eb",
      },
    ],
  };
  return (
    <Chart
      type="bar"
      title="Flujo de dinero del período"
      data={data}
      height={360}
      options={{
        interaction: { mode: "index", intersect: false },
        plugins: {
          tooltip: {
            callbacks: {
              label: (context: any) =>
                `${context.dataset.label}: ${money(Number(context.raw))}`,
            },
          },
        },
        scales: { y: { beginAtZero: false } },
      }}
    />
  );
}

function General({
  data,
  selected,
}: {
  data: DashboardData;
  selected: MetricKey[];
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metricOptions
          .filter((metric) => selected.includes(metric.key))
          .map((metric) => (
            <Card
              key={metric.key}
              title={metric.label}
              value={money(data.totals[metric.key])}
              icon={metric.icon}
              tone={
                metric.key === "refunds" ||
                metric.key === "expenses" ||
                metric.key === "wasteLoss"
                  ? "red"
                  : metric.key === "operatingResult"
                    ? "violet"
                    : "emerald"
              }
            />
          ))}
      </div>
      <TrendChart rows={data.daily} selected={selected} />
    </div>
  );
}

function Products({
  data,
  selected,
}: {
  data: DashboardData;
  selected: MetricKey[];
}) {
  const products = data.products.slice(0, 20);
  const options = metricOptions.filter(
    (option) => option.key !== "expenses" && selected.includes(option.key),
  );
  const chartData: ChartData = {
    labels: products.map((product) => product.productName),
    datasets: options.map((option) => ({
      label: option.label,
      data: products.map((product) => product[option.key]),
      backgroundColor: option.color,
      borderColor: option.color,
      borderRadius: 4,
    })),
  };
  return (
    <Chart
      type="bar"
      title="Resultados por producto"
      data={chartData}
      height={440}
      options={{
        interaction: { mode: "index", intersect: false },
        plugins: {
          tooltip: {
            callbacks: {
              label: (context: any) =>
                `${context.dataset.label}: ${money(Number(context.raw))}`,
            },
          },
        },
        scales: { y: { beginAtZero: true } },
      }}
    />
  );
}

function Finance({ data }: { data: DashboardData }) {
  const s = data.finance.summary;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card
          title="Saldo efectivo"
          value={money(s.cashBalance)}
          icon={<Banknote />}
        />
        <Card
          title="Saldo banco"
          value={money(s.bankBalance)}
          icon={<Landmark />}
          tone="blue"
        />
        <Card
          title="Total disponible"
          value={money(s.totalBalance)}
          icon={<WalletCards />}
          tone="violet"
        />
        <Card
          title="Entradas del período"
          value={money(s.totalIn)}
          icon={<ArrowUpCircle />}
        />
        <Card
          title="Salidas del período"
          value={money(s.totalOut)}
          icon={<ArrowDownCircle />}
          tone="red"
        />
        <Card
          title="Neto del período"
          value={money(s.netMovement)}
          icon={<TrendingUp />}
          tone={s.netMovement < 0 ? "red" : "blue"}
        />
        <Card
          title="Gastos operativos"
          value={money(s.operatingExpenses)}
          icon={<ReceiptText />}
          tone="red"
        />
        <Card
          title="Reinversión"
          value={money(s.inventoryReinvestment)}
          icon={<Boxes />}
          tone="amber"
        />
        <Card
          title="Retiros"
          value={money(s.ownerWithdrawals)}
          icon={<ArrowDownCircle />}
          tone="red"
        />
        <Card
          title="Reintegros"
          value={money(s.saleRefunds)}
          icon={<RotateCcw />}
          tone="red"
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Bars
          title="Movimientos por tipo"
          entries={Object.entries(data.finance.byType).map(([key, value]) => [
            typeLabels[key] ?? key,
            value,
          ])}
          color="#2563eb"
        />
        <Bars
          title="Gastos operativos por categoría"
          entries={Object.entries(data.finance.expensesByType).map(
            ([key, value]) => [typeLabels[key] ?? key, value],
          )}
          color="#92400e"
        />
        <FinancialFlowChart rows={data.finance.daily} />
        <Bars
          title="Saldo actual por ubicación"
          entries={[
            ["Efectivo", s.cashBalance],
            ["Banco", s.bankBalance],
          ]}
          color="#7c3aed"
        />
      </div>
    </div>
  );
}

const accountOperationLabels: Record<string, string> = {
  sale: "Ventas",
  saleRefund: "Reintegros de ventas",
  supplierInvoice: "Compras a proveedores",
  financialMovement: "Movimientos financieros",
  currencyExchange: "Cambios de moneda",
};

function Accounts({ settings }: { settings: MoneySettings }) {
  const reconciliation = settings.cashReconciliation ?? [],
    currencies = settings.currencies
      .filter((row) => row.isActive)
      .map((row) => row.currencyCode),
    balances = currencies.map((currencyCode) => {
      const rows = reconciliation.filter(
          (row) => row.currencyCode === currencyCode,
        ),
        inflowMinor = rows.reduce((sum, row) => sum + row.inflowMinor, 0),
        outflowMinor = rows.reduce((sum, row) => sum + row.outflowMinor, 0);
      return {
        currencyCode,
        inflowMinor,
        outflowMinor,
        balanceMinor: inflowMinor - outflowMinor,
      };
    }),
    totalBaseCents = reconciliation.reduce(
      (sum, row) =>
        sum + Number(row.inflowBaseCents) - Number(row.outflowBaseCents),
      0,
    );
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {balances.map((row) => (
          <div
            key={row.currencyCode}
            className="rounded-3xl bg-white p-5 shadow-sm"
          >
            <div className="flex items-center gap-2 text-sm font-black uppercase text-emerald-700">
              <Banknote size={18} /> Efectivo {row.currencyCode}
            </div>
            <p className="mt-3 text-3xl font-black">
              {(row.balanceMinor / 100).toLocaleString("es")} {row.currencyCode}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Entradas {(row.inflowMinor / 100).toLocaleString("es")} · Salidas{" "}
              {(row.outflowMinor / 100).toLocaleString("es")}
            </p>
          </div>
        ))}
        <Card
          title={`Total equivalente en ${settings.baseCurrency}`}
          value={money(totalBaseCents)}
          icon={<WalletCards />}
          tone="violet"
        />
      </div>
      <div className="overflow-x-auto rounded-3xl bg-white shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="text-lg font-black">Conciliación de efectivo</h2>
          <p className="text-sm text-slate-500">
            Saldo acumulado de operaciones históricas y actuales.
          </p>
        </div>
        <table className="w-full min-w-[650px] text-left">
          <thead className="text-xs uppercase text-slate-400">
            <tr>
              <th className="px-5 py-4">Moneda</th>
              <th>Origen</th>
              <th>Entradas</th>
              <th>Salidas</th>
              <th>Saldo neto</th>
            </tr>
          </thead>
          <tbody>
            {reconciliation.map((row) => (
              <tr
                key={`${row.currencyCode}-${row.operationType}`}
                className="border-t"
              >
                <td className="px-5 py-4 font-black">{row.currencyCode}</td>
                <td>
                  {accountOperationLabels[row.operationType] ??
                    row.operationType}
                </td>
                <td className="font-bold text-emerald-700">
                  {(row.inflowMinor / 100).toLocaleString("es")}{" "}
                  {row.currencyCode}
                </td>
                <td className="font-bold text-red-600">
                  {(row.outflowMinor / 100).toLocaleString("es")}{" "}
                  {row.currencyCode}
                </td>
                <td className="font-black">
                  {((row.inflowMinor - row.outflowMinor) / 100).toLocaleString(
                    "es",
                  )}{" "}
                  {row.currencyCode}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Inventory({ data }: { data: DashboardData }) {
  const warehouses = data.inventory.locations
      .filter((l) => l.type === "warehouse")
      .reduce((sum, l) => sum + l.valueCents, 0),
    pos = data.inventory.locations
      .filter((l) => l.type === "point_of_sale")
      .reduce((sum, l) => sum + l.valueCents, 0);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card
          title="Valor en almacenes"
          value={money(warehouses)}
          icon={<Archive />}
        />
        <Card
          title="Valor en puntos de venta"
          value={money(pos)}
          icon={<CreditCard />}
          tone="blue"
        />
        <Card
          title="Valor total de inventario"
          value={money(data.inventory.totalValueCents)}
          icon={<Boxes />}
          tone="violet"
        />
        <Card
          title="Merma en almacenes"
          value={money(data.inventory.warehouseCents)}
          icon={<ReceiptText />}
          tone="red"
        />
        <Card
          title="Merma en POS"
          value={money(data.inventory.posCents)}
          icon={<ReceiptText />}
          tone="red"
        />
        <Card
          title="Merma total"
          value={money(data.inventory.totalWasteCents)}
          icon={<ReceiptText />}
          tone="red"
        />
      </div>
      <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
        El valor actual ya refleja las mermas descontadas de cada lote. Las
        tarjetas de merma muestran la pérdida registrada en el período y no
        vuelven a descontarse.
      </p>
      <Bars
        title="Valor de inventario por ubicación"
        entries={data.inventory.locations.map((l) => [l.name, l.valueCents])}
        color="#16a34a"
      />
    </div>
  );
}

function ReportParameters({
  selected,
  onApply,
  onClose,
}: {
  selected: MetricKey[];
  onApply: (keys: MetricKey[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(selected);
  function toggle(key: MetricKey) {
    setDraft((current) =>
      current.includes(key)
        ? current.filter((selectedKey) => selectedKey !== key)
        : [...current, key],
    );
  }
  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-950/45 p-4">
      <div className="mx-auto my-8 w-full max-w-3xl rounded-[2rem] bg-white p-7 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black">Parámetros del reporte</h2>
            <p className="mt-1 text-sm text-slate-500">
              Selecciona los datos que quieres ver en los indicadores y gráficos
              del dashboard.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-2xl text-slate-400"
          >
            ×
          </button>
        </div>
        <div className="mt-5 rounded-2xl bg-slate-50 p-4">
          <p className="font-black">{draft.length} parámetros seleccionados</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setDraft(metricOptions.map((option) => option.key))
              }
              className="rounded-xl border bg-white px-3 py-2 text-sm font-black"
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setDraft(defaultMetricKeys)}
              className="rounded-xl border bg-white px-3 py-2 text-sm font-black"
            >
              Predeterminados
            </button>
            <button
              type="button"
              onClick={() => setDraft([])}
              className="rounded-xl border bg-white px-3 py-2 text-sm font-black"
            >
              Limpiar
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {metricOptions.map((option) => (
            <label
              key={option.key}
              className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4"
            >
              <input
                type="checkbox"
                className="peer sr-only"
                checked={draft.includes(option.key)}
                onChange={() => toggle(option.key)}
              />
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded border-2 border-slate-400 text-transparent peer-checked:border-emerald-700 peer-checked:bg-emerald-700 peer-checked:text-white">
                <Check size={14} strokeWidth={4} />
              </span>
              <span
                className="mt-1 h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: option.color }}
              />
              <span>
                <span className="block text-sm font-black">{option.label}</span>
                <span className="mt-1 block text-xs font-semibold leading-4 text-slate-500">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 font-black text-slate-500"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onApply(draft)}
            className="rounded-xl bg-emerald-700 px-5 py-2.5 font-black text-white"
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const [tab, setTab] = useState<Tab>("general"),
    [range, setRange] = useState<RangeKey>("all"),
    [data, setData] = useState<DashboardData | null>(null),
    [moneySettings, setMoneySettings] = useState<MoneySettings | null>(null),
    [error, setError] = useState(""),
    [selectedMetrics, setSelectedMetrics] =
      useState<MetricKey[]>(storedMetricKeys),
    [parametersOpen, setParametersOpen] = useState(false);
  const dates = useMemo(() => rangeFor(range), [range]);
  useEffect(() => {
    setData(null);
    setMoneySettings(null);
    setError("");
    void Promise.all([api.dashboard(dates.from, dates.to), api.moneySettings()])
      .then(([dashboard, money]) => {
        setData(dashboard);
        setMoneySettings(money);
      })
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "No se pudo cargar el dashboard",
        ),
      );
  }, [dates]);
  useEffect(() => {
    localStorage.setItem(metricStorageKey, JSON.stringify(selectedMetrics));
  }, [selectedMetrics]);
  const tabs: Array<[Tab, string]> = [
      ["general", "General"],
      ["products", "Productos"],
      ["finance", "Finanzas"],
      ["accounts", "Cuentas"],
      ["inventory", "Inventario"],
    ],
    ranges: Array<[RangeKey, string]> = [
      ["all", "Todo"],
      ["thisMonth", "Este mes"],
      ["lastMonth", "Mes pasado"],
      ["thisWeek", "Esta semana"],
      ["lastWeek", "Semana pasada"],
    ];
  return (
    <section>
      <p className="text-sm font-black uppercase tracking-wider text-emerald-700">
        Resumen
      </p>
      <h1 className="mt-1 text-3xl font-black">Dashboard</h1>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <p className="mt-2 text-slate-500">
          Ventas, rentabilidad, finanzas e inventario en un solo lugar.
        </p>
        {(tab === "general" || tab === "products") && (
          <button
            type="button"
            onClick={() => setParametersOpen(true)}
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-black text-slate-600 shadow-sm"
          >
            <SlidersHorizontal size={18} /> Parámetros del reporte
          </button>
        )}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {ranges.map(([key, label]) => (
          <button
            type="button"
            key={key}
            onClick={() => setRange(key)}
            className={`rounded-xl border px-3 py-2 text-sm font-black ${range === key ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-200 bg-white text-slate-600"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-5 flex gap-2 overflow-x-auto border-b border-slate-200">
        {tabs.map(([key, label]) => (
          <button
            type="button"
            key={key}
            onClick={() => setTab(key)}
            className={`shrink-0 border-b-4 px-4 py-3 font-black ${tab === key ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-400"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p className="mt-6 rounded-2xl bg-red-50 p-4 font-bold text-red-700">
          {error}
        </p>
      )}
      {(!data || !moneySettings) && !error && (
        <PageSpinner label="Calculando indicadores…" />
      )}
      {data && moneySettings && (
        <div className="mt-6">
          {tab === "general" && (
            <General data={data} selected={selectedMetrics} />
          )}
          {tab === "products" && (
            <Products data={data} selected={selectedMetrics} />
          )}
          {tab === "finance" && <Finance data={data} />}
          {tab === "accounts" && <Accounts settings={moneySettings} />}
          {tab === "inventory" && <Inventory data={data} />}
        </div>
      )}
      {parametersOpen && (
        <ReportParameters
          selected={selectedMetrics}
          onClose={() => setParametersOpen(false)}
          onApply={(keys) => {
            setSelectedMetrics(keys);
            setParametersOpen(false);
          }}
        />
      )}
    </section>
  );
}
