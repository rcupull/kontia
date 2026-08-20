import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { AdminLayout } from "./components/AdminLayout";
import { CategoriesPage } from "./pages/CategoriesPage";
import { AuthPage } from "./pages/AuthPage";
import { InventoryPage } from "./pages/InventoryPage";
import { InventoryAdminPage } from "./pages/InventoryAdminPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { SupplierInvoicesPage } from "./pages/SupplierInvoicesPage";
import { SuppliersPage } from "./pages/SuppliersPage";
import { LocationsPage } from "./pages/LocationsPage";
import { MaintenancePage } from "./pages/MaintenancePage";
import {
  CashSessionsPage,
  DashboardPage,
  FinancialMovementsPage,
  SalesPage,
} from "./pages/AdminDataPages";

export default function App() {
  const { loading, user } = useAuth();
  if (loading)
    return (
      <main className="grid min-h-screen place-items-center bg-[#f5f7f4] font-black text-emerald-800">
        Cargando Kontia…
      </main>
    );
  if (!user) return <AuthPage />;
  return (
    <Routes>
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="products" element={<InventoryPage />} />
        <Route
          path="compositions"
          element={
            <PlaceholderPage
              title="Composiciones"
              description="Productos compuestos, producción y desarme de combos."
            />
          }
        />
        <Route path="suppliers" element={<SuppliersPage />} />
        <Route path="supplier-invoices" element={<SupplierInvoicesPage />} />
        <Route path="inventory" element={<InventoryAdminPage />} />
        <Route path="locations" element={<LocationsPage />} />
        <Route path="orders" element={<SalesPage />} />
        <Route path="cash-sessions" element={<CashSessionsPage />} />
        <Route
          path="financial-movements"
          element={<FinancialMovementsPage />}
        />
        <Route
          path="users"
          element={
            <PlaceholderPage
              title="Usuarios"
              description="Usuarios, roles, permisos y estado de acceso."
            />
          }
        />
        <Route
          path="businesses"
          element={
            <PlaceholderPage
              title="Negocios"
              description="Administración de negocios y configuración fiscal."
            />
          }
        />
        <Route path="maintenance" element={<MaintenancePage />} />
        <Route
          path="settings"
          element={
            <PlaceholderPage
              title="Configuración"
              description="Moneda, impuestos y preferencias del punto de venta."
            />
          }
        />
      </Route>
      <Route
        path="/pos"
        element={
          <PlaceholderPage
            title="Punto de venta"
            description="El nuevo POS conectado a D1 será el siguiente bloque operativo."
          />
        }
      />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
