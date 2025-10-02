import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "@/lib/s3";

interface AddPipeWebhook {
  version: string;
  event: string; // "video_recorded"
  data: {
    videoName: string;
    type: string; // "webm" | "mp4"
    payload: string; // file path + ?key
    id: number;
    httpReferer: string;
    [key: string]: any;
  };
}

export async function POST(req: NextRequest) {
  try {
    const body: AddPipeWebhook = await req.json();
    console.log("Webhook received:", JSON.stringify(body, null, 2));

    if (body.event !== "video_recorded") {
      return NextResponse.json(
        { message: "Ignored non-video event" },
        { status: 200 }
      );
    }

    const { videoName, type, payload } = body.data;

    // 🔑 Extract AddPipe download URL from payload
    // Payload format: "projectId,filePath%3Fkey%3D<token>,"
    const parts = payload.split(",");
    if (parts.length < 2) throw new Error("Unexpected AddPipe payload format");

    const filePath = decodeURIComponent(parts[1]); // hWN2jR4xnwvSlgvBFk4bzqDb?key=...
    const fileUrl = `https://cdn.addpipe.com/${filePath}`;
    console.log("Downloading from:", fileUrl);

    // 1. Download file
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error("Failed to download file from AddPipe");
    const buffer = Buffer.from(await response.arrayBuffer());

    // 2. Upload to S3
    const key = `audio/${videoName}.${type}`;
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME!,
        Key: key,
        Body: buffer,
        ContentType: type === "webm" ? "audio/webm" : "video/mp4",
      })
    );
    console.log(`✅ Uploaded to S3: ${key}`);

    // 3. (Optional) Delete from AddPipe
    try {
      const deleteUrl = `https://api.addpipe.com/delete/${videoName}?apiKey=${process.env.ADDPIPE_API_KEY}`;
      const deleteRes = await fetch(deleteUrl, { method: "DELETE" });

      if (!deleteRes.ok) {
        console.warn(`⚠️ Failed to delete video ${videoName} from AddPipe`);
      } else {
        console.log(`🗑️ Deleted video ${videoName} from AddPipe`);
      }
    } catch (err) {
      console.error("Error deleting video from AddPipe:", err);
    }

    return NextResponse.json({ success: true, s3Key: key }, { status: 200 });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Failed to process webhook" },
      { status: 500 }
    );
  }
}