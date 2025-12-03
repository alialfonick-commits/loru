// src/app/api/webhooks/orders/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import crypto from "crypto";

// Optional: set WEBHOOK_SECRET in your .env for HMAC verification.
// If not set, verification will be skipped.
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

function verifySignature(rawBody: string, signatureHeader?: string | null) {
  if (!WEBHOOK_SECRET) return true; // no secret configured -> accept
  if (!signatureHeader) return false;

  const expected = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  // signature header could be "sha256=..." or just hex; support both:
  const provided = signatureHeader.replace(/^sha256=/, "");
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"));
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text(); // get raw body for signature verification
    const signatureHeader = req.headers.get("x-signature") || req.headers.get("x-hub-signature");
    if (!verifySignature(raw, signatureHeader)) {
      return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
    }

    // Parse JSON
    let payload: any;
    try {
      payload = JSON.parse(raw);
    } catch (err) {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    // Basic schema detection (based on client's examples)
    // - OrderReceived / printready / error have "OrderStatus"
    // - Shipment Shipped has "TrackingNumber" and "OrderStatus": "shipped"
    const status = payload.OrderStatus || payload.status || null;

    // Basic logging - replace with DB save or application logic
    console.log("Webhook received:", { status, payload });

    // Handle event types
    switch ((status || "").toLowerCase()) {
      case "received":
        // handle order received
        // example: update DB order status to 'received'
        // await Orders.updateOne({ sourceOrderId: payload.SourceOrderId }, { $set: { status: 'received' }});
        console.log("Order received:", payload.SourceOrderId);
        break;

      case "printready":
        console.log("Order print ready:", payload.SourceOrderId);
        break;

      case "error":
        console.log("Order error:", payload.SourceOrderId || payload.OrderId, payload);
        break;

      case "shipped":
        console.log("Order shipped:", payload.SourceOrderId || payload.orderId, "tracking:", payload.TrackingNumber);
        break;

      default:
        // maybe it's the "Order Submission Error" format
        if (payload.errorsClean || payload.errors || payload.description) {
          console.log("Order submission error:", payload);
        } else {
          console.log("Unhandled webhook payload:", payload);
        }
    }

    // Always respond 2xx quickly to acknowledge receipt.
    // If you return non-2xx, many clients will retry.
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Webhook processing failed:", err);
    // Return 500 so client may retry (if appropriate)
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}