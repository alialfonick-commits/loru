// models/ShopifyOrder.ts
import mongoose, { Schema, Document } from "mongoose";

interface IShopifyOrder extends Document {
  order_id: number;
  customer_email: string;
  customer_name: string;
  shipping_address: object;
  addpipe: object;
  created_at: Date;
}

const ShopifyOrderSchema = new Schema<IShopifyOrder>({
  order_id: { type: Number, required: true, unique: true },
  customer_email: String,
  customer_name: String,
  shipping_address: Object,
  addpipe: Object,
  created_at: { type: Date, default: Date.now },
});

export default mongoose.models.ShopifyOrder ||
  mongoose.model<IShopifyOrder>("ShopifyOrder", ShopifyOrderSchema);
