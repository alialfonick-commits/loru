import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import ShopifyOrder from "@/models/ShopifyOrder";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "@/lib/s3";
import QRCode from "qrcode";

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
  
      console.warn(`⚠️ Download attempt ${i + 1} failed (${res.status})`);
  
      if (i < retries - 1) {
        const wait = delay * Math.pow(2, i); // exponential backoff
        console.log(`⏳ Retrying in ${wait / 1000}s...`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
    throw new Error(`Failed to download after ${retries} attempts`);
  }

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

    console.log(`✅ Uploaded to S3: ${key}`);

    const uploadedfileUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    const qrCodeDataUrl = await QRCode.toDataURL(uploadedfileUrl);

    console.log(`✅ QR Code generated for: ${uploadedfileUrl}`);

    console.log('QR code:', qrCodeDataUrl)

    // Save S3 URL + QR code into DB
    await ShopifyOrder.updateOne(
        { order_id: payload.order_id },
        {
            $set: {
                s3_url: uploadedfileUrl,
                qrcode: qrCodeDataUrl,
            },
        }
    );
    console.log("✅ QR code and S3 URL saved in DB");

    // 4. Delete video from AddPipe
    try {
      const deleteRes = await fetch(`https://api.addpipe.com/video/${payload.addpipe.addpipe_video_id}`, {
        method: "DELETE",
        headers: {
          "X-PIPE-AUTH": process.env.ADDPIPE_API_KEY || "",
        },
      });

      if (!deleteRes.ok) {
        console.warn(`⚠️ Failed to delete video ${payload.addpipe.addpipe_video_id} from AddPipe`);
      } else {
        console.log(`🗑️ Deleted video ${payload.addpipe.addpipe_video_id} from AddPipe`);
      }
    } catch (err) {
      console.error("Error deleting video from AddPipe:", err);
    }

    } else {
      console.log("Order already exists:", payload.order_id);
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