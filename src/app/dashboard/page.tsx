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
  id: string; // display id (order_id | sourceOrderId | _id)
  sourceOrderId?: string | null;
  order_id?: string | null;
  status?: string;
  date?: string;
  siteflow_url?: string | null;
  tracking?: string | null;
  lineitems: LineItemForUI[];
};

function formatDate(d?: Date | string | null) {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default async function DashboardPage() {
  await connectDB();

  // fetch most recent 50 orders (adjust as needed)
  const docs = await ShopifyOrder.find({})
    .sort({ created_at: -1 })
    .limit(50)
    .lean();

  const orders: OrderWithItems[] = (docs || []).map((doc: any) => {
    // display id preference: order_id -> sourceOrderId -> _id
    const displayId = doc.order_id || doc.sourceOrderId || String(doc._id);

    const status = doc.order_status || "unknown";
    const createdAt = doc.created_at || doc.shopify_summary?.created_at || null;
    const date = createdAt ? formatDate(createdAt) : "";

    // build files mapping by line_item_id for audio links
    const filesByLineItem: Record<string, string[]> = {};
    if (Array.isArray(doc.files)) {
      for (const f of doc.files) {
        if (!f.line_item_id) continue;
        filesByLineItem[f.line_item_id] = filesByLineItem[f.line_item_id] || [];
        if (f.uploadedfileUrl) filesByLineItem[f.line_item_id].push(f.uploadedfileUrl);
      }
    }

    // pick rawItems preferring doc.lineitems, then doc.line_items
    const rawItems = Array.isArray(doc.lineitems) && doc.lineitems.length > 0
      ? doc.lineitems
      : Array.isArray(doc.line_items) && doc.line_items.length > 0
        ? doc.line_items
        : [];

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

    // tracking maybe stored under shipments array
    let tracking: string | null = null;
    if (Array.isArray(doc.shipments) && doc.shipments.length > 0) {
      const last = doc.shipments[doc.shipments.length - 1];
      tracking = last?.trackingNumber ?? last?.tracking ?? null;
    } else if (doc.tracking_number) {
      tracking = doc.tracking_number;
    }

    return {
      id: displayId,
      sourceOrderId: doc.sourceOrderId ?? null,
      order_id: doc.order_id ?? null,
      status,
      date,
      siteflow_url: doc.siteflow_url ?? null,
      tracking,
      lineitems,
    };
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