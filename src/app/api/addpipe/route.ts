import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "@/lib/s3";
import QRCode from "qrcode";

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

// const ADDPIPE_BUCKET_BASE =
//   "https://eu2-addpipe.s3.nl-ams.scw.cloud/c74db05954f730433e3ad3051414f983";

export async function POST(req: NextRequest) {
  try {
    const body: AddPipeWebhook = await req.json();
    console.log("Webhook received:", JSON.stringify(body, null, 2));

    if (body.event !== "video_recorded" && body.event !== "video_converted") {
      return NextResponse.json({ message: "Ignored non-video event" }, { status: 200 });
    }

    const { videoName, id, type } = body.data;

    // 1. Call AddPipe API to get the real file URL
    const videoRes = await fetch(`https://api.addpipe.com/video/${id}`, {
      headers: {
        "X-PIPE-AUTH": process.env.ADDPIPE_API_KEY!,
      },
    });

    if (!videoRes.ok) {
      throw new Error(`Failed to fetch video info from AddPipe: ${videoRes.status}`);
    }

    const videoData = await videoRes.json();
    let pipeS3Link: string  = videoData?.videos?.[0]?.pipeS3Link;
    console.log("Video Data", videoData)
    console.log("Pipe Link", pipeS3Link)

    if (!pipeS3Link) {
      throw new Error("No pipeS3Link found in AddPipe response");
    }

    // Normalize link
    if (pipeS3Link.startsWith("/")) {
      pipeS3Link = `eu2-addpipe.s3.nl-ams.scw.cloud${pipeS3Link}`;
    }

    const fileUrl = `https://${pipeS3Link}`;
    console.log("Downloading from:", fileUrl);

    // 2. Download the actual file
    const response = await fetch(fileUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "*/*",
      },
    });

    if (!response.ok) throw new Error(`Failed to download file: ${response.status}`);

    const buffer = Buffer.from(await response.arrayBuffer());

    // 3. Upload to your own S3
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

    console.log(`✅ Uploaded to S3: ${key}`);

    const uploadedfileUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

    const qrCodeDataUrl = await QRCode.toDataURL(uploadedfileUrl); 

    console.log(`✅ QR Code generated for: ${fileUrl}`);

    // 3. (Optional) Delete from AddPipe
    try {
      const deleteUrl = `https://api.addpipe.com/video/${id}`;
    
      const deleteRes = await fetch(deleteUrl, {
        method: "DELETE",
        headers: {
          "X-PIPE-AUTH": process.env.ADDPIPE_API_KEY || ""
        }
      });
    
      if (!deleteRes.ok) {
        const errorText = await deleteRes.text();
        console.warn(`⚠️ Failed to delete video ${videoName} from AddPipe:`, errorText);
      } else {
        console.log(`🗑️ Deleted video ${videoName} from AddPipe`);
      }
    } catch (err) {
      console.error("Error deleting video from AddPipe:", err);
    }
    

    return NextResponse.json(
      { success: true, s3Key: key, qrCode: qrCodeDataUrl },
      { status: 200 }
    );
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Failed to process webhook" },
      { status: 500 }
    );
  }
}