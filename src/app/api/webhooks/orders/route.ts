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
  } catch (err) {
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
    } catch (err) {
      console.warn("Invalid JSON payload in webhook.");
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const statusRaw = payload.OrderStatus ?? payload.status ?? null;
    const status = normalizeStatus(statusRaw);

    const sourceOrderIdRaw = payload.SourceOrderId ?? payload.sourceOrderId ?? payload.data?.orderData?.sourceOrderId ?? null;
    const orderIdRaw = payload.OrderId ?? payload.orderId ?? null;
    const trackingNumber = payload.TrackingNumber ?? payload.trackingNumber ?? null;

    const candidates = buildCandidates(sourceOrderIdRaw, orderIdRaw);
    console.log("Webhook received:", { status, candidates, trackingNumber });

    await connectDB();

    const statusEntry = { status, received_at: new Date(), payload };

    let foundDoc: any = null;

    // 1) Primary: try matching by sourceOrderId field (string)
    for (const c of candidates) {
      if (!c) continue;
      try {
        const updated = await ShopifyOrder.findOneAndUpdate(
          { sourceOrderId: String(c) },
          {
            $set: { order_status: status, updated_at: new Date() },
            $push: { status_history: statusEntry },
          },
          { new: true }
        ).lean();
        if (updated) {
          foundDoc = updated;
          console.log("Matched by sourceOrderId:", c);
          break;
        }
      } catch (err) {
        console.warn("Error matching by sourceOrderId:", c, err);
      }
    }

    // 2) Fallback: match by order_id
    if (!foundDoc) {
      for (const c of candidates) {
        if (!c) continue;
        try {
          const updated = await ShopifyOrder.findOneAndUpdate(
            { order_id: String(c) },
            {
              $set: { order_status: status, updated_at: new Date() },
              $push: { status_history: statusEntry },
            },
            { new: true }
          ).lean();
          if (updated) {
            foundDoc = updated;
            console.log("Matched by order_id:", c);
            break;
          }
        } catch (err) {
          console.warn("Error matching by order_id:", c, err);
        }
      }
    }

    // 3) Last resort: if candidate looks like ObjectId, try matching _id
    if (!foundDoc) {
      for (const c of candidates) {
        if (!c) continue;
        // only attempt ObjectId conversion if it looks like one
        if (!mongoose.Types.ObjectId.isValid(c)) continue;
        try {
          const updated = await ShopifyOrder.findOneAndUpdate(
            { _id: new mongoose.Types.ObjectId(c) },
            {
              $set: { order_status: status, updated_at: new Date() },
              $push: { status_history: statusEntry },
            },
            { new: true }
          ).lean();
          if (updated) {
            foundDoc = updated;
            console.log("Matched by _id(ObjectId):", c);
            break;
          }
        } catch (err) {
          console.warn("Error matching by _id:", c, err);
        }
      }
    }

    if (!foundDoc) {
      console.warn("No matching order document found for webhook. Candidates:", candidates);
      // If you want to auto-create a placeholder, do it here (currently we skip creation).
      return NextResponse.json({ ok: true, note: "no-matching-doc" });
    }

    // If found and tracking present, append shipments entry
    if (trackingNumber) {
      try {
        await ShopifyOrder.updateOne(
          { _id: foundDoc._id },
          {
            $push: {
              shipments: {
                trackingNumber: String(trackingNumber),
                received_at: new Date(),
                raw: payload,
              },
            },
            $set: { updated_at: new Date() },
          }
        );
        console.log("Appended shipment entry:", foundDoc._id, trackingNumber);
      } catch (err) {
        console.warn("Failed to push shipment info:", err);
      }
    }

    console.log("Webhook processed — updated order:", foundDoc._id ?? foundDoc.order_id, "status:", status);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Webhook processing failed:", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}