"use client";
// ข้อมูลของฉัน (Use Case 1: แสดงข้อมูลลูกค้าหลังเข้าสู่ระบบ)
import { useLiffData } from "@/components/liff/LiffProvider";
import { PageTitle, Panel } from "@/components/liff/ui";

type Me = { customer: { display_name: string; full_name: string | null; phone: string | null; address: string | null } };

export default function LiffProfile() {
  const { data, error } = useLiffData<Me>("/api/liff/me");
  const c = data?.customer;

  return (
    <>
      <PageTitle title="ข้อมูลของฉัน" />
      {error && <Panel className="text-red-700">{error}</Panel>}
      {c && (
        <Panel className="space-y-3 text-base">
          {[
            ["ชื่อใน LINE", c.display_name],
            ["ชื่อ-นามสกุล", c.full_name],
            ["เบอร์โทรศัพท์", c.phone],
            ["ที่อยู่", c.address],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-lg">{value ?? "-"}</p>
            </div>
          ))}
        </Panel>
      )}
    </>
  );
}
