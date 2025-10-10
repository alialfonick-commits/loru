import mongoose, { Schema, Document } from "mongoose";

interface ILineItem {
  name: string;
  sku: string;
}

interface IShopifyOrder extends Document {
  order_id: string;
  customer_email: string;
  customer_name: string;
  shipping_address: object;
  addpipe: object;
  line_items: ILineItem[];
  s3_url?: string;
  qrcode?: string;
  created_at: Date;
}

const ShopifyOrderSchema = new Schema<IShopifyOrder>({
  order_id: { type: String, required: true, unique: true },
  customer_email: String,
  customer_name: String,
  shipping_address: Object,
  addpipe: Object,
  line_items: [
    {
      name: String,
      sku: String,
    },
  ],
  s3_url: String,
  qrcode: String,
  created_at: { type: Date, default: Date.now },
});

export default mongoose.models.ShopifyOrder ||
  mongoose.model<IShopifyOrder>("ShopifyOrder", ShopifyOrderSchema);
