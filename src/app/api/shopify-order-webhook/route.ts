import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import ShopifyOrder from "@/models/ShopifyOrder";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "@/lib/s3";
import QRCode from "qrcode";
import crypto from "crypto";

interface ShippingAddress {
  first_name: string;
  last_name: string;
  address1: string;
  address2?: string | null;
  city: string;
  zip: string;
  province?: string;
  country: string;
  country_code: string;
  phone?: string;
  company?: string;
  email?: string;
}

interface LineItem {
  id: string;
  name: string;
  sku: string;
}

// Add helper function here (above POST handler)
async function createSiteflowOrder(
    uploadedfileUrl: string,
    qrCodeDataUrl: string,
    shippingAddress: ShippingAddress,
    item: LineItem
  ) {
    const method = "POST";
    const path = "/api/order";
    const timestamp = Math.floor(Date.now() / 1000);
    const secret = process.env.SITEFLOW_SECRET!;
    const token = process.env.SITEFLOW_TOKEN!;
  
    const stringToSign = `${method} ${path} ${timestamp}`;
    const signature = crypto
      .createHmac("sha1", secret)
      .update(stringToSign)
      .digest("hex");
  
    const authHeader = `${token}:${signature}`;
    console.log(uploadedfileUrl)

    // Map each song to its S3 cover & inside PDFs
    const pdfMap: Record<
    string,
    { cover: string; inside: string }
    > = {
      "Born To Be Loved": {
        cover:
          "https://keepr-audio.s3.eu-north-1.amazonaws.com/pdfs/Born+To+Be+Loved/cover.pdf",
        inside:
          "https://keepr-audio.s3.eu-north-1.amazonaws.com/pdfs/Born+To+Be+Loved/inside.pdf",
      },
      "I Will Always Love You": {
        cover:
          "https://keepr-audio.s3.eu-north-1.amazonaws.com/pdfs/I+Will+Always+Love+You/cover.pdf",
        inside:
          "https://keepr-audio.s3.eu-north-1.amazonaws.com/pdfs/I+Will+Always+Love+You/inside.pdf",
      },
    };

    // Get correct cover/inside based on item.name
    const pdfs = pdfMap[item.name];
  
    const body = {
      destination: { name: "pureprint" },
      orderData: {
        sourceOrderId: `Keepr_${Date.now()}`,
        items: [
          {
            // sku: item.sku || "keepr_hardback_210x210_staging",
            sku: "keepr_hardback_210x210_staging",
            name: item.name || "Keepr Book",
            sourceItemId: item.id,
            quantity: 1,
            components: [
              {
                code: "cover",
                fetch: true,
                path: pdfs ? pdfs.cover : {},
              },
              {
                code: "text",
                fetch: true,
                attributes: { keepr_qrcode: qrCodeDataUrl },
                ...(pdfs ? { path: pdfs.inside } : {}),
              },
            ],
          },
        ],
        shipments: [
          {
            shipTo: {
              name: `${shippingAddress.first_name} ${shippingAddress.last_name}`.trim(),
              address1: shippingAddress.address1,
              address2: shippingAddress.address2 || "",
              town: shippingAddress.city,
              postcode: shippingAddress.zip,
              isoCountry: shippingAddress.country_code,
              email: shippingAddress.email || "",
            },
            carrier: { alias: "standard" },
          },
        ],
      },
    };
  
    const res = await fetch("https://orders.oneflow.io/api/order", {
      method: "POST",
      headers: {
        "x-oneflow-authorization": authHeader,
        "x-oneflow-date": String(timestamp),
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  
    if (!res.ok) {
      const text = await res.text();
      console.error("SiteFlow order creation failed:", text);
      throw new Error(`SiteFlow Error: ${res.status}`);
    }
  
    const data = await res.json();
    console.log("SiteFlow order created:", data);
    return data;
}

// --- Helper: Retry download with exponential backoff ---
async function downloadWithRetry(
    url: string,
    retries = 5,
    delay = 2000 // start with 2s
  ): Promise<Buffer> {
    for (let i = 0; i < retries; i++) {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "*/*",
        },
      });
  
      if (res.ok) {
        return Buffer.from(await res.arrayBuffer());
      }
  
      console.warn(`Download attempt ${i + 1} failed (${res.status})`);
  
      if (i < retries - 1) {
        const wait = delay * Math.pow(2, i); // exponential backoff
        console.log(`Retrying in ${wait / 1000}s...`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
    throw new Error(`Failed to download after ${retries} attempts`);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Log or inspect order payload
    // console.log("Shopify Order Webhook Received:", body.id);

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
      customer_name: `${body.customer?.first_name || ""} ${body.customer?.last_name || ""}`.trim(),
      shipping_address: body.shipping_address,
      addpipe: addpipeData,
      line_items: body.line_items?.map((item: any) => ({
        id: String(item.id),
        name: item.name,
        sku: item.sku,
      })) || [],
    };

    console.log("Forwarding to AddPipe!:", payload);

    // Connect to MongoDB
    await connectDB();

    // Save to DB
    const existing = await ShopifyOrder.findOne({ order_id: payload.order_id });
    if (!existing) {
        await ShopifyOrder.create({
            ...payload,
            order_id: String(payload.order_id),
        });
        console.log("Saved new order:", payload.order_id);
        const videoRes = await fetch(`https://api.addpipe.com/video/${payload.addpipe.addpipe_video_id}`, {
            headers: {
            "X-PIPE-AUTH": process.env.ADDPIPE_API_KEY!,
            },
        });
  
    if (!videoRes.ok) {
        throw new Error(`Failed to fetch video info from AddPipe: ${videoRes.status}`);
    }

    const videoData = await videoRes.json();
    let pipeS3Link: string = videoData?.videos?.[0]?.pipeS3Link;

    if (!pipeS3Link) throw new Error("No pipeS3Link found in AddPipe response");

    // Normalize link
    if (pipeS3Link.startsWith("/")) {
      pipeS3Link = `eu2-addpipe.s3.nl-ams.scw.cloud${pipeS3Link}`;
    }
    const fileUrl = `https://${pipeS3Link}`;
    console.log("Downloading from:", fileUrl);

    // 2. Download file with retry
    const buffer = await downloadWithRetry(fileUrl);

    // 3. Upload to S3
    // const ext = "type" || "mp4";
    const key = `audio/${payload.addpipe.addpipe_video_id}.mp4`;

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME!,
        Key: key,
        Body: buffer,
        ContentType: `video/mp4`,
      })
    );

    console.log(`Uploaded to S3: ${key}`);

    const uploadedfileUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

    const qrCodeDataUrl = await QRCode.toDataURL(uploadedfileUrl);

    console.log(`QR Code generated for: ${uploadedfileUrl}`);

    console.log('QR code:', qrCodeDataUrl)

    const firstItem = payload.line_items[0];
    const shippingAddress = payload.shipping_address;

    try {
      const siteflowOrder = await createSiteflowOrder(
        uploadedfileUrl,
        qrCodeDataUrl,
        shippingAddress,
        firstItem
      );
    
      if (siteflowOrder?._id) {
        console.log("SiteFlow order created successfully:", siteflowOrder._id);
        console.log("SiteFlow order URL:", siteflowOrder.url);
    
        // Optional: save order ID in your DB for tracking
        await ShopifyOrder.updateOne(
          { order_id: String(payload.order_id) },
          { $set: { siteflow_order_id: siteflowOrder._id, siteflow_order_url: siteflowOrder.url } }
        );
      } else {
        console.error("SiteFlow order creation failed — missing _id:", siteflowOrder);
      }
    
    } catch (err) {
      console.error("SiteFlow order creation error:", err);
    }
    
    try {
        // Save S3 URL + QR code into DB
        const updateResult = await ShopifyOrder.updateOne(
            { order_id: String(payload.order_id) },
            { $set: { s3_url: uploadedfileUrl, qrcode: qrCodeDataUrl } }
        );
      
        if (updateResult.modifiedCount > 0) {
          console.log("QR code and S3 URL saved in DB");
        } else if (updateResult.matchedCount > 0) {
          console.warn("Order found but nothing was updated (possibly same data)");
        } else {
          console.error("No matching order found to update:", payload.order_id);
        }
    } catch (err) {
        console.error("Failed to save QR code and S3 URL in DB:", err);
    }

    // 4. Delete video from AddPipe
    try {
      const deleteRes = await fetch(`https://api.addpipe.com/video/${payload.addpipe.addpipe_video_id}`, {
        method: "DELETE",
        headers: {
          "X-PIPE-AUTH": process.env.ADDPIPE_API_KEY || "",
        },
      });

      if (!deleteRes.ok) {
        console.warn(`Failed to delete video ${payload.addpipe.addpipe_video_id} from AddPipe`);
      } else {
        console.log(`Deleted video ${payload.addpipe.addpipe_video_id} from AddPipe`);
      }
    } catch (err) {
      console.error("Error deleting video from AddPipe:", err);
    }

    } else {
      console.log("Order already exists:", payload.order_id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error handling Shopify webhook:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}