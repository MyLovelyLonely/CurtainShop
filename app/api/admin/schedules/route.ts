// POST /api/admin/schedules จัดตารางงานและมอบหมายช่างได้หลายคน
import { NextRequest, NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin-auth";
import { parseScheduleInput, saveJobSchedule } from "@/lib/job-schedule";

export async function POST(req: NextRequest) {
  if (!await currentAdmin()) return NextResponse.json({ error: "ไม่พบบัญชีแอดมินที่เข้าสู่ระบบ" }, { status: 401 });
  const parsed = parseScheduleInput(await req.json().catch(() => null));
  if (parsed.error || !parsed.values) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    await saveJobSchedule(parsed.values.jobId, parsed.values.technicianIds, parsed.values.workTime, false);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    const message = (e as Error).message;
    const status = message.includes("ไม่พบ") ? 404 : 409;
    return NextResponse.json({ error: message }, { status });
  }
}
