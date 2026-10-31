"use client";
// ใบสัญญาซื้อขายฝั่งลูกค้า: เปิดอ่าน PDF ที่ร้านส่ง -> เซ็น -> ส่งไฟล์ (PDF / รูปถ่าย) กลับ -> รอร้านตรวจสอบ
//   ร้านตีกลับ = แสดงสิ่งที่ต้องแก้ แล้วส่งใหม่ได้
import { useState } from "react";
import { FileText, Upload } from "lucide-react";
import { thDate } from "@/components/admin/ui";
import { useApi } from "@/components/liff/LiffProvider";
import { Panel, Tag } from "@/components/liff/ui";

export type Contract = {
  contract_id: number; created_at: string; file_url: string; signed_file_url: string | null; signed_at: string | null;
  qt_serial: string | null; reject: { note: string; at: string } | null;
};

export function ContractCard({ c, onChange }: { c: Contract; onChange: () => void }) {
  const api = useApi();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const waitingSign = !c.signed_file_url && !c.signed_at;

  async function send() {
    if (!file) return;
    setLoading(true);
    setError(null);
    const form = new FormData();
    form.set("file", file);
    try {
      await api(`/api/liff/contracts/${c.contract_id}/signed`, { method: "POST", body: form });
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Panel className={`space-y-3 ${waitingSign ? "border-2 border-amber-300" : ""}`}>
      <div className="flex justify-between items-start gap-2">
        <div>
          <p className="text-lg font-semibold">ใบสัญญาซื้อขาย</p>
          <p className="text-sm text-muted-foreground">ใบเสนอราคา {c.qt_serial ?? "-"} · {thDate(c.created_at)}</p>
        </div>
        {c.signed_at ? <Tag tone="emerald">ร้านยืนยันแล้ว</Tag>
          : c.signed_file_url ? <Tag tone="blue">รอร้านตรวจสอบ</Tag>
          : <Tag tone="amber">{c.reject ? "ต้องแก้ไข" : "รอเซ็น"}</Tag>}
      </div>

      {/* TODO: ยังไม่เปิดไฟล์ (c.file_url) ปุ่มไว้ก่อน */}
      <button type="button"
        className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-lg font-semibold bg-muted text-foreground">
        <FileText size={20} /> เปิดอ่านใบสัญญา
      </button>

      {waitingSign && (
        <>
          {c.reject && (
            <p className="text-base bg-red-50 text-red-800 rounded-xl px-3 py-2">ร้านแจ้งให้แก้ไข: {c.reject.note}</p>
          )}
          <label className="block text-base">
            <span className="text-muted-foreground">เซ็นชื่อแล้ว ส่งไฟล์ PDF หรือรูปถ่ายกลับมา</span>
            <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-2 block w-full text-base file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-muted file:font-medium" />
          </label>
          {error && <p className="text-base text-red-700">{error}</p>}
          <button onClick={send} disabled={!file || loading}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-lg font-semibold bg-primary text-primary-foreground disabled:opacity-50">
            <Upload size={20} /> {loading ? "กำลังส่ง..." : "ส่งใบสัญญาที่เซ็นแล้ว"}
          </button>
        </>
      )}

      {c.signed_file_url && (
        // TODO: ยังไม่เปิดไฟล์ (c.signed_file_url) ปุ่มไว้ก่อน
        <button type="button" className="block w-full text-center text-base text-primary underline">
          ดูไฟล์ที่ส่งไป
        </button>
      )}
    </Panel>
  );
}
