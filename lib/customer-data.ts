// ข้อมูลฝั่งลูกค้า: ทุก query กรองด้วย customer_id ของคนที่ login เท่านั้น
import "server-only";
import { pool } from "./db";

// ใบแจ้งหนี้ของลูกค้า + สถานะชำระ + QR ที่ค้างอยู่ (ถ้ามี)
const INVOICE_SQL = `
  select i.invoice_id, i.type, i.amount, i.due_date, i.flowaccount_serial, i.flowaccount_record_id,
         q.quotation_id, q.flowaccount_serial as qt_serial, q.total_amount, q.details->>'project_name' as project_name,
         exists (select 1 from payment p where p.invoice_id = i.invoice_id and p.status = 'paid') as is_paid,
         (select p.payment_id from payment p where p.invoice_id = i.invoice_id and p.status = 'pending'
          and p.pay_method = 'qr_code' order by p.payment_id desc limit 1) as pending_payment_id
  from invoice i
  join quotation q using (quotation_id)
  join price_estimate e using (estimate_id)
  where e.customer_id = $1`;

export async function customerInvoices(customerId: number) {
  const r = await pool.query(`${INVOICE_SQL} order by i.due_date, i.invoice_id`, [customerId]);
  return r.rows;
}

export async function customerInvoice(customerId: number, invoiceId: number) {
  const r = await pool.query(`${INVOICE_SQL} and i.invoice_id = $2`, [customerId, invoiceId]);
  return r.rows[0] ?? null;
}

// ประวัติการชำระเงิน (Use Case 10) เรียงตามวันที่ชำระล่าสุดก่อน
export async function customerPaymentHistory(customerId: number) {
  const r = await pool.query(
    `select p.payment_id, p.amount, p.pay_method, p.paid_at, i.type, i.flowaccount_serial as inv_serial,
            q.flowaccount_serial as qt_serial, r.flowaccount_serial as receipt_serial, t.flowaccount_serial as tax_serial,
            r.flowaccount_record_id as receipt_record_id, t.flowaccount_record_id as tax_record_id
     from payment p
     join invoice i using (invoice_id)
     join quotation q using (quotation_id)
     join price_estimate e using (estimate_id)
     left join receipt r using (payment_id)
     left join tax_invoice t using (payment_id)
     where e.customer_id = $1 and p.status = 'paid'
     order by p.paid_at desc`,
    [customerId],
  );
  return r.rows;
}

// payment ของลูกค้าคนนี้เท่านั้น
export async function customerPayment(customerId: number, paymentId: number) {
  const r = await pool.query(
    `select p.* from payment p
     join invoice i using (invoice_id) join quotation q using (quotation_id) join price_estimate e using (estimate_id)
     where p.payment_id = $1 and e.customer_id = $2`,
    [paymentId, customerId],
  );
  return r.rows[0] ?? null;
}

// ใบเสนอราคาของลูกค้า + มีใบแจ้งหนี้แล้วหรือยัง (ร้านดำเนินการต่อแล้ว = ยืนยันผ่าน FlowAccount ไม่ได้)
const QUOTATION_SQL = `
  select q.quotation_id, q.flowaccount_serial as serial, q.flowaccount_record_id as record_id, q.total_amount,
         q.deposit_amount, q.created_at, q.confirmed_at, q.details->>'project_name' as project_name,
         coalesce((q.details->>'room_count')::int, 1) as room_count,
         exists (select 1 from invoice i where i.quotation_id = q.quotation_id) as has_invoice
  from quotation q join price_estimate e using (estimate_id)
  where e.customer_id = $1`;

export async function customerQuotation(customerId: number, quotationId: number) {
  const r = await pool.query(`${QUOTATION_SQL} and q.quotation_id = $2`, [customerId, quotationId]);
  return r.rows[0] ?? null;
}

// เอกสารทั้งหมดของลูกค้า แยกตามประเภท (Use Case 8)
export async function customerDocuments(customerId: number) {
  const [quotations, invoices, taxInvoices, receipts, contracts] = await Promise.all([
    pool.query(`${QUOTATION_SQL} order by q.created_at desc`, [customerId]),
    pool.query(`${INVOICE_SQL} order by i.invoice_id desc`, [customerId]),
    pool.query(
      `select t.tax_invoice_id, t.flowaccount_serial as serial, t.flowaccount_record_id as record_id, t.created_at,
              p.amount, i.type, q.flowaccount_serial as qt_serial
       from tax_invoice t join payment p using (payment_id) join invoice i using (invoice_id)
       join quotation q using (quotation_id) join price_estimate e using (estimate_id)
       where e.customer_id = $1 order by t.created_at desc`, [customerId]),
    pool.query(
      `select r.receipt_id, r.flowaccount_serial as serial, r.flowaccount_record_id as record_id, r.created_at,
              p.amount, p.pay_method, i.type, q.flowaccount_serial as qt_serial
       from receipt r join payment p using (payment_id) join invoice i using (invoice_id)
       join quotation q using (quotation_id) join price_estimate e using (estimate_id)
       where e.customer_id = $1 order by r.created_at desc`, [customerId]),
    pool.query(
      `select c.contract_id, c.created_at, c.file_url, c.signed_file_url, c.signed_at, q.flowaccount_serial as qt_serial
       from contract c join quotation q using (quotation_id) join price_estimate e using (estimate_id)
       where e.customer_id = $1 order by c.created_at desc`, [customerId]),
  ]);
  return {
    quotations: quotations.rows, invoices: invoices.rows, tax_invoices: taxInvoices.rows,
    receipts: receipts.rows, contracts: contracts.rows,
  };
}

// เอกสาร FlowAccount (recordId) เป็นของลูกค้าคนนี้หรือไม่ กันขอลิงก์เอกสารของคนอื่น
const OWNER_SQL: Record<string, string> = {
  quotations: `select 1 from quotation q join price_estimate e using (estimate_id)
               where q.flowaccount_record_id = $2 and e.customer_id = $1`,
  "billing-notes": `select 1 from invoice i join quotation q using (quotation_id) join price_estimate e using (estimate_id)
                    where i.flowaccount_record_id = $2 and e.customer_id = $1`,
  "tax-invoices": `select 1 from tax_invoice t join payment p using (payment_id) join invoice i using (invoice_id)
                   join quotation q using (quotation_id) join price_estimate e using (estimate_id)
                   where t.flowaccount_record_id = $2 and e.customer_id = $1`,
  receipts: `select 1 from receipt r join payment p using (payment_id) join invoice i using (invoice_id)
             join quotation q using (quotation_id) join price_estimate e using (estimate_id)
             where r.flowaccount_record_id = $2 and e.customer_id = $1`,
};

export async function ownsDocument(customerId: number, docType: string, recordId: number) {
  const sql = OWNER_SQL[docType];
  if (!sql) return false;
  const r = await pool.query(sql, [customerId, recordId]);
  return r.rowCount! > 0;
}

// งานของลูกค้า ตามตาราง Job (Use Case 8) + นัดช่างครั้งถัดไป
//   งานถูกสร้างเมื่อชำระมัดจำแล้ว ใบเสนอราคาที่ยังไม่มีงานจึงไม่แสดงที่นี่ (ดูได้ที่หน้าเอกสาร)
export async function customerJobs(customerId: number) {
  const r = await pool.query(
    `select j.job_id, j.status, j.created_at, j.started_at, j.completed_at,
            q.quotation_id, q.flowaccount_serial as qt_serial, q.total_amount, q.details->>'project_name' as project_name,
            (select min(s.work_time) from job_schedule s where s.job_id = j.job_id and s.work_time >= now()) as next_visit
     from job j join quotation q using (quotation_id) join price_estimate e using (estimate_id)
     where e.customer_id = $1
     order by (j.status = 'closed'), j.created_at desc`,
    [customerId],
  );
  return r.rows;
}
