
import Header from "../components/header";
import OrdersTable from "../components/order-table";
import Sidebar from "../components/sidebar";


export default function DashboardPage() {
  return (
    <div className="flex min-h-screen bg-linear-to-b from-indigo-50 to-gray-100">
      <Sidebar />

      <div className="flex-1 flex flex-col">
        <Header />

        <main className="px-8 py-6">
          <OrdersTable />
        </main>
      </div>
    </div>
  );
}
