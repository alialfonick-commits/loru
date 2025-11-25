// app/api/webhook/route.ts  (or wherever your route lives - adjust filename/path as needed)
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import ShopifyOrder from "@/models/ShopifyOrder";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "@/lib/s3";
import crypto from "crypto";

/* ---------- Types ---------- */
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

interface LineItemMinimal {
  id: string;
  name: string;
  sku: string;
}

interface ParsedLineItem {
  original: any;
  props: Record<string, string>;
  addpipe_video_id?: string;
  addpipe_stream?: string;
}

/* ---------- Helper: createSiteflowOrder (keeps your implementation) ---------- */
async function createSiteflowOrder(
  uploadedfileUrl: string,
  shippingAddress: ShippingAddress,
  item: LineItemMinimal,
  sourceOrderId: string
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

  const pdfMap: Record<string, { cover: string; inside: string }> = {
    "Born To Be Loved": {
      cover:
        "https://keepr-audio.s3.eu-north-1.amazonaws.com/pdfs/Born+To+Be+Loved/cover-2.pdf",
      inside:
        "https://keepr-audio.s3.eu-north-1.amazonaws.com/pdfs/Born+To+Be+Loved/BornToBeLoved_210x210_interior-2.pdf",
    },
    "I Will Always Love You": {
      cover:
        "https://keepr-audio.s3.eu-north-1.amazonaws.com/pdfs/I+Will+Always+Love+You/IWillAlwayaLoveYou_HardbackCoverTemplate-2.pdf",
      inside:
        "https://keepr-audio.s3.eu-north-1.amazonaws.com/pdfs/I+Will+Always+Love+You/IWillAlwaysLoveYou_210x210_interior-3.pdf",
    },
  };

  const pdfs = pdfMap[item.name];

  const body = {
    destination: { name: "pureprint" },
    orderData: {
      sourceOrderId: sourceOrderId,
      items: [
        {
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
              attributes: { keepr_qrcode: uploadedfileUrl },
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

/* ---------- Helper: download with retry (exponential backoff) ---------- */
async function downloadWithRetry(
  url: string,
  retries = 5,
  delay = 2000
): Promise<Buffer> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "*/*",
        },
      });

      if (res.ok) {
        return Buffer.from(await res.arrayBuffer());
      }

      console.warn(`Download attempt ${i + 1} failed (${res.status})`);
    } catch (err) {
      console.warn(`Download attempt ${i + 1} error:`, err);
    }

    if (i < retries - 1) {
      const wait = delay * Math.pow(2, i);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw new Error(`Failed to download after ${retries} attempts`);
}

/* ---------- Helper: parse Shopify line item properties array -> map ---------- */
function propertiesArrayToMap(propertiesArray: any[] = []) {
  const map: Record<string, string> = {};
  if (!Array.isArray(propertiesArray)) return map;

  propertiesArray.forEach((p: any) => {
    if (!p) return;
    // Shopify properties can be { name, value } or { first, last }
    const name = p.name ?? p.first ?? Object.keys(p)[0];
    const value = p.value ?? p.last ?? Object.values(p)[0];
    if (name) map[String(name)] = String(value ?? "");
  });
  return map;
}

/* ---------- Main POST handler ---------- */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log(body)
    console.log("Shopify Order Webhook Received:", body?.id ?? "(no id)");

    // Basic env var checks
    if (!process.env.ADDPIPE_API_KEY || !process.env.AWS_BUCKET_NAME || !process.env.AWS_REGION) {
      console.error('Missing required env vars: ADDPIPE_API_KEY, AWS_BUCKET_NAME, or AWS_REGION');
      return NextResponse.json({ success: false, error: 'server configuration error' }, { status: 500 });
    }

    // Build a minimal payload/DB doc for the order
    const orderDocBase = {
      order_id: String(body.id ?? ""),
      email: body.email ?? "",
      customer_name: `${body.customer?.first_name || ""} ${body.customer?.last_name || ""}`.trim(),
      shipping_address: body.shipping_address ?? null,
      created_at: body.created_at ?? new Date().toISOString(),
      raw_payload: body,
    };

    // Parse line items, extracting video id + stream if present
    const parsedLineItems: ParsedLineItem[] = (body.line_items || []).map((li: any) => {
      const props = propertiesArrayToMap(li.properties || []);

      const machineKey = Object.keys(props).find(k => k.toLowerCase().startsWith('addpipe_video_id'));
      const friendlyKey = Object.keys(props).find(k => k.toLowerCase().startsWith('audio id'));
      const streamKey = Object.keys(props).find(k => k.toLowerCase().startsWith('addpipe_stream'));

      const videoId = machineKey ? props[machineKey] : (friendlyKey ? props[friendlyKey] : undefined);
      const streamName = streamKey ? props[streamKey] : undefined;

      return {
        original: li,
        props,
        addpipe_video_id: videoId,
        addpipe_stream: streamName
      };
    });

    console.log("Parsed line-items (with potential AddPipe data):", parsedLineItems.map(p => ({ id: p.original?.id, video: p.addpipe_video_id })));

    // If there are no line-item addpipe entries, fallback to order-level note_attributes (legacy)
    const orderNoteAttrs: Record<string, string> = {};
    if ((!parsedLineItems.some((p) => p.addpipe_video_id)) && Array.isArray(body.note_attributes)) {
      (body.note_attributes || []).forEach((n: any) => {
        if (n?.name && typeof n?.value !== "undefined") {
          orderNoteAttrs[n.name] = String(n.value);
        }
      });
      // if fallback exists, attach to the first line item
      if (Object.keys(orderNoteAttrs).length > 0 && parsedLineItems.length > 0) {
        console.warn("No line-item AddPipe data found; falling back to order-level note_attributes for first line item.");
        parsedLineItems[0].props = { ...parsedLineItems[0].props, ...orderNoteAttrs };
        parsedLineItems[0].addpipe_video_id = parsedLineItems[0].addpipe_video_id || orderNoteAttrs.addpipe_video_id || orderNoteAttrs.addpipe_video || orderNoteAttrs.addpipe_videoid;
        parsedLineItems[0].addpipe_stream = parsedLineItems[0].addpipe_stream || orderNoteAttrs.addpipe_stream;
      }
    }

    // connect to DB
    await connectDB();

    // Save order base doc if not present
    const existing = await ShopifyOrder.findOne({ order_id: orderDocBase.order_id });
    if (!existing) {
      await ShopifyOrder.create(orderDocBase);
      console.log("Saved new ShopifyOrder document:", orderDocBase.order_id);
    } else {
      console.log("ShopifyOrder already exists in DB:", orderDocBase.order_id);
    }

    // Filter items that actually have addpipe_video_id
    const itemsToProcess = parsedLineItems.filter((p) => p.addpipe_video_id);

    // If nothing to process, still respond OK
    if (itemsToProcess.length === 0) {
      console.log("No AddPipe video IDs found on any line item. Nothing to process.");
      return NextResponse.json({ success: true, message: "No AddPipe items found" });
    }

    // Helper to process a single line item
    async function processLineItemItem(p: ParsedLineItem, idx: number, totalCount: number, shopifyOrderNumber: string) {
      const li = p.original;
      if (!p.addpipe_video_id) {
        return { line_item_id: li.id, skipped: true, reason: 'no_video_id' };
      }
      const videoId = String(p.addpipe_video_id);
      const streamName = p.addpipe_stream ?? null;

      try {
        // 1) Get AddPipe video info
        const videoRes = await fetch(`https://api.addpipe.com/video/${encodeURIComponent(videoId)}`, {
          headers: {
            "X-PIPE-AUTH": process.env.ADDPIPE_API_KEY || "",
          },
        });

        if (!videoRes.ok) {
          const txt = await videoRes.text().catch(() => "");
          console.error(`Failed to fetch AddPipe video ${videoId}: ${videoRes.status} ${txt}`);
          return { line_item_id: li.id, error: true, reason: "AddPipe fetch failed", status: videoRes.status };
        }

        const videoData = await videoRes.json();
        // defensive lookup
        let pipeS3Link: string | undefined = Array.isArray(videoData?.videos) && videoData.videos[0]?.pipeS3Link
          ? videoData.videos[0].pipeS3Link
          : undefined;

        if (!pipeS3Link) {
          console.error("No pipeS3Link found in AddPipe response for", videoId, videoData);
          return { line_item_id: li.id, error: true, reason: "no_pipeS3Link" };
        }

        if (pipeS3Link.startsWith("/")) {
          pipeS3Link = `eu2-addpipe.s3.nl-ams.scw.cloud${pipeS3Link}`;
        }
        const fileUrl = `https://${pipeS3Link}`;
        console.log(`LineItem ${li.id} - downloading from:`, fileUrl);

        // 2) Download
        const buffer = await downloadWithRetry(fileUrl);

        // 3) Upload to your S3
        const key = `audio/${videoId}.mp4`;
        await s3.send(
          new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME!,
            Key: key,
            Body: buffer,
            ContentType: `video/mp4`,
          })
        );

        const uploadedfileUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
        console.log(`LineItem ${li.id} - uploaded to S3: ${uploadedfileUrl}`);

        // 4) Save into DB (push to files array)
        await ShopifyOrder.updateOne(
          { order_id: orderDocBase.order_id },
          {
            $push: {
              files: {
                line_item_id: String(li.id),
                videoId,
                streamName,
                uploadedfileUrl,
                created_at: new Date(),
              },
            },
          }
        );

        // 5) Create SiteFlow order for this line item
        let siteflowResult: any = null;
        try {
          // compute suffix: '' when only one item, otherwise '-A', '-B', '-C', ...
          const suffix = totalCount > 1 ? `-${String.fromCharCode(65 + idx)}` : '';
          const sourceOrderId = `Keepr_${shopifyOrderNumber}${suffix}`;

          siteflowResult = await createSiteflowOrder(
            uploadedfileUrl,
            body.shipping_address,
            {
              id: String(li.id),
              name: li.name,
              sku: li.sku,
            },
            sourceOrderId // pass computed sourceOrderId
          );

          // Save siteflow reference in DB
          await ShopifyOrder.updateOne(
            { order_id: orderDocBase.order_id },
            {
              $push: {
                siteflow_orders: {
                  line_item_id: String(li.id),
                  siteflow_id: siteflowResult?._id ?? null,
                  siteflow_url: siteflowResult?.url ?? null,
                  created_at: new Date(),
                },
              },
            }
          );
          console.log(`SiteFlow created for line item ${li.id}:`, siteflowResult?._id);
        } catch (err) {
          console.error(`SiteFlow creation failed for line item ${li.id}:`, err);
        }

        // 6) Attempt to delete AddPipe video (best-effort)
        try {
          const deleteRes = await fetch(`https://api.addpipe.com/video/${encodeURIComponent(videoId)}`, {
            method: "DELETE",
            headers: { "X-PIPE-AUTH": process.env.ADDPIPE_API_KEY || "" },
          });
          if (!deleteRes.ok) {
            console.warn(`Failed to delete AddPipe video ${videoId} - status ${deleteRes.status}`);
          } else {
            console.log(`Deleted AddPipe video ${videoId}`);
          }
        } catch (err) {
          console.warn("Error deleting AddPipe video:", err);
        }

        return { line_item_id: li.id, success: true, videoId, uploadedfileUrl, siteflow: siteflowResult ?? null };
      } catch (err) {
        console.error("Unexpected error processing line item", li.id, err);
        return { line_item_id: li.id, error: true, reason: (err as Error).message ?? err };
      }
    }

    // Process all items concurrently (for small number of items this is fine)
    // compute base order number (prefer order_number)
    const shopifyOrderNumber = body.order_number ?? (body.name ? String(body.name).replace('#', '') : String(body.id ?? 'unknown'));
    const totalCount = itemsToProcess.length;

    // process with index so we can add suffixes per item
    const results = await Promise.all(
      itemsToProcess.map((p, idx) => processLineItemItem(p, idx, totalCount, shopifyOrderNumber))
    );


    console.log("All items processed:", results);

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error("Error handling Shopify webhook:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}