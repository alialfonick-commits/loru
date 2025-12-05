
import Header from "../components/header";
import OrdersTable from "../components/order-table";
import Sidebar from "../components/sidebar";


export default function DashboardPage() {
  return ( 
    <div className="bg-linear-to-b from-indigo-50 to-gray-100
    grid md:grid-cols-[18rem_1fr] grid-cols-1 md:gap-10">

      <Sidebar />

      <div className="flex flex-col h-screen">
        <Header />

        <main className="md:px-8 px-4 py-6">
          <OrdersTable />
        </main>
      </div>
    </div>
  );
}
