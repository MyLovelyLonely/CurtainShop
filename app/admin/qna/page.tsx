// คำถาม-คำตอบ (Use Case 20)
import { pool } from "@/lib/db";
import QnaManager from "@/components/admin/QnaManager";

export default async function Qna() {
  const { rows } = await pool.query(`
    select q.*, a.full_name as admin_name from qna q join admin a using (admin_id) order by q.qna_id`);

  return (
    <QnaManager rows={rows} />
  );
}
