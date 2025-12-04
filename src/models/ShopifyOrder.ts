// models/ShopifyOrder.ts
import mongoose, { Schema, Document } from "mongoose";

interface IFileEntry {
  line_item_id: string;
  videoId: string;
  streamName?: string | null;
  uploadedfileUrl: string;
  created_at: Date;
}

interface ILineItem {
  line_item_id?: string;
  title?: string;
  name?: string;
  sku?: string;
  quantity?: number;
  sourceItemId?: string;
  siteflow_id?: string;
  siteflow_url?: string;
}

export interface IShopifyOrder extends Document {
  order_id?: string;
  siteflow_id?: string;
  customer_email?: string;
  customer_name?: string;
  shipping_address?: object;
  addpipe?: object;
  line_items?: ILineItem[];
  lineitems?: ILineItem[];
  files?: IFileEntry[];
  s3_url?: string;
  qrcode?: string;
  sourceAccountId?: string;
  sourceOrderId?: string;
  order_status?: string;
  status_history?: Array<any>;
  siteflow_url?: string;
  created_at?: Date;
  updated_at?: Date;
}

const ShopifyOrderSchema = new Schema<IShopifyOrder>({
  _id: { type: String, required: false },

  order_id: { type: String, required: false }, // no longer required or unique

  siteflow_id: { type: String, required: false },

  customer_email: { type: String, required: false },
  customer_name: { type: String, required: false },
  shipping_address: { type: Schema.Types.Mixed, required: false },
  addpipe: { type: Schema.Types.Mixed, required: false },

  line_items: [
    {
      name: String,
      sku: String,
      quantity: Number,
    },
  ],

  lineitems: [
    {
      line_item_id: String,
      title: String,
      name: String,
      sku: String,
      quantity: Number,
      sourceItemId: String,
      siteflow_id: String,
      siteflow_url: String,
    },
  ],

  files: [
    {
      line_item_id: String,
      videoId: String,
      streamName: String,
      uploadedfileUrl: String,
      created_at: { type: Date, default: Date.now },
    },
  ],

  s3_url: { type: String, required: false },
  qrcode: { type: String, required: false },

  sourceAccountId: { type: String, required: false },
  sourceOrderId: { type: String, required: false },
  order_status: { type: String, required: false },
  status_history: [{ status: String, received_at: Date, payload: Schema.Types.Mixed }],
  siteflow_url: { type: String, required: false },

  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date },
});

export default mongoose.models.ShopifyOrder ||
  mongoose.model<IShopifyOrder>("ShopifyOrder", ShopifyOrderSchema);