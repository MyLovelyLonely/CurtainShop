import { pool } from './db'
import type { PoolClient } from 'pg'

// insert แล้วคืนแถวที่เพิ่งสร้าง
async function insert(client: PoolClient, sql: string, params: unknown[] = []) {
  const res = await client.query(sql + ' RETURNING *', params)
  return res.rows[0]
}

async function main() {
  // 1) ทดสอบเชื่อมต่อ
  const now = await pool.query('SELECT NOW()')
  console.log('connect OK:', now.rows[0].now)

  // 2) ลงข้อมูลทุกตาราง ตารางละ 1 แถว (เก็บไว้ ไม่ลบ)
  const client = await pool.connect()
  const suffix = Date.now() // กันชนคอลัมน์ unique เวลารันซ้ำ

  try {
    await client.query('BEGIN')

    const category = await insert(client, 'INSERT INTO category (name) VALUES ($1)', ['ผ้าม่าน'])

    const catalog = await insert(
      client,
      'INSERT INTO catalog (category_id, name, description, file_url) VALUES ($1, $2, $3, $4)',
      [category.category_id, 'Blackout Collection', 'แคตตาล็อกผ้าม่านกันแสง', 'https://example.com/catalog.pdf'],
    )

    const product = await insert(
      client,
      `INSERT INTO product (catalog_id, name, base_price, price_unit, description, image_url, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        catalog.catalog_id,
        'BK-101 ผ้าม่านกันแสงสีเทา',
        1500,
        'ตร.ม.',
        { code: 'BK-101', color: 'เทา', fabric: 'Polyester Blackout' },
        'https://example.com/bk-101.jpg',
        { unit_name: 'ตร.ม.', type: 3, sell_account_code: '41101' },
      ],
    )

    const vector = '[' + Array.from({ length: 1024 }, () => Math.random().toFixed(4)).join(',') + ']'
    const vectorEmbedding = await insert(
      client,
      "INSERT INTO vector_embedding (product_id, embedding_type, vector_data) VALUES ($1, 'text', $2)",
      [product.product_id, vector],
    )

    const customer = await insert(
      client,
      'INSERT INTO customer (line_user_id, display_name, full_name, phone, address) VALUES ($1, $2, $3, $4, $5)',
      [`U-test-${suffix}`, 'สมชาย', 'สมชาย ใจดี', '0812345678', 'กรุงเทพฯ'],
    )

    const admin = await insert(
      client,
      'INSERT INTO admin (username, password_hash, full_name) VALUES ($1, $2, $3)',
      [`admin-${suffix}`, 'test-hash-not-real', 'แอดมิน ทดสอบ'],
    )

    const technician = await insert(
      client,
      'INSERT INTO technician (name, phone, line_id) VALUES ($1, $2, $3)',
      ['ช่างสมศักดิ์', '0898765432', 'somsak.tech'],
    )

    const priceEstimate = await insert(
      client,
      "INSERT INTO price_estimate (customer_id, method, total_price, room_count) VALUES ($1, 'manual', 4500, 1)",
      [customer.customer_id],
    )

    const priceEstimateItem = await insert(
      client,
      'INSERT INTO price_estimate_item (estimate_id, product_id, width, height, quantity) VALUES ($1, $2, 3.00, 2.50, 1)',
      [priceEstimate.estimate_id, product.product_id],
    )

    const quotation = await insert(
      client,
      'INSERT INTO quotation (estimate_id, admin_id, total_amount, deposit_amount) VALUES ($1, $2, 4500, 2250)',
      [priceEstimate.estimate_id, admin.admin_id],
    )

    const quotationItem = await insert(
      client,
      'INSERT INTO quotation_item (quotation_id, product_id, width, height, quantity, unit_price) VALUES ($1, $2, 3.00, 2.50, 1, 4500)',
      [quotation.quotation_id, product.product_id],
    )

    const contract = await insert(
      client,
      'INSERT INTO contract (quotation_id, file_url) VALUES ($1, $2)',
      [quotation.quotation_id, 'https://example.com/contract.pdf'],
    )

    const invoice = await insert(
      client,
      "INSERT INTO invoice (quotation_id, type, amount, due_date) VALUES ($1, 'deposit', 2250, CURRENT_DATE + 7)",
      [quotation.quotation_id],
    )

    const payment = await insert(
      client,
      "INSERT INTO payment (invoice_id, amount, qr_ref, status, pay_method, paid_at) VALUES ($1, 2250, $2, 'paid', 'qr_code', NOW())",
      [invoice.invoice_id, `QR-${suffix}`],
    )

    const receipt = await insert(client, 'INSERT INTO receipt (payment_id) VALUES ($1)', [payment.payment_id])

    const taxInvoice = await insert(
      client,
      "INSERT INTO tax_invoice (payment_id, tax_id) VALUES ($1, '1234567890123')",
      [payment.payment_id],
    )

    const job = await insert(client, 'INSERT INTO job (quotation_id) VALUES ($1)', [quotation.quotation_id])

    const jobSchedule = await insert(
      client,
      "INSERT INTO job_schedule (job_id, technician_id, work_time) VALUES ($1, $2, NOW() + INTERVAL '3 days')",
      [job.job_id, technician.technician_id],
    )

    const qna = await insert(
      client,
      'INSERT INTO qna (admin_id, question, answer) VALUES ($1, $2, $3)',
      [admin.admin_id, 'ใช้เวลาติดตั้งกี่วัน?', 'โดยปกติ 7-14 วันหลังชำระมัดจำ'],
    )

    await client.query('COMMIT')

    console.log('insert OK:', {
      category: category.category_id,
      catalog: catalog.catalog_id,
      product: product.product_id,
      vector_embedding: vectorEmbedding.embedding_id,
      customer: customer.customer_id,
      admin: admin.admin_id,
      technician: technician.technician_id,
      price_estimate: priceEstimate.estimate_id,
      price_estimate_item: priceEstimateItem.item_id,
      quotation: quotation.quotation_id,
      quotation_item: quotationItem.quotation_item_id,
      contract: contract.contract_id,
      invoice: invoice.invoice_id,
      payment: payment.payment_id,
      receipt: receipt.receipt_id,
      tax_invoice: taxInvoice.tax_invoice_id,
      job: job.job_id,
      job_schedule: jobSchedule.schedule_id,
      qna: qna.qna_id,
    })
  } catch (e) {
    await client.query('ROLLBACK') // พังกลางทาง ยกเลิกทั้งชุด ไม่ให้ข้อมูลค้างครึ่ง ๆ
    throw e
  } finally {
    client.release()
  }
}

main()
  .catch((e) => console.error('ERROR:', e.message))
  .finally(() => pool.end())
