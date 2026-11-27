// ข้อมูลลูกค้าบนเอกสาร ใช้ร่วมกันทั้งหน้าใบประเมินราคา หน้าใบเสนอราคา และหน้าข้อมูลของฉัน
//   ข้อมูลของฉัน = ตาราง customer (ฟอร์มง่าย ProfileForm)
//   ใบประเมินราคา = price_estimate.details.billing (ฟอร์มบุคคลธรรมดา / นิติบุคคล EstimateBuyerForm)
//   ใบเสนอราคา = สำเนาใน quotation.details.customer คัดลอกจากใบประเมิน (lib/documents.ts buyerSnapshot)
//   คีย์ตรงกับช่อง contact* ของ FlowAccount

export type Buyer = {
  contact_group?: "person" | "company"; // contactGroup 1 = บุคคลธรรมดา, 3 = นิติบุคคล
  name?: string | null;                 // contactName   ชื่อ-นามสกุล หรือ ชื่อธุรกิจ
  contact_person?: string | null;       // contactPerson ชื่อผู้ติดต่อ (นิติบุคคล)
  phone?: string | null;                // contactNumber
  address?: string | null;              // contactAddress
  tax_id?: string | null;               // contactTaxId  (นิติบุคคล หรือบุคคลที่ขอใบกำกับภาษี)
  branch?: string | null;               // contactBranch (นิติบุคคล)
  email?: string | null;                // contactEmail
  zip_code?: string | null;             // contactZipCode
  want_tax_invoice?: boolean;           // ลูกค้าติ๊ก "ขอใบกำกับภาษี" (ไม่ส่งไป FlowAccount ใช้บอกแอดมิน)
};

export function BuyerGrid({ buyer: b }: { buyer: Buyer }) {
  const company = b.contact_group === "company";
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-base">
      <Field label={company ? "ลูกค้า (นิติบุคคล)" : "ลูกค้า / Customer"} value={b.name} />
      <Field label="โทรศัพท์" value={b.phone} />
      {company && <Field label="ผู้ติดต่อ" value={b.contact_person} />}
      {b.tax_id && <Field label="เลขผู้เสียภาษี" value={`${b.tax_id}${b.branch ? ` (${b.branch})` : ""}`} />}
      <Field label="สถานที่" value={[b.address, b.zip_code].filter(Boolean).join(" ")} wide />
      {b.email && <Field label="อีเมล" value={b.email} wide />}
      {b.want_tax_invoice && <Field label="ใบกำกับภาษี" value="ขอใบกำกับภาษี" />}
    </dl>
  );
}

function Field({ label, value, wide }: { label: string; value?: string | null; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-semibold break-words">{value || "-"}</dd>
    </div>
  );
}

export type Me = { customer: { display_name?: string; full_name: string | null; phone: string | null; address: string | null; details: Record<string, string> } };

const INPUT = "w-full border-2 border-border rounded-xl px-3 py-2 text-base bg-card focus:border-primary outline-none";

// ช่องกรอก 1 ช่อง (textarea เมื่อ multiline)
function Input({ label, value, onChange, multiline, ...props }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return (
    <label className="block space-y-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      {multiline
        ? <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} className={INPUT} />
        : <input value={value} onChange={(e) => onChange(e.target.value)} className={INPUT} {...props} />}
    </label>
  );
}

// ช่องที่ยังขาด เป็นข้อความ เช่น " ชื่อ-นามสกุล, ที่อยู่" (ครบ = null) ตรวจรูปแบบละเอียดที่เซิร์ฟเวอร์
function missingText(need: [string, string][]) {
  const list = need.filter(([v]) => !v.trim()).map(([, label]) => label);
  return list.length ? ` ${list.join(", ")}` : null;
}

// ---------- ข้อมูลของฉัน: ชื่อ เบอร์ ที่อยู่ (+ อีเมล รหัสไปรษณีย์ ไม่บังคับ) ----------

export type Profile = { name: string; phone: string; address: string; email: string; zip_code: string };

export function profileFrom({ customer: c }: Me): Profile {
  return { name: c.full_name ?? "", phone: c.phone ?? "", address: c.address ?? "", email: c.details.email ?? "", zip_code: c.details.zip_code ?? "" };
}

export const profileMissing = (p: Profile) => missingText([[p.name, "ชื่อ-นามสกุล"], [p.phone, "เบอร์มือถือ"], [p.address, "ที่อยู่"]]);

export function ProfileForm({ value: p, onChange }: { value: Profile; onChange: (p: Profile) => void }) {
  const set = (key: keyof Profile) => (v: string) => onChange({ ...p, [key]: v });
  return (
    <div className="space-y-3">
      <Input label="ชื่อ-นามสกุล" value={p.name} onChange={set("name")} />
      <Input label="เบอร์มือถือ" value={p.phone} onChange={set("phone")} type="tel" inputMode="tel" placeholder="เช่น 0812345678" />
      <Input label="ที่อยู่" value={p.address} onChange={set("address")} multiline />
      <Input label="อีเมล (ไม่บังคับ)" value={p.email} onChange={set("email")} type="email" inputMode="email" />
      <Input label="รหัสไปรษณีย์ (ไม่บังคับ)" value={p.zip_code} onChange={set("zip_code")} inputMode="numeric" />
    </div>
  );
}

// ---------- ใบประเมินราคา: บุคคลธรรมดา / นิติบุคคล (เก็บใน price_estimate.details.billing) ----------
//   ช่องของ FlowAccount ที่ลูกค้าไม่ต้องกรอก: รหัสผู้ติดต่อ (FlowAccount ออกเอง), เครดิต (ร้านกำหนด), ข้อมูลธนาคาร (ใช้กับผู้จำหน่าย)

export type EstimateBuyer = Required<{ [K in keyof Omit<Buyer, "contact_group" | "want_tax_invoice">]: string }> & {
  contact_group: "person" | "company";
  want_tax_invoice: boolean;
};
const HQ = "สำนักงานใหญ่";

// ค่าเริ่มต้น = ข้อมูลของฉัน (บุคคลธรรมดา)
export function estimateBuyerFrom(me: Me): EstimateBuyer {
  return { ...profileFrom(me), contact_group: "person", contact_person: "", tax_id: "", branch: "", want_tax_invoice: false };
}

// บุคคลธรรมดา = ไม่มีผู้ติดต่อ / สาขา, เลขผู้เสียภาษีมีเฉพาะตอนขอใบกำกับภาษี
export function cleanEstimateBuyer(b: EstimateBuyer): EstimateBuyer {
  if (b.contact_group === "company") return { ...b, tax_id: b.want_tax_invoice ? b.tax_id : "" };
  return { ...b, contact_person: "", branch: "", tax_id: b.want_tax_invoice ? b.tax_id : "" };
}

export function estimateBuyerMissing(b: EstimateBuyer) {
  const company = b.contact_group === "company";
  return missingText([
    [b.name, company ? "ชื่อธุรกิจ" : "ชื่อ-นามสกุล"],
    ...(company ? [[b.contact_person, "ชื่อผู้ติดต่อ"], [b.branch, "เลขที่สาขา"]] as [string, string][] : []),
    ...(b.want_tax_invoice ? [[b.tax_id, "เลขผู้เสียภาษี"]] as [string, string][] : []),
    [b.phone, "เบอร์มือถือ"],
    [b.address, "ที่อยู่"],
  ]);
}

export function EstimateBuyerForm({ value: b, onChange }: { value: EstimateBuyer; onChange: (b: EstimateBuyer) => void }) {
  const company = b.contact_group === "company";
  const set = (key: Exclude<keyof EstimateBuyer, "want_tax_invoice">) => (v: string) => onChange({ ...b, [key]: v });
  // สลับประเภท: ชื่อคนเดิมย้ายไปเป็นผู้ติดต่อ / ผู้ติดต่อกลับมาเป็นชื่อ
  const switchGroup = (g: EstimateBuyer["contact_group"]) => {
    if (g === b.contact_group) return;
    onChange(g === "company"
      ? { ...b, contact_group: g, contact_person: b.contact_person || b.name, name: "", branch: b.branch || HQ }
      : { ...b, contact_group: g, name: b.contact_person || b.name });
  };
  const choice = (on: boolean) => `rounded-xl py-2 text-base font-semibold border-2 ${on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`;
  const isHQ = b.branch === HQ;
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm text-muted-foreground mb-1">ประเภท</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => switchGroup("person")} className={choice(!company)}>บุคคลธรรมดา</button>
          <button type="button" onClick={() => switchGroup("company")} className={choice(company)}>นิติบุคคล</button>
        </div>
      </div>
      <Input label={company ? "ชื่อธุรกิจ" : "ชื่อ-นามสกุล"} value={b.name} onChange={set("name")}
        placeholder={company ? "เช่น บริษัท ตัวอย่าง จำกัด" : undefined} />
      {company && (
        <>
          <Input label="ชื่อผู้ติดต่อ" value={b.contact_person} onChange={set("contact_person")} />
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">สำนักงาน/สาขา</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => onChange({ ...b, branch: HQ })} className={choice(isHQ)}>สำนักงานใหญ่</button>
              <button type="button" onClick={() => onChange({ ...b, branch: isHQ ? "" : b.branch })} className={choice(!isHQ)}>สาขา</button>
            </div>
            {!isHQ && <input value={b.branch} onChange={(e) => onChange({ ...b, branch: e.target.value })} placeholder="เลขที่สาขา เช่น 00001" className={INPUT} />}
          </div>
        </>
      )}
      <Input label="เบอร์มือถือ" value={b.phone} onChange={set("phone")} type="tel" inputMode="tel" />
      <Input label="ที่อยู่" value={b.address} onChange={set("address")} multiline />
      <Input label="อีเมล (ไม่บังคับ)" value={b.email} onChange={set("email")} type="email" inputMode="email" />
      <Input label="รหัสไปรษณีย์ (ไม่บังคับ)" value={b.zip_code} onChange={set("zip_code")} inputMode="numeric" />

      {/* ขอใบกำกับภาษี: ติ๊กแล้วจึงกรอกเลขผู้เสียภาษี */}
      <div className="space-y-3 rounded-xl bg-muted/50 p-3">
        <label className="flex items-center gap-2 text-base font-medium">
          <input type="checkbox" checked={b.want_tax_invoice}
            onChange={(e) => onChange({ ...b, want_tax_invoice: e.target.checked })} className="w-5 h-5 accent-[var(--primary)]" />
          ขอใบกำกับภาษี
        </label>
        {b.want_tax_invoice && (
          <Input label={company ? "เลขผู้เสียภาษี" : "เลขผู้เสียภาษี (เลขบัตรประชาชน)"} value={b.tax_id} onChange={set("tax_id")}
            inputMode="numeric" placeholder="13 หลัก" />
        )}
      </div>
    </div>
  );
}
