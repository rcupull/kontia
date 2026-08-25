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
import { PosPage } from "./pages/PosPage";
import { DashboardPage } from "./pages/DashboardPage";
import { UsersPage } from "./pages/UsersPage";
import { BusinessesPage } from "./pages/BusinessesPage";
import { MoneyPage } from "./pages/MoneyPage";
import {
  CashSessionsPage,
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
        <Route path="money" element={<MoneyPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="businesses" element={<BusinessesPage />} />
        <Route path="maintenance" element={<MaintenancePage />} />
        <Route path="settings" element={<BusinessesPage />} />
      </Route>
      <Route path="/pos" element={<PosPage />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
