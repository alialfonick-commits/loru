// components/order-table.tsx
"use client";

import React, { useState } from "react";

export type LineItemForUI = {
  id: string;
  title?: string;
  quantity?: number;
  audio?: string | null;
  sourceItemId?: string;
};

export type OrderWithItems = {
  id: string;
  sourceOrderId?: string | null;
  order_id?: string | null;
  status?: string;
  date?: string;
  siteflow_url?: string | null;
  tracking?: string | null;
  lineitems: LineItemForUI[];
};

export default function OrdersTable({ orders }: { orders: OrderWithItems[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (id: string) => setExpanded((s) => ({ ...s, [id]: !s[id] }));

  return (
    <div className="rounded-xl border border-gray-200 shadow-[0px_0px_12px_1px_#d8d9d3] overflow-hidden">
      <h2 className="text-xl font-semibold pb-4 pt-4 px-4 border-b border-gray-300">Recent Orders</h2>

      <table className="w-full border-collapse text-sm [&_th]:text-left [&_th]:px-4 [&_th]:py-3 [&_th]:text-gray-600">
        <thead className="bg-gray-50 border-b border-gray-300">
          <tr>
            <th></th>
            <th>#Order</th>
            <th>Status</th>
            <th>Items</th>
            <th>Tracking</th>
            <th>SiteFlow</th>
            <th>Date</th>
          </tr>
        </thead>

        <tbody
          className="
            [&>tr]:border-b
            [&>tr]:border-gray-300
            [&>tr:hover]:bg-gray-50
            [&_td]:px-4 [&_td]:py-3
            [&_tr:last-child]:border-b-0
            [&_tr:nth-child(even)]:bg-gray-50
          "
        >
          {orders.map((order) => {
            const isOpen = Boolean(expanded[order.id]);
            return (
              <React.Fragment key={order.id}>
                <tr>
                  <td className="w-12">
                    <button
                      onClick={() => toggle(order.id)}
                      aria-label={isOpen ? "Collapse" : "Expand"}
                      className="p-1 rounded hover:bg-gray-100"
                    >
                      {isOpen ? "▾" : "▸"}
                    </button>
                  </td>

                  <td className="font-medium break-words max-w-[12rem]">{order.id}</td>

                  <td>
                    <span
                      className={`px-3 py-1 text-xs rounded-full ${
                        (order.status ?? "").toLowerCase() === "created" ||
                        (order.status ?? "").toLowerCase() === "received" ||
                        (order.status ?? "").toLowerCase() === "printready"
                          ? "bg-yellow-100 text-yellow-700"
                          : (order.status ?? "").toLowerCase() === "completed" ||
                            (order.status ?? "").toLowerCase() === "shipped"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {order.status}
                    </span>
                  </td>

                  <td>{order.lineitems.length} item{order.lineitems.length !== 1 ? "s" : ""}</td>

                  <td>{order.tracking ? <span className="text-sm">{order.tracking}</span> : <span className="text-gray-400">—</span>}</td>

                  <td>
                    {order.siteflow_url ? (
                      <a
                        href={order.siteflow_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-600 underline text-sm"
                      >
                        View
                      </a>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>

                  <td>{order.date}</td>
                </tr>

                {isOpen && (
                  <tr>
                    <td colSpan={7} className="bg-gray-50 px-6 py-4">
                      <div className="space-y-3">
                        {order.lineitems.map((li) => (
                          <div key={li.id} className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <div className="text-sm font-medium">{li.title}</div>
                              <div className="text-xs text-gray-500">× {li.quantity ?? 1}</div>
                              {li.sourceItemId && <div className="text-xs text-gray-400 ml-2">({li.sourceItemId})</div>}
                            </div>

                            <div className="flex items-center gap-4">
                              {li.audio ? (
                                // inline audio player + download link
                                <div className="flex items-center gap-3">
                                  <audio controls className="h-6">
                                    <source src={li.audio} />
                                    Your browser does not support the audio element.
                                  </audio>
                                  <a href={li.audio} target="_blank" rel="noreferrer" className="text-indigo-600 underline text-sm">
                                    Open
                                  </a>
                                </div>
                              ) : (
                                <span className="text-sm text-gray-500">No audio</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}