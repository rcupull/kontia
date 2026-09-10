import { useEffect, useState } from "react";
import { LayoutDashboard, LogOut, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Chart } from "../components/chart";
import { PageSpinner } from "../components/Spinner";

type Data = Awaited<ReturnType<typeof api.myInvestment>>;
export function MyInvestmentPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    void api
      .myInvestment()
      .then(setData)
      .catch((reason: Error) => setError(reason.message));
  }, []);
  async function logout() {
    await api.logout();
    setUser(null);
    navigate("/");
  }
  if (error)
    return (
      <main className="grid min-h-screen place-items-center bg-[#f3f5f2] p-5">
        <div className="max-w-lg rounded-3xl bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-black">Mi inversión</h1>
          <p className="mt-3 text-red-700">{error}</p>
          <button
            onClick={() => void logout()}
            className="mt-5 font-black text-emerald-700"
          >
            Cerrar sesión
          </button>
        </div>
      </main>
    );
  if (!data) return <PageSpinner label="Cargando mi inversión…" />;
  const money = (cents: number) =>
    new Intl.NumberFormat("es", {
      style: "currency",
      currency: data.baseCurrency,
    }).format(cents / 100);
  const movementLabel: Record<string, string> = {
    openingCapital: "Capital inicial",
    contribution: "Aporte",
    profitDistribution: "Ganancia distribuida",
    capitalWithdrawal: "Retiro de capital",
    priorLiabilityCorrection: "Corrección de deuda previa",
  };
  const cards = [
    ["Patrimonio atribuible", money(data.investor.currentPatrimonyCents)],
    [
      "Participación",
      `${(data.investor.ownershipBps / 100).toLocaleString("es", { maximumFractionDigits: 2 })}%`,
    ],
    ["Rendimiento acumulado", money(data.investor.accumulatedReturnCents)],
    [
      "Rentabilidad simple",
      `${(data.investor.returnBps / 100).toLocaleString("es", { maximumFractionDigits: 2 })}%`,
    ],
  ];
  return (
    <main className="min-h-screen bg-[#f3f5f2] text-slate-900">
      <header className="flex items-center gap-3 border-b bg-white px-5 py-4 sm:px-8">
        <span className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
          <TrendingUp />
        </span>
        <div>
          <p className="font-black">Mi inversión</p>
          <p className="text-sm text-slate-500">
            {user?.displayName} · {data.investor.name}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {(user?.role === "owner" || user?.role === "manager") && (
            <button
              onClick={() => navigate("/admin")}
              className="flex items-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-sm font-bold text-white"
            >
              <LayoutDashboard size={16} />
              <span className="hidden sm:inline">Administración</span>
            </button>
          )}
          <button
            onClick={() => void logout()}
            className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold"
          >
            <LogOut size={16} />
            Salir
          </button>
        </div>
      </header>
      <section className="mx-auto max-w-7xl p-4 sm:p-8">
        <div>
          <p className="text-sm font-black uppercase tracking-wider text-emerald-700">
            Resumen privado
          </p>
          <h1 className="mt-1 text-3xl font-black">{data.investor.name}</h1>
          <p className="mt-2 text-slate-500">
            Valor estimado a partir de la tesorería, el inventario al costo y
            los activos fijos netos.
          </p>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(([label, value]) => (
            <div key={label} className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm font-bold text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-black">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          <Chart
            type="line"
            title="Crecimiento del patrimonio"
            data={{
              labels: data.series.capital.map((r) => r.day),
              datasets: [
                {
                  label: data.baseCurrency,
                  data: data.series.capital.map((r) => r.patrimonyCents / 100),
                  borderColor: "#047857",
                  backgroundColor: "#d1fae5",
                  tension: 0.25,
                },
              ],
            }}
          />
          <Chart
            type="bar"
            title="Ventas del negocio · últimos 90 días"
            data={{
              labels: data.series.sales.map((r) => r.day),
              datasets: [
                {
                  label: data.baseCurrency,
                  data: data.series.sales.map((r) => r.salesCents / 100),
                  backgroundColor: "#0ea5e9",
                },
              ],
            }}
          />
          <Chart
            type="bar"
            title="Mis aportes y retiros"
            data={{
              labels: [...data.movements]
                .reverse()
                .map((r) => new Date(r.entryDate).toLocaleDateString("es")),
              datasets: [
                {
                  label: data.baseCurrency,
                  data: [...data.movements]
                    .reverse()
                    .map(
                      (r) =>
                        (r.entryType === "contribution" ||
                        r.entryType === "openingCapital"
                          ? r.amountCents
                          : -r.amountCents) / 100,
                    ),
                  backgroundColor: [...data.movements]
                    .reverse()
                    .map((r) =>
                      r.entryType === "contribution" ||
                      r.entryType === "openingCapital"
                        ? "#059669"
                        : "#dc2626",
                    ),
                },
              ],
            }}
          />
        </div>
        <div className="mt-6 overflow-x-auto rounded-3xl bg-white shadow-sm">
          <h2 className="p-5 text-xl font-black">Movimientos</h2>
          <table className="w-full min-w-[620px] text-left">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="px-5 py-3">Fecha</th>
                <th>Concepto</th>
                <th>Importe</th>
                <th>Notas</th>
              </tr>
            </thead>
            <tbody>
              {data.movements.map((row) => {
                const incoming =
                  row.entryType === "openingCapital" ||
                  row.entryType === "contribution";
                return (
                  <tr key={row.id} className="border-t">
                    <td className="px-5 py-4">
                      {new Date(row.entryDate).toLocaleString("es")}
                    </td>
                    <td className="font-bold">
                      {movementLabel[row.entryType] ?? row.entryType}
                    </td>
                    <td
                      className={`font-black ${incoming ? "text-emerald-700" : "text-red-600"}`}
                    >
                      {incoming ? "+" : "−"}
                      {money(row.amountCents)}
                    </td>
                    <td>{row.notes || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
