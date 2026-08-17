import { useAuth } from "./auth";
import { AuthPage } from "./pages/AuthPage";
import { InventoryPage } from "./pages/InventoryPage";

export default function App() {
  const { loading, user } = useAuth();
  if (loading) return <main className="grid min-h-screen place-items-center bg-[#f5f7f4] font-black text-emerald-800">Cargando Kontia…</main>;
  return user ? <InventoryPage /> : <AuthPage />;
}
