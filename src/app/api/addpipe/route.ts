import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "@/lib/s3";
import QRCode from "qrcode";

interface AddPipeWebhook {
  version: string;
  event: string; // "video_recorded" | "video_converted"
  data: {
    videoName: string;
    type: string; // "webm" | "mp4"
    payload: string;
    id: number;
    httpReferer: string;
    [key: string]: any;
  };
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
    const body: AddPipeWebhook = await req.json();
    console.log("Webhook received:", JSON.stringify(body, null, 2));

    if (body.event !== "video_recorded" && body.event !== "video_converted") {
      return NextResponse.json({ message: "Ignored non-video event" }, { status: 200 });
    }

    const { videoName, id, type } = body.data;

    // 1. Get video info from AddPipe
    const videoRes = await fetch(`https://api.addpipe.com/video/${id}`, {
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
    const ext = type || "mp4";
    const key = `audio/${videoName}.${ext}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME!,
        Key: key,
        Body: buffer,
        ContentType: `video/${ext}`,
      })
    );

    console.log(`Uploaded to S3: ${key}`);

    const uploadedfileUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    
    let qrImageUrl = null;

    try {
      // 1️ Generate QR code for uploaded audio URL
      const qrCodeDataUrl = await QRCode.toDataURL(uploadedfileUrl);

      // 2️ Convert Base64 to buffer
      const base64Data = qrCodeDataUrl.replace(/^data:image\/png;base64,/, "");
      const qrBuffer = Buffer.from(base64Data, "base64");

      // 3️ Upload QR image to S3
      const qrKey = `qrcodes/${videoName}.png`;
      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_BUCKET_NAME!,
          Key: qrKey,
          Body: qrBuffer,
          ContentType: "image/png",
        })
      );

      qrImageUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${qrKey}`;
      console.log(`QR image uploaded: ${qrImageUrl}`);
    } catch (err) {
      console.error("Failed to generate or upload QR code:", err);
    }

    // 4. Delete video from AddPipe
    try {
      const deleteRes = await fetch(`https://api.addpipe.com/video/${id}`, {
        method: "DELETE",
        headers: {
          "X-PIPE-AUTH": process.env.ADDPIPE_API_KEY || "",
        },
      });

      if (!deleteRes.ok) {
        console.warn(`Failed to delete video ${videoName} from AddPipe`);
      } else {
        console.log(`Deleted video ${videoName} from AddPipe`);
      }
    } catch (err) {
      console.error("Error deleting video from AddPipe:", err);
    }

    return NextResponse.json(
      { success: true, s3Key: key, qrCode: qrImageUrl },
      { status: 200 }
    );
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Failed to process webhook" }, { status: 500 });
  }
}