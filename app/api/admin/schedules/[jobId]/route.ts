// PUT /api/admin/schedules/{jobId} แก้ไขเวลา/ช่าง; DELETE ลบตารางงานทั้งหมดของงานนั้น
import { NextRequest, NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin-auth";
import { deleteJobSchedule, parseScheduleInput, saveJobSchedule } from "@/lib/job-schedule";

type Params = { params: Promise<{ jobId: string }> };

function validId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function PUT(req: NextRequest, { params }: Params) {
  if (!await currentAdmin()) return NextResponse.json({ error: "ไม่พบบัญชีแอดมินที่เข้าสู่ระบบ" }, { status: 401 });
  const jobId = validId((await params).jobId);
  if (!jobId) return NextResponse.json({ error: "รหัสงานไม่ถูกต้อง" }, { status: 400 });
  const parsed = parseScheduleInput(await req.json().catch(() => null), jobId);
  if (parsed.error || !parsed.values) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    await saveJobSchedule(jobId, parsed.values.technicianIds, parsed.values.workTime, true);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = (e as Error).message;
    const status = message.includes("ไม่พบ") ? 404 : 409;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!await currentAdmin()) return NextResponse.json({ error: "ไม่พบบัญชีแอดมินที่เข้าสู่ระบบ" }, { status: 401 });
  const jobId = validId((await params).jobId);
  if (!jobId) return NextResponse.json({ error: "รหัสงานไม่ถูกต้อง" }, { status: 400 });
  try {
    await deleteJobSchedule(jobId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = (e as Error).message;
    const status = message.includes("ไม่พบ") ? 404 : 409;
    return NextResponse.json({ error: message }, { status });
  }
}
