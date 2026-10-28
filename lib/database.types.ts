// ชนิดข้อมูลของแต่ละแถวตามสคีมาในฐานข้อมูล ใช้กับ query<T>() ใน db.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Category = { category_id: number; name: string };

export type Catalog = {
  catalog_id: number;
  category_id: number;
  name: string;
  description: string | null;
  file_url: string | null;
  is_visible: boolean;
};

export type Product = {
  product_id: number;
  catalog_id: number;
  name: string;
  base_price: number;
  price_unit: string;
  description: Json | null;
  image_url: string | null;
  details: Json | null;
};

export type VectorEmbedding = {
  embedding_id: number;
  product_id: number;
  embedding_type: "image" | "text";
  vector_data: string; // pgvector ส่งกลับมาเป็นสตริง "[0.1,0.2,...]"
};

export type Customer = {
  customer_id: number;
  line_user_id: string;
  display_name: string;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  details: Json;
};

export type Admin = {
  admin_id: number;
  username: string;
  password_hash: string;
  full_name: string;
};

export type Technician = {
  technician_id: number;
  name: string;
  phone: string;
  line_id: string | null;
};

export type PriceEstimate = {
  estimate_id: number;
  customer_id: number;
  method: "ai" | "manual";
  total_price: number;
  created_at: string;
  room_count: number;
  is_contacted: boolean;
};

export type PriceEstimateItem = {
  item_id: number;
  estimate_id: number;
  product_id: number;
  width: number;
  height: number;
  quantity: number;
};

export type Quotation = {
  quotation_id: number;
  estimate_id: number;
  admin_id: number;
  total_amount: number;
  deposit_amount: number;
  created_at: string;
  confirmed_at: string | null;
  details: Json;
  flowaccount_record_id: number | null;
  flowaccount_serial: string | null;
};

export type QuotationItem = {
  quotation_item_id: number;
  quotation_id: number;
  product_id: number;
  width: number | null;
  height: number | null;
  quantity: number;
  unit_price: number;
};

export type Contract = {
  contract_id: number;
  quotation_id: number;
  created_at: string;
  file_url: string;
  signed_file_url: string | null;
  signed_at: string | null;
};

export type Invoice = {
  invoice_id: number;
  quotation_id: number;
  type: "deposit" | "balance";
  amount: number;
  due_date: string;
  flowaccount_record_id: number | null;
  flowaccount_serial: string | null;
};

export type PaymentStatus = "pending" | "paid" | "expired" | "cancelled";

export type Payment = {
  payment_id: number;
  invoice_id: number;
  admin_id: number | null;
  amount: number;
  qr_ref: string | null;
  status: PaymentStatus;
  pay_method: "qr_code" | "cash";
  paid_at: string | null;
};

export type Receipt = {
  receipt_id: number;
  payment_id: number;
  created_at: string;
  flowaccount_record_id: number | null;
  flowaccount_serial: string | null;
};

export type TaxInvoice = {
  tax_invoice_id: number;
  payment_id: number;
  tax_id: string | null;
  created_at: string;
  flowaccount_record_id: number | null;
  flowaccount_serial: string | null;
};

export type JobStatus = "pending" | "in_progress" | "completed" | "closed";

export type Job = {
  job_id: number;
  quotation_id: number;
  status: JobStatus;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export type JobSchedule = {
  schedule_id: number;
  job_id: number;
  technician_id: number;
  work_time: string;
};

export type QnA = {
  qna_id: number;
  admin_id: number;
  question: string;
  answer: string;
  is_visible: boolean;
};
