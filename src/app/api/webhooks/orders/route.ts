// src/app/api/webhooks/orders/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import ShopifyOrder from "@/models/ShopifyOrder";

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
  if (s === "order submission error" || s.includes("submission error")) return "error";
  return s;
}

/**
 * Try to generate candidate ids to match against _id.
 * Includes the raw values and values with a "Keepr_" prefix removed (if present).
 */
function buildIdCandidates(...vals: Array<string | null | undefined>) {
  const out: string[] = [];
  for (const v of vals) {
    if (!v) continue;
    const s = String(v).trim();
    if (!s) continue;
    out.push(s);
    // strip Keepr_ prefix if present
    const m = s.match(/^Keepr_(.+)$/i);
    if (m && m[1]) out.push(m[1]);
  }
  // dedupe, preserving order
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

    // Candidate ids from different payload fields
    const sourceOrderId = payload.SourceOrderId ?? payload.sourceOrderId ?? null;
    const orderId = payload.OrderId ?? payload.orderId ?? null;

    const idCandidates = buildIdCandidates(sourceOrderId, orderId);

    // Also include nested spots (just in case)
    if (payload.data?.orderData?.sourceOrderId) {
      idCandidates.push(...buildIdCandidates(payload.data.orderData.sourceOrderId));
    }

    console.log("Webhook received. status:", status, "idCandidates:", idCandidates);

    await connectDB();

    const statusEntry = { status, received_at: new Date(), payload };

    let foundDoc: any = null;

    // 1) Try matching by _id first using each candidate
    for (const candidate of idCandidates) {
      try {
        if (!candidate) continue;
        const updated = await ShopifyOrder.findOneAndUpdate(
          { _id: String(candidate) },
          {
            $set: { order_status: status, updated_at: new Date() },
            $push: { status_history: statusEntry },
          },
          { new: true }
        ).lean();
        if (updated) {
          foundDoc = updated;
          console.log("Matched by _id:", candidate);
          break;
        }
      } catch (err) {
        console.warn("Error while trying to match by _id:", candidate, err);
      }
    }

    // 2) If not found by _id, try matching by sourceOrderId or order_id fields
    if (!foundDoc && idCandidates.length > 0) {
      for (const candidate of idCandidates) {
        try {
          const updated = await ShopifyOrder.findOneAndUpdate(
            { $or: [{ sourceOrderId: String(candidate) }, { order_id: String(candidate) }] },
            {
              $set: { order_status: status, updated_at: new Date() },
              $push: { status_history: statusEntry },
            },
            { new: true }
          ).lean();
          if (updated) {
            foundDoc = updated;
            console.log("Matched by sourceOrderId/order_id:", candidate);
            break;
          }
        } catch (err) {
          console.warn("Error while trying to match by sourceOrderId/order_id:", candidate, err);
        }
      }
    }

    // 3) If still not found, try best-effort match using the raw SourceOrderId (maybe includes prefix)
    if (!foundDoc && sourceOrderId) {
      try {
        const updated = await ShopifyOrder.findOneAndUpdate(
          { $or: [{ sourceOrderId: String(sourceOrderId) }, { order_id: String(sourceOrderId) }, { _id: String(sourceOrderId) }] },
          {
            $set: { order_status: status, updated_at: new Date() },
            $push: { status_history: statusEntry },
          },
          { new: true }
        ).lean();
        if (updated) {
          foundDoc = updated;
          console.log("Matched by fallback raw SourceOrderId:", sourceOrderId);
        }
      } catch (err) {
        console.warn("Error on fallback match:", err);
      }
    }

    if (!foundDoc) {
      console.warn("No matching order document found for webhook.", { sourceOrderId, orderId });
      // If you want auto-creation, implement it here. For now we log and return 200.
      return NextResponse.json({ ok: true, note: "no-matching-doc" });
    }

    console.log("Updated order status in DB:", { id: foundDoc._id ?? foundDoc.order_id, status });

    // If there's a tracking number, push a shipment entry
    const trackingNumber = payload.TrackingNumber ?? payload.trackingNumber ?? null;
    if (trackingNumber) {
      try {
        await ShopifyOrder.updateOne(
          { _id: foundDoc._id },
          {
            $push: {
              shipments: { trackingNumber: String(trackingNumber), received_at: new Date(), raw: payload },
            },
            $set: { updated_at: new Date() },
          }
        );
        console.log("Appended shipment entry for:", foundDoc._id, trackingNumber);
      } catch (err) {
        console.warn("Failed to push shipment entry:", err);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Webhook processing failed:", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}