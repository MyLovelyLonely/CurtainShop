"use client";
// ข้อมูลของฉัน (Use Case 1) ชื่อ LINE ดึงจาก LINE ส่วนอื่นลูกค้ากรอกเองได้
// ที่อยู่ / เลขผู้เสียภาษี / สาขา ใช้ออกใบกำกับภาษีในนามลูกค้า
import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useApi, useLiffData } from "@/components/liff/LiffProvider";
import { PageTitle, Panel } from "@/components/liff/ui";

type Form = { full_name: string; phone: string; address: string; email: string; tax_id: string; branch: string; zip_code: string };
type Me = { customer: { display_name: string; full_name: string | null; phone: string | null; address: string | null; details: Record<string, string> } };

const FIELDS: { key: keyof Form; label: string; hint?: string; type?: string; inputMode?: "numeric" | "email" | "tel"; multiline?: boolean }[] = [
  { key: "full_name", label: "ชื่อ-นามสกุล" },
  { key: "phone", label: "เบอร์โทรศัพท์", type: "tel", inputMode: "tel", hint: "เช่น 0812345678" },
  { key: "email", label: "อีเมล", type: "email", inputMode: "email" },
  { key: "address", label: "ที่อยู่", multiline: true, hint: "ใช้สำหรับนัดติดตั้งและออกเอกสาร" },
  { key: "zip_code", label: "รหัสไปรษณีย์", inputMode: "numeric" },
];
const TAX_FIELDS: typeof FIELDS = [
  { key: "tax_id", label: "เลขประจำตัวผู้เสียภาษี", inputMode: "numeric", hint: "13 หลัก" },
  { key: "branch", label: "สาขา", hint: "เช่น สำนักงานใหญ่" },
];

export default function LiffProfile() {
  const api = useApi();
  const { data, error } = useLiffData<Me>("/api/liff/me");
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    const c = data.customer;
    setForm({
      full_name: c.full_name ?? "", phone: c.phone ?? "", address: c.address ?? "",
      email: c.details.email ?? "", tax_id: c.details.tax_id ?? "", branch: c.details.branch ?? "", zip_code: c.details.zip_code ?? "",
    });
  }, [data]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true); setMsg(null);
    try {
      const { email, tax_id, branch, zip_code, ...rest } = form;
      await api("/api/liff/me", { method: "PUT", body: JSON.stringify({ ...rest, details: { email, tax_id, branch, zip_code } }) });
      setMsg({ ok: true, text: "บันทึกข้อมูลเรียบร้อย" });
    } catch (err) { setMsg({ ok: false, text: (err as Error).message }); }
    setBusy(false);
  }

  const field = (f: (typeof FIELDS)[number]) => {
    const cls = "w-full mt-1 bg-background border-2 border-border rounded-xl px-3 py-3 text-lg focus:border-primary outline-none";
    const props = {
      id: f.key, value: form![f.key], className: cls,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form!, [f.key]: e.target.value }),
    };
    return (
      <label key={f.key} htmlFor={f.key} className="block">
        <span className="text-base font-medium">{f.label}</span>
        {f.multiline ? <textarea rows={3} {...props} /> : <input type={f.type ?? "text"} inputMode={f.inputMode} {...props} />}
        {f.hint && <span className="text-sm text-muted-foreground">{f.hint}</span>}
      </label>
    );
  };

  return (
    <>
      <PageTitle title="ข้อมูลของฉัน" />
      {error && <Panel className="text-red-700 text-base">{error}</Panel>}
      {!form && !error && <Panel className="text-center text-muted-foreground">กำลังโหลด...</Panel>}

      {form && data && (
        <form onSubmit={save} className="space-y-4">
          <Panel>
            <p className="text-sm text-muted-foreground">ชื่อใน LINE</p>
            <p className="text-lg font-semibold">{data.customer.display_name}</p>
          </Panel>

          <Panel className="space-y-4">{FIELDS.map(field)}</Panel>

          <Panel className="space-y-4">
            <div>
              <p className="text-lg font-semibold">สำหรับออกใบกำกับภาษี</p>
              <p className="text-sm text-muted-foreground">กรอกเฉพาะกรณีต้องการใบกำกับภาษีในนามบริษัทหรือร้านค้า</p>
            </div>
            {TAX_FIELDS.map(field)}
          </Panel>

          {msg && (
            <Panel className={`flex items-center gap-2 text-base ${msg.ok ? "text-emerald-800 bg-emerald-50 border-emerald-200" : "text-red-700"}`}>
              {msg.ok && <CheckCircle2 size={20} />} {msg.text}
            </Panel>
          )}

          <button type="submit" disabled={busy}
            className="w-full bg-primary text-primary-foreground rounded-xl py-4 text-lg font-semibold disabled:opacity-50">
            {busy ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
          </button>
        </form>
      )}
    </>
  );
}
