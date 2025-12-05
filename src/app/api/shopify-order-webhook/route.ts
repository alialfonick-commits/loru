// src/app/api/webhooks/orders/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import ShopifyOrder from "@/models/ShopifyOrder";
import mongoose from "mongoose";

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

function verifySignature(rawBody: string, signatureHeader?: string | null) {
  if (!WEBHOOK_SECRET) return true;
  if (!signatureHeader) return false;
  const expected = crypto.createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");
  const provided = signatureHeader.replace(/^sha256=/, "");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"));
  } catch (err: any) {
    // annotate err as any to satisfy TS strict catch typing
    console.warn("Timing safe compare failed:", err);
    return false;
  }
}

function normalizeStatus(raw?: string | null) {
  if (!raw) return "unknown";
  const s = String(raw).trim().toLowerCase();
  if (s === "received") return "received";
  if (s === "printready") return "printready";
  if (s === "error") return "error";
  if (s === "shipped") return "shipped";
  if (s.includes("submission error")) return "error";
  return s;
}

function buildCandidates(...vals: Array<string | null | undefined>) {
  const out: string[] = [];
  for (const v of vals) {
    if (!v) continue;
    const s = String(v).trim();
    if (!s) continue;
    out.push(s);
    const m = s.match(/^Keepr_(.+)$/i);
    if (m && m[1]) out.push(m[1]);
  }
  return Array.from(new Set(out));
}

async function findOrderByCandidates(candidates: string[] | undefined | null): Promise<any | null> {
  if (!candidates || candidates.length === 0) return null;
  // 1) match by sourceOrderId (string)
  for (const c of candidates) {
    if (!c) continue;
    try {
      const doc = await ShopifyOrder.findOne({ sourceOrderId: String(c) }).lean();
      if (doc) return doc;
    } catch (err: any) {
      console.warn("Error matching by sourceOrderId:", c, err);
    }
  }

  // 2) match by order_id
  for (const c of candidates) {
    if (!c) continue;
    try {
      const doc = await ShopifyOrder.findOne({ order_id: String(c) }).lean();
      if (doc) return doc;
    } catch (err: any) {
      console.warn("Error matching by order_id:", c, err);
    }
  }

  // 3) match by _id if looks like ObjectId
  for (const c of candidates) {
    if (!c) continue;
    if (!mongoose.Types.ObjectId.isValid(c)) continue;
    try {
      const doc = await ShopifyOrder.findOne({ _id: new mongoose.Types.ObjectId(c) }).lean();
      if (doc) return doc;
    } catch (err: any) {
      console.warn("Error matching by _id:", c, err);
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();

    const signatureHeader =
      req.headers.get("x-signature") ||
      req.headers.get("x-hub-signature") ||
      req.headers.get("x-oneflow-signature") ||
      null;

    if (!verifySignature(raw, signatureHeader)) {
      console.warn("Webhook signature verification failed.");
      return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
    }

    let payload: any;
    try {
      payload = JSON.parse(raw);
    } catch (err: any) {
      console.warn("Invalid JSON payload in webhook.", err);
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    // --- Extract status and various id fields from many possible locations ---
    const statusRaw =
      payload.OrderStatus ??
      payload.status ??
      payload.order_status ?? // accept snake_case
      payload.data?.orderData?.status ??
      null;

    const sourceOrderIdRaw =
      payload.SourceOrderId ??
      payload.sourceOrderId ??
      payload.sourceAccountId ?? // sometimes used
      payload.data?.orderData?.sourceOrderId ??
      (payload._id && (payload._id.$oid ?? payload._id)) ?? // accept {_id: { $oid: "..." }}
      null;

    const orderIdRaw =
      payload.OrderId ??
      payload.orderId ??
      payload.order_id ?? // accept order_id
      null;

    const trackingNumber = payload.TrackingNumber ?? payload.trackingNumber ?? null;

    const candidates = buildCandidates(sourceOrderIdRaw, orderIdRaw);

    const status = normalizeStatus(statusRaw);

    console.log("Webhook received:", {
      status,
      statusRaw,
      candidates,
      trackingNumber,
    });

    await connectDB();

    // Try to find existing order document by the candidates (more readable helper)
    const foundDoc = await findOrderByCandidates(candidates);

    if (!foundDoc) {
      console.warn("No matching order document found for webhook. Candidates:", candidates);
      // Option: create placeholder document here if you want, but for now return note
      return NextResponse.json({ ok: true, note: "no-matching-doc" });
    }

    // Build status entry
    const statusEntry = { status, received_at: new Date(), payload };

    // Determine whether we should push to status_history (avoid duplicate consecutive)
    let shouldPush = true;
    try {
      const lastEntry = (foundDoc.status_history && foundDoc.status_history.length > 0)
        ? foundDoc.status_history[foundDoc.status_history.length - 1]
        : null;
      const lastStatus = lastEntry?.status ?? null;
      if (lastStatus === status) {
        shouldPush = false;
      }
    } catch (err: any) {
      console.warn("Failed to inspect last status:", err);
      // default: allow push
      shouldPush = true;
    }

    // Compose update operations
    const updateOps: Record<string, any> = {
      $set: { order_status: status, updated_at: new Date() },
    };
    if (shouldPush) updateOps.$push = { status_history: statusEntry };

    // If tracking present, also push shipments (we'll push shipments regardless of duplicate status)
    if (trackingNumber) {
      updateOps.$push = updateOps.$push || {};
      updateOps.$push.shipments = {
        trackingNumber: String(trackingNumber),
        received_at: new Date(),
        raw: payload,
      };
      updateOps.$set.updated_at = new Date();
    }

    // Apply update
    try {
      await ShopifyOrder.updateOne({ _id: foundDoc._id }, updateOps);
      console.log("Webhook processed — updated order:", foundDoc._id ?? foundDoc.order_id, "status:", status, "pushed_history:", shouldPush);
    } catch (err: any) {
      console.error("Failed to update order document:", err);
      return NextResponse.json({ ok: false, error: "DB update failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Webhook processing failed:", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}