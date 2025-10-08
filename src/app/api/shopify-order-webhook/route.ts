import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import ShopifyOrder from "@/models/ShopifyOrder";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Log or inspect order payload
    console.log("✅ Shopify Order Webhook Received:", body.id);

    // Extract AddPipe-related attributes from Shopify order
    const attributes = body.note_attributes || [];
    const addpipeData: Record<string, string> = {};

    attributes.forEach((attr: any) => {
      if (attr.name.startsWith("addpipe_")) {
        addpipeData[attr.name] = attr.value;
      }
    });

    // Construct payload for AddPipe or your backend
    const payload = {
      order_id: body.id,
      customer_email: body.email,
      customer_name: body.customer?.first_name + " " + body.customer?.last_name,
      shipping_address: body.shipping_address,
      addpipe: addpipeData,
    };

    console.log("🎧 Forwarding to AddPipe!:", payload);

    // Connect to MongoDB
    await connectDB();

    // Save to DB
    const existing = await ShopifyOrder.findOne({ order_id: payload.order_id });
    if (!existing) {
      await ShopifyOrder.create(payload);
      console.log("✅ Saved new order:", payload.order_id);
    } else {
      console.log("ℹ️ Order already exists:", payload.order_id);
    }

    // Send this info to AddPipe or your server endpoint
    // Replace with your AddPipe API URL
    // await fetch("https://api.addpipe.com/save-order-data", {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify(payload),
    // });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("❌ Error handling Shopify webhook:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}