"use client";
// ข้อมูลของฉัน (Use Case 1) ชื่อ LINE ดึงจาก LINE ส่วนอื่นลูกค้ากรอกเองได้
// ชื่อ เบอร์ ที่อยู่ (+ อีเมล รหัสไปรษณีย์) เก็บในตาราง customer ใช้เป็นค่าเริ่มต้นของใบประเมินราคา
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useApi, useLiffData } from "@/components/liff/LiffProvider";
import { PageTitle, Panel } from "@/components/liff/ui";
import { ProfileForm, profileFrom, profileMissing, type Me, type Profile } from "@/components/liff/BuyerInfo";

export default function LiffProfile() {
  const api = useApi();
  const { data, error } = useLiffData<Me>("/api/liff/me");
  const [edited, setEdited] = useState<Profile | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const saved = data ? profileFrom(data) : null;
  const form = edited ?? saved;
  const missing = form && profileMissing(form);
  const changed = Boolean(form && saved && Object.keys(form).some((key) =>
    form[key as keyof Profile] !== saved[key as keyof Profile]
  ));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !changed) return;
    setBusy(true); setMsg(null);
    try {
      await api("/api/liff/me", { method: "PUT", body: JSON.stringify(form) });
      setMsg({ ok: true, text: "บันทึกข้อมูลเรียบร้อย" });
      setEditing(false);
    } catch (err) { setMsg({ ok: false, text: (err as Error).message }); }
    setBusy(false);
  }

  return (
    <>
      <PageTitle title="ข้อมูลของฉัน" />
      {error && <Panel className="text-red-700 text-base">{error}</Panel>}
      {!form && !error && <Panel className="text-center text-muted-foreground">กำลังโหลด...</Panel>}

      {form && data && (
        <div className="space-y-4">
          <Panel>
            <p className="text-sm text-muted-foreground">ชื่อใน LINE</p>
            <p className="text-lg font-semibold">{data.customer.display_name}</p>
          </Panel>

          {editing ? (
            <form onSubmit={save} className="space-y-4">
              <Panel>
                <ProfileForm value={form} onChange={(b) => { setEdited(b); setMsg(null); }} />
              </Panel>

              {msg && (
                <Panel className={`flex items-center gap-2 text-base ${msg.ok ? "text-emerald-800 bg-emerald-50 border-emerald-200" : "text-red-700"}`}>
                  {msg.ok && <CheckCircle2 size={20} />} {msg.text}
                </Panel>
              )}
              {missing && <p className="text-base text-amber-800">กรุณากรอก{missing}</p>}

              <div className="grid grid-cols-2 gap-3">
                <button type="button" disabled={busy} onClick={() => { setEditing(false); setEdited(null); setMsg(null); }}
                  className="w-full border-2 border-border bg-transparent text-foreground rounded-xl py-4 text-lg font-semibold disabled:opacity-50">
                  ยกเลิก
                </button>
                <button type="submit" disabled={busy || Boolean(missing) || !changed}
                  className="w-full bg-primary text-primary-foreground rounded-xl py-4 text-lg font-semibold disabled:opacity-50">
                  {busy ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
                </button>
              </div>
            </form>
          ) : (
            <>
              <Panel className="space-y-3">
                <ProfileValue label="ชื่อ-นามสกุล" value={form.name} />
                <ProfileValue label="เบอร์มือถือ" value={form.phone} />
                <ProfileValue label="ที่อยู่" value={form.address} />
                <ProfileValue label="อีเมล" value={form.email} />
                <ProfileValue label="รหัสไปรษณีย์" value={form.zip_code} />
              </Panel>
              {msg && (
                <Panel className="flex items-center gap-2 text-base text-emerald-800 bg-emerald-50 border-emerald-200">
                  <CheckCircle2 size={20} /> {msg.text}
                </Panel>
              )}
              <button type="button" onClick={() => { setEditing(true); setMsg(null); }}
                className="w-full border-2 border-primary bg-transparent text-primary rounded-xl py-4 text-lg font-semibold">
                แก้ไข
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

function ProfileValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-semibold break-words">{value || "-"}</p>
    </div>
  );
}
