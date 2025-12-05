export default function OrdersTable() {
  const orders = [
    { id: "102", status: "Pending", audio: "Link", date: "Feb 10" },
    { id: "101", status: "Completed", audio: "Link", date: "Feb 09" },
    { id: "100", status: "Failed", audio: "Link", date: "Feb 05" },
  ];

  return (
    <div className="rounded-xl border border-gray-200 shadow-[0px_0px_12px_1px_#d8d9d3] overflow-hidden">
      <h2 className="text-xl font-semibold pb-4 pt-4 px-4 border-b border-gray-300">Recent Orders</h2>

      <table className="w-full border-collapse text-sm [&_th]:text-left [&_th]:px-4 [&_th]:py-3 [&_th]:text-gray-600">
        <thead className="bg-gray-50 border-b border-gray-300">
          <tr>
            <th>#Order</th>
            <th>Status</th>
            <th>Audio</th>
            <th>Date</th>
          </tr>
        </thead>

        <tbody
          className="
            [&>tr]:border-b
             [&>tr]:border-gray-300
            [&>tr:hover]:bg-gray-50
            [&_td]:px-4
            [&_td]:py-3
            [&_tr:last-child]:border-b-0
            [&_tr:nth-child(even)]:bg-gray-50
          "
        >
          {orders.map((row) => (
            <tr key={row.id}>
              <td className="font-medium">{row.id}</td>

              <td>
                <span
                  className={`px-3 py-1 text-xs rounded-full ${
                    row.status === "Pending"
                      ? "bg-yellow-100 text-yellow-700"
                      : row.status === "Completed"
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {row.status}
                </span>
              </td>

              <td className="text-indigo-600 underline cursor-pointer">
                {row.audio}
              </td>

              <td>{row.date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
