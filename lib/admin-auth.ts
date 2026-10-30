// แอดมินที่เข้าสู่ระบบอยู่ (Use Case 11) ใช้ฝั่งเซิร์ฟเวอร์เท่านั้น
// TODO: ยังไม่มีระบบ login แอดมิน ตอนนี้ mock เป็นแอดมินคนแรกในฐานข้อมูล
//   มีระบบ login แล้วให้อ่านจาก session แทน ห้ามรับ admin_id จากหน้าเว็บ
import "server-only";
import { pool } from "./db";

export type CurrentAdmin = { admin_id: number; full_name: string };

export async function currentAdmin(): Promise<CurrentAdmin | null> {
  const r = await pool.query(`select admin_id, full_name from admin order by admin_id limit 1`);
  return r.rows[0] ?? null;
}
