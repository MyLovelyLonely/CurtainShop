// POST /api/admin/contracts/{contract_id}/review   แอดมินตรวจใบสัญญาที่ลูกค้าเซ็นส่งกลับมา
// body: { action: "confirm" } หรือ { action: "reject", note }
//   confirm = signed_at = now() แล้วแจ้งลูกค้าว่ายืนยันแล้ว
//   reject  = ล้าง signed_file_url ให้ลูกค้าส่งใหม่ เก็บเหตุผลใน quotation.details.contract_reject แล้วแจ้ง LINE
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { notifyContractConfirmed, notifyContractRejected } from "@/lib/line";
import { contractStatus } from "@/lib/contract";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const { action, note } = await req.json().catch(() => ({}));
  if (action !== "confirm" && action !== "reject") {
    return NextResponse.json({ error: "action ต้องเป็น confirm หรือ reject" }, { status: 400 });
  }
  if (action === "reject" && !String(note ?? "").trim()) {
    return NextResponse.json({ error: "กรุณาระบุสิ่งที่ลูกค้าต้องแก้ไข" }, { status: 400 });
  }

  try {
    const r = await pool.query(`select * from contract where contract_id = $1`, [id]);
    const contract = r.rows[0];
    if (!contract) return NextResponse.json({ error: "ไม่พบใบสัญญา" }, { status: 404 });
    if (contractStatus(contract) !== "waiting_review") {
      return NextResponse.json({ error: "ใบสัญญานี้ไม่ได้อยู่ในสถานะรอตรวจสอบ" }, { status: 409 });
    }

    if (action === "confirm") {
      await pool.query(`update contract set signed_at = now() where contract_id = $1 and signed_at is null`, [id]);
      await notifyContractConfirmed(contract.contract_id);
    } else {
      const reason = String(note).trim();
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query(`update contract set signed_file_url = null where contract_id = $1`, [id]);
        await client.query(
          `update quotation set details = details || jsonb_build_object('contract_reject', jsonb_build_object('note', $1::text, 'at', now()))
           where quotation_id = $2`,
          [reason, contract.quotation_id],
        );
        await client.query("commit");
      } catch (e) {
        await client.query("rollback").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
      await notifyContractRejected(contract.contract_id, reason);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
