// app/dashboard/page.tsx
import React from "react";
import Sidebar from "../components/sidebar";
import Header from "../components/header";
import OrdersTable from "../components/order-table";

import { connectDB } from "@/lib/mongodb";
import ShopifyOrder from "@/models/ShopifyOrder";

type LineItemForUI = {
  id: string;
  title?: string;
  quantity?: number;
  audio?: string | null;
  sourceItemId?: string;
};

type OrderWithItems = {
  id: string;
  status: string;
  date?: string;
  lineitems: LineItemForUI[];
};

function formatDate(d?: Date | string | null) {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default async function DashboardPage() {
  await connectDB();

  const docs = await ShopifyOrder.find({})
    .sort({ created_at: -1 })
    .limit(50)
    .lean();

  const orders: OrderWithItems[] = (docs || []).map((doc: any) => {
    const id = doc.sourceOrderId || doc.order_id || doc._id || String(doc._id);
    const status = doc.order_status || "Unknown";
    const createdAt = doc.created_at || doc.shopify_summary?.created_at || null;
    const date = createdAt ? formatDate(createdAt) : "";

    // Build an array of lineitems: prefer doc.lineitems, fallback to doc.line_items
    const rawItems = Array.isArray(doc.lineitems) && doc.lineitems.length > 0
      ? doc.lineitems
      : Array.isArray(doc.line_items) && doc.line_items.length > 0
      ? doc.line_items
      : [];

    // audio urls: prefer files matched by line_item_id
    const filesByLineItem: Record<string, string[]> = {};
    if (Array.isArray(doc.files)) {
      for (const f of doc.files) {
        if (!f.line_item_id) continue;
        filesByLineItem[f.line_item_id] = filesByLineItem[f.line_item_id] || [];
        if (f.uploadedfileUrl) filesByLineItem[f.line_item_id].push(f.uploadedfileUrl);
      }
    }

    const lineitems: LineItemForUI[] = rawItems.map((li: any) => {
      const liId = li.line_item_id ?? li.id ?? li.sourceItemId ?? String(li._id ?? "");
      const audio = (filesByLineItem[liId] && filesByLineItem[liId][0]) ?? li.uploadedfileUrl ?? null;
      return {
        id: liId || "unknown",
        title: li.title ?? li.name ?? li.product_name ?? "Item",
        quantity: Number(li.quantity ?? li.qty ?? 1),
        audio,
        sourceItemId: li.sourceItemId ?? undefined,
      };
    });

    return { id, status, date, lineitems };
  });

  return (
    <div className="flex min-h-screen bg-linear-to-b from-indigo-50 to-gray-100">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="px-8 py-6">
          <OrdersTable orders={orders} />
        </main>
      </div>
    </div>
  );
}