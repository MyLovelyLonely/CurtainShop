"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { Card, JOB_STATUS, PageHeader, StatusBadge, Table } from "@/components/admin/ui";

type Technician = {
  technician_id: number; name: string; phone: string; line_id: string | null; done: number; total: number;
};
type Job = {
  job_id: number; status: string; quotation_id: number; quotation_serial: string | null; customer: string; address: string | null; has_schedule: boolean;
};
type Schedule = Job & { work_time: string; technician_ids: number[]; technicians: string };
type Props = { month: string; today: string; technicians: Technician[]; jobs: Job[]; schedule: Schedule[] };
type TechnicianForm = { technician_id?: number; name: string; phone: string; line_id: string };
type ScheduleForm = { job_id?: number; work_time: string; technician_ids: number[]; editing?: boolean };

const buttonStyle = "inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50";
const primaryStyle = "inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50";
const inputStyle = "w-full rounded-xl border-2 border-border bg-card px-3 py-2.5 outline-none focus:border-primary";
const WEEKDAYS = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."];
const WORK_DURATION_HOURS = 4;
function bangkokDateTime(date: string) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date(date));
}

function bangkokTime(date: string) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(date));
}

function bangkokDay(date: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(date));
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}-${parts.find((p) => p.type === "day")?.value}`;
}

function localDateTimeValue(date: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(date)).replace(" ", "T");
}

function toBangkokIso(value: string) {
  return new Date(`${value}:00+07:00`).toISOString();
}

function monthLabel(month: string) {
  const [year, value] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", month: "long", year: "numeric" })
    .format(new Date(Date.UTC(year, value - 1, 1, 12)));
}

function monthCells(month: string) {
  const [year, value] = month.split("-").map(Number);
  const days = new Date(year, value, 0).getDate();
  const mondayOffset = (new Date(Date.UTC(year, value - 1, 1)).getUTCDay() + 6) % 7;
  return [...Array(mondayOffset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
}

function monthShift(month: string, delta: number) {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(year, value - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function defaultWorkTime(day: string) {
  return `${day}T09:00`;
}

function ScheduleChip({ appointment, onEdit }: { appointment: Schedule; onEdit: (appointment: Schedule) => void }) {
  const endTime = new Date(new Date(appointment.work_time).getTime() + WORK_DURATION_HOURS * 60 * 60 * 1000).toISOString();
  const content = (
    <>
      <span className="block font-semibold">{bangkokTime(appointment.work_time)}-{bangkokTime(endTime)}</span>
      <span className="block truncate">{appointment.customer || `งาน #${appointment.job_id}`}</span>
      <span className="block truncate text-muted-foreground">{appointment.technicians}</span>
    </>
  );
  const style = "block w-full truncate rounded-md border border-primary/20 bg-primary/10 px-1.5 py-1 text-left text-[11px] leading-tight sm:text-xs";

  return ["completed", "closed"].includes(appointment.status)
    ? <div className={`${style} opacity-60`} title="งานเสร็จแล้ว แก้ไขตารางไม่ได้">{content}</div>
    : <button type="button" onClick={() => onEdit(appointment)} className={`${style} hover:bg-primary/20`}>{content}</button>;
}

async function responseError(response: Response) {
  const body = await response.json().catch(() => ({}));
  return body.error ?? "ดำเนินการไม่สำเร็จ";
}

export default function TechnicianManager({ month, today, technicians, jobs, schedule }: Props) {
  const router = useRouter();
  const [technicianForm, setTechnicianForm] = useState<TechnicianForm | null>(null);
  const [scheduleForm, setScheduleForm] = useState<ScheduleForm | null>(null);
  const [technicianFilter, setTechnicianFilter] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectedJob = scheduleForm?.job_id ? jobs.find((job) => job.job_id === scheduleForm.job_id) : null;
  const appointmentsByDay = new Map<string, Schedule[]>();
  const visibleSchedule = schedule.filter((appointment) =>
    technicianFilter === null || appointment.technician_ids.includes(technicianFilter)
  );
  for (const appointment of visibleSchedule) {
    const day = bangkokDay(appointment.work_time);
    appointmentsByDay.set(day, [...(appointmentsByDay.get(day) ?? []), appointment]);
  }
  function openNewSchedule(day: string) {
    setError("");
    setScheduleForm({ work_time: defaultWorkTime(day), technician_ids: [], editing: false });
  }

  function openSchedule(appointment: Schedule) {
    setError("");
    setScheduleForm({
      job_id: appointment.job_id,
      work_time: localDateTimeValue(appointment.work_time),
      technician_ids: appointment.technician_ids,
      editing: true,
    });
  }

  async function saveTechnician(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!technicianForm) return;
    setBusy(true); setError("");
    try {
      const editing = Boolean(technicianForm.technician_id);
      const response = await fetch(editing ? `/api/admin/technicians/${technicianForm.technician_id}` : "/api/admin/technicians", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(technicianForm),
      });
      if (!response.ok) throw new Error(await responseError(response));
      setTechnicianForm(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteTechnician(technician: Technician) {
    if (!confirm(`ลบข้อมูลช่าง ${technician.name} ?`)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/technicians/${technician.technician_id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseError(response));
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveSchedule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!scheduleForm?.job_id) {
      setError("กรุณาเลือกงาน");
      return;
    }
    setBusy(true); setError("");
    try {
      const response = await fetch(scheduleForm.editing ? `/api/admin/schedules/${scheduleForm.job_id}` : "/api/admin/schedules", {
        method: scheduleForm.editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...scheduleForm, work_time: toBangkokIso(scheduleForm.work_time) }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      setScheduleForm(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteSchedule() {
    if (!scheduleForm?.job_id || !confirm("ลบตารางงานของงานนี้หรือไม่?")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/schedules/${scheduleForm.job_id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseError(response));
      setScheduleForm(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function toggleTechnician(technicianId: number) {
    setScheduleForm((current) => current && ({
      ...current,
      technician_ids: current.technician_ids.includes(technicianId)
        ? current.technician_ids.filter((id) => id !== technicianId)
        : [...current.technician_ids, technicianId],
    }));
  }

  const cells = monthCells(month);
  const rows = Math.ceil(cells.length / 7);
  const monthHref = (value: string) => `/admin/technicians?month=${value}`;

  return (
    <>
      <PageHeader title="ช่างและตารางงาน" sub={`ช่างทั้งหมด ${technicians.length} คน`}>
        <button type="button" onClick={() => { setError(""); setTechnicianForm({ name: "", phone: "", line_id: "" }); }} className={primaryStyle}>
          <Plus size={18} /> เพิ่มช่าง
        </button>
      </PageHeader>

      {error && !technicianForm && !scheduleForm && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
      )}

      <Card title="ข้อมูลช่าง">
        <Table headers={["ชื่อ", "เบอร์ติดต่อ", "LINE", "งานสำเร็จ", "งานทั้งหมด", ""]}>
          {technicians.map((technician) => (
            <tr key={technician.technician_id}>
              <td className="font-semibold">{technician.name}</td>
              <td>{technician.phone}</td>
              <td>{technician.line_id || "-"}</td>
              <td>{technician.done}</td>
              <td>{technician.total}</td>
              <td className="whitespace-nowrap text-right">
                <button type="button" aria-label="แก้ไขข้อมูลช่าง" className={`${buttonStyle} mr-2`}
                  onClick={() => { setError(""); setTechnicianForm({ ...technician, line_id: technician.line_id ?? "" }); }}>
                  <Pencil size={15} /> แก้ไข
                </button>
                <button type="button" aria-label="ลบข้อมูลช่าง" disabled={busy} className={buttonStyle}
                  onClick={() => deleteTechnician(technician)}>
                  <Trash2 size={15} /> ลบ
                </button>
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card title="ปฏิทินตารางงานช่าง">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <Link aria-label="เดือนก่อน" href={monthHref(monthShift(month, -1))} className={buttonStyle}><ChevronLeft size={18} /></Link>
            <h2 className="min-w-36 text-center text-lg font-semibold">{monthLabel(month)}</h2>
            <Link aria-label="เดือนถัดไป" href={monthHref(monthShift(month, 1))} className={buttonStyle}><ChevronRight size={18} /></Link>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">แสดงคิวของ</span>
            <select value={technicianFilter ?? ""} onChange={(e) => setTechnicianFilter(e.target.value ? Number(e.target.value) : null)}
              className="rounded-xl border border-border bg-card px-3 py-2">
              <option value="">ช่างทุกคน</option>
              {technicians.map((technician) => <option key={technician.technician_id} value={technician.technician_id}>{technician.name}</option>)}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-7 border-l border-t border-border">
          {WEEKDAYS.map((day) => (
            <div key={day} className="border-b border-r border-border bg-muted/50 py-2 text-center text-xs font-semibold text-muted-foreground">{day}</div>
          ))}
          {Array.from({ length: rows * 7 }, (_, index) => {
            const day = cells[index] ?? null;
            const date = day ? `${month}-${String(day).padStart(2, "0")}` : null;
            const dayAppointments = date ? appointmentsByDay.get(date) ?? [] : [];
            return (
              <div key={index} className={`min-h-28 border-b border-r border-border p-1.5 sm:min-h-36 ${day ? "bg-card" : "bg-muted/20"}`}>
                {day && (
                  <>
                    <div className="mb-1 flex items-center justify-between">
                      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${date === today ? "bg-primary font-bold text-primary-foreground" : ""}`}>{day}</span>
                      <button type="button" aria-label={`เพิ่มงานวันที่ ${day}`} onClick={() => openNewSchedule(date!)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted"><Plus size={15} /></button>
                    </div>
                    <div className="space-y-1">
                      {dayAppointments.map((appointment) => (
                        <ScheduleChip key={appointment.job_id} appointment={appointment} onEdit={openSchedule} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <p className="p-4 text-sm text-muted-foreground">
          คิวงานนับ {WORK_DURATION_HOURS} ชั่วโมงจากเวลาเริ่ม ช่างคนเดิมไม่สามารถรับงานที่เวลาทับซ้อนกันได้
        </p>
      </Card>

      <Card title="ตารางงานในเดือนที่เลือก">
        <Table headers={["วัน-เวลาเริ่ม", "ช่าง", "ลูกค้า", "สถานที่", "สถานะงาน"]} empty={!visibleSchedule.length}>
          {visibleSchedule.map((item) => (
            <tr key={item.job_id}>
              <td className="whitespace-nowrap">{bangkokDateTime(item.work_time)}</td>
              <td>{item.technicians}</td>
              <td>{item.customer || "-"}</td>
              <td className="text-muted-foreground">{item.address || "-"}</td>
              <td><StatusBadge map={JOB_STATUS} status={item.status} /></td>
            </tr>
          ))}
        </Table>
      </Card>

      {technicianForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={saveTechnician} className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-5 shadow-xl">
            <h2 className="text-lg font-bold">{technicianForm.technician_id ? "แก้ไขข้อมูลช่าง" : "เพิ่มช่าง"}</h2>
            <label className="block space-y-1 text-sm">
              <span>ชื่อช่าง</span>
              <input required value={technicianForm.name} onChange={(e) => setTechnicianForm({ ...technicianForm, name: e.target.value })} className={inputStyle} />
            </label>
            <label className="block space-y-1 text-sm">
              <span>เบอร์ติดต่อ</span>
              <input required type="tel" inputMode="tel" value={technicianForm.phone} onChange={(e) => setTechnicianForm({ ...technicianForm, phone: e.target.value })} className={inputStyle} />
            </label>
            <label className="block space-y-1 text-sm">
              <span>LINE (ไม่บังคับ)</span>
              <input value={technicianForm.line_id} onChange={(e) => setTechnicianForm({ ...technicianForm, line_id: e.target.value })} className={inputStyle} />
            </label>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => { setTechnicianForm(null); setError(""); }} className={buttonStyle}>ยกเลิก</button>
              <button type="submit" disabled={busy} className={primaryStyle}>{busy ? "กำลังบันทึก..." : "บันทึกข้อมูล"}</button>
            </div>
          </form>
        </div>
      )}

      {scheduleForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={saveSchedule} className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl">
            <h2 className="text-lg font-bold">{scheduleForm.job_id ? "แก้ไขตารางงาน" : "เพิ่มตารางงาน"}</h2>
            <label className="block space-y-1 text-sm">
              <span>งาน / ลูกค้า</span>
              <select required disabled={Boolean(scheduleForm.job_id)} value={scheduleForm.job_id ?? ""}
                onChange={(e) => setScheduleForm({ ...scheduleForm, job_id: Number(e.target.value) || undefined })}
                className={inputStyle}>
                <option value="">เลือกงาน</option>
                {jobs.filter((job) => scheduleForm.editing || !job.has_schedule).map((job) => (
                  <option key={job.job_id} value={job.job_id}>
                    {job.customer || "ไม่ระบุลูกค้า"} · {job.quotation_serial ?? `งาน #${job.job_id}`}
                  </option>
                ))}
              </select>
            </label>
            {selectedJob && (
              <p className="text-sm text-muted-foreground">{selectedJob.address || "ไม่มีที่อยู่"} · {selectedJob.quotation_serial ?? `งาน #${selectedJob.job_id}`}</p>
            )}
            <label className="block space-y-1 text-sm">
              <span>วันและเวลาเริ่ม</span>
              <input required type="datetime-local" value={scheduleForm.work_time}
                onChange={(e) => setScheduleForm({ ...scheduleForm, work_time: e.target.value })} className={inputStyle} />
            </label>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">ช่างที่มอบหมาย (เลือกได้หลายคน)</legend>
              {!technicians.length && <p className="text-sm text-muted-foreground">เพิ่มข้อมูลช่างก่อนจัดตารางงาน</p>}
              {technicians.map((technician) => (
                <label key={technician.technician_id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                  <input type="checkbox" checked={scheduleForm.technician_ids.includes(technician.technician_id)}
                    onChange={() => toggleTechnician(technician.technician_id)} className="h-4 w-4 accent-[var(--primary)]" />
                  {technician.name} <span className="text-muted-foreground">{technician.phone}</span>
                </label>
              ))}
            </fieldset>
            <p className="text-xs text-muted-foreground">ระบบกันคิวชนโดยนับระยะเวลางาน 4 ชั่วโมงจากเวลาเริ่ม</p>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                {scheduleForm.job_id && (
                  <button type="button" disabled={busy} onClick={deleteSchedule}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
                    <Trash2 size={15} /> ลบตาราง
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => { setScheduleForm(null); setError(""); }} className={buttonStyle}>ยกเลิก</button>
                <button type="submit" disabled={busy || !technicians.length} className={primaryStyle}>{busy ? "กำลังบันทึก..." : "บันทึกตาราง"}</button>
              </div>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
