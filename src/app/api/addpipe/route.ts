import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "@/lib/s3";

// 👇 define the payload shape (adjust fields based on AddPipe docs)
interface AddPipeWebhookPayload {
  code: string; // unique video code
  videoStatus: string; // e.g., "ready"
  assets: {
    mp4: string; // direct URL to mp4 file
  };
}

export async function POST(req: NextRequest) {
  try {
    const data: AddPipeWebhookPayload = await req.json();
    console.log("Webhook payload:", data);

    if (data.videoStatus !== "ready") {
      return NextResponse.json({ message: "audio not ready yet" }, { status: 200 });
    }

    // 1. Download video from AddPipe
    const response = await fetch(data.assets.mp4);
    if (!response.ok) throw new Error("Failed to download audio");
    const buffer = Buffer.from(await response.arrayBuffer());

    // 2. Upload to S3
    const key = `audio/${data.code}.mp4`;
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME!,
        Key: key,
        Body: buffer,
        ContentType: "video/mp4",
      })
    );

    console.log(`Uploaded to S3: ${key}`);

    // 3. (Optional) Delete video from AddPipe
    // -> requires AddPipe API call with your project credentials
    await fetch(`https://api.addpipe.com/delete/${data.code}?apiKey=${process.env.ADDPIPE_API_KEY}`, { method: "DELETE" });

    return NextResponse.json({ success: true, s3Key: key }, { status: 200 });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Failed to process webhook" }, { status: 500 });
  }
}