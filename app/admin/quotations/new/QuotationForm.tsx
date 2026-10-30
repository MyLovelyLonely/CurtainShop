"use client";
// ฟอร์มใบเสนอราคา (Use Case 12): แอดมินแก้ได้แค่ กว้าง / สูง / จำนวนหน้าต่างต่อห้อง
//   สร้าง = POST /api/admin/quotations, แก้ไข (Use Case 15 Alternate Flow) = PUT /api/admin/quotations/{id}
// สินค้า ราคาต่อหน่วย จำนวนห้อง และมัดจำ มาจากใบประเมินราคาและสินค้า แก้ไม่ได้
// แต่ละสินค้าเป็นการ์ดของตัวเอง ช่องกรอกใหญ่ มีป้ายบอกชัด และแสดงวิธีคิดเงินเป็นประโยค
import { useRouter } from "next/navigation";
import { useState } from "react";
import { baht, Card } from "@/components/admin/ui";
import { isAreaUnit, lineArea, lineTotal, missingSize } from "@/lib/pricing";

// item_id = price_estimate_item.item_id (สร้าง) หรือ quotation_item_id (แก้ไข)
type Item = {
  item_id: number; name: string; price_unit: string; unit_price: number;
  width: number | null; height: number | null; quantity: number; // quantity = หน้าต่างต่อห้อง
};

const VAT_RATE = 0.07;
const DEPOSIT_RATE = 0.5;
const r2 = (n: number) => Math.round(n * 100) / 100;

type Mode = { kind: "create"; estimateId: number } | { kind: "edit"; quotationId: number; projectName: string };

// ผู้จัดทำ (แอดมินที่เข้าสู่ระบบ) และการขอใบกำกับภาษี (ลูกค้าแจ้งเอง) แสดงอย่างเดียว แก้ในฟอร์มไม่ได้
export function QuotationForm({ mode, initialItems, roomCount, adminName, wantTaxInvoice }: {
  mode: Mode; initialItems: Item[]; roomCount: number; adminName?: string; wantTaxInvoice?: boolean;
}) {
  const router = useRouter();
  const editing = mode.kind === "edit";
  const [items, setItems] = useState<Item[]>(initialItems);
  const [projectName, setProjectName] = useState(editing ? mode.projectName : "");
  const [saving, setSaving] = useState(false);

  // ทุกห้องใช้รูปแบบเดียวกัน: ยอดรวม = (รวมทุกสินค้าต่อห้อง) x จำนวนห้อง (สูตรเดียวกับ API)
  const roomSubTotal = r2(items.reduce((s, i) => s + lineTotal(i, i.price_unit), 0));
  const subTotal = r2(roomSubTotal * roomCount);
  const vat = r2(subTotal * VAT_RATE);
  const total = r2(subTotal + vat);
  const depositAmount = r2(total * DEPOSIT_RATE);
  const badQty = (it: Item) => !Number.isInteger(it.quantity) || it.quantity < 1;
  const invalid = items.some((i) => missingSize(i, i.price_unit) || badQty(i));

  const update = (idx: number, patch: Partial<Item>) => setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const num = (v: string) => (v === "" ? null : Number(v));

  async function save() {
    setSaving(true);
    const sizes = items.map(({ item_id, width, height, quantity }) => ({ width, height, quantity, item_id }));
    const res = mode.kind === "create"
      ? await fetch("/api/admin/quotations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            estimate_id: mode.estimateId,
            items: sizes,
            project_name: projectName || undefined,
          }),
        })
      : await fetch(`/api/admin/quotations/${mode.quotationId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: sizes.map(({ item_id, ...s }) => ({ ...s, quotation_item_id: item_id })),
            project_name: projectName,
          }),
        });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return alert(data.error ?? "บันทึกไม่สำเร็จ");
    router.push(`/admin/quotations/${data.quotation.quotation_id}`);
    router.refresh();
  }

  const input = "w-full h-12 border-2 border-border rounded-xl px-3 text-lg font-mono bg-white focus:outline-none focus:border-primary";
  const error = "!border-red-500 bg-red-50";

  return (
    <>
      <Card title={roomCount > 1 ? `รายการสินค้าต่อ 1 ห้อง · ลูกค้ามี ${roomCount} ห้อง แบบเดียวกัน` : "รายการสินค้า"} size="lg">
        <div className="px-5 pb-5 space-y-3">
          {items.map((it, idx) => {
            const isArea = isAreaUnit(it.price_unit);
            const area = lineArea(it, it.price_unit);
            const sizeError = missingSize(it, it.price_unit);
            return (
              <div key={it.item_id} className={`rounded-xl border-2 p-4 ${sizeError || badQty(it) ? "border-red-300" : "border-border"}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                  <p className="text-lg font-semibold">
                    <span className="text-muted-foreground mr-2">{idx + 1}.</span>{it.name}
                  </p>
                  <p className="text-base text-muted-foreground">ราคา {baht(it.unit_price)} / {it.price_unit}</p>
                </div>

                <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
                  {isArea && (
                    <>
                      <label className="block">
                        <span className="text-base font-medium">กว้าง (เมตร)</span>
                        <input type="number" inputMode="decimal" step="0.01" min="0" placeholder="0.00"
                          className={`${input} ${sizeError && !(Number(it.width) > 0) ? error : ""}`}
                          value={it.width ?? ""} onChange={(e) => update(idx, { width: num(e.target.value) })} />
                      </label>
                      <label className="block">
                        <span className="text-base font-medium">สูง (เมตร)</span>
                        <input type="number" inputMode="decimal" step="0.01" min="0" placeholder="0.00"
                          className={`${input} ${sizeError && !(Number(it.height) > 0) ? error : ""}`}
                          value={it.height ?? ""} onChange={(e) => update(idx, { height: num(e.target.value) })} />
                      </label>
                    </>
                  )}
                  <label className="block">
                    <span className="text-base font-medium">{isArea ? "จำนวนหน้าต่าง" : `จำนวน (${it.price_unit})`}</span>
                    <input type="number" inputMode="numeric" min="1" step="1"
                      className={`${input} ${badQty(it) ? error : ""}`}
                      value={it.quantity} onChange={(e) => update(idx, { quantity: Number(e.target.value) })} />
                  </label>
                </div>

                {/* วิธีคิดเงินเป็นประโยค ให้ตรวจง่าย */}
                <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 bg-muted/50 rounded-lg px-4 py-3">
                  <p className="text-base text-muted-foreground">
                    {isArea
                      ? `${it.width ?? 0} × ${it.height ?? 0} ม. × ${it.quantity} หน้าต่าง = ${(area ?? 0).toFixed(2)} ตร.ม. × ${baht(it.unit_price)}`
                      : `${it.quantity} ${it.price_unit} × ${baht(it.unit_price)}`}
                  </p>
                  <p className="text-xl font-bold font-mono">{baht(lineTotal(it, it.price_unit))}</p>
                </div>
                {sizeError && <p className="text-base text-red-600 mt-2">กรุณากรอกกว้างและสูงให้ครบ</p>}
                {badQty(it) && <p className="text-base text-red-600 mt-2">จำนวนต้องเป็นเลขเต็มตั้งแต่ 1 ขึ้นไป</p>}
              </div>
            );
          })}
          <p className="text-base text-muted-foreground">
            ราคาต่อหน่วยและจำนวนห้องมาจากใบประเมินราคาและข้อมูลสินค้า แก้ไขได้เฉพาะขนาดและจำนวน
          </p>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="ข้อมูลเอกสาร" size="lg">
          <div className="px-5 pb-5 space-y-4 text-base">
            {!editing && <div>
              <span className="font-medium">ผู้จัดทำ</span>
              <p className="text-lg">{adminName ?? "-"}</p>
            </div>}
            <label className="block">
              <span className="font-medium">ชื่อโปรเจค / สถานที่ติดตั้ง (ไม่บังคับ)</span>
              <input className={`${input} font-sans`} value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="เช่น บ้านคุณสมชาย ห้องนอน" />
            </label>
            {!editing && <div>
              <span className="font-medium">ใบกำกับภาษี</span>
              <p className="text-lg">{wantTaxInvoice ? "ลูกค้าขอใบกำกับภาษี" : "ลูกค้าไม่ได้ขอ"}</p>
              <p className="text-sm text-muted-foreground">ลูกค้าแจ้งเองโดยกรอกเลขผู้เสียภาษีในหน้าข้อมูลของฉันบน LINE</p>
            </div>}
          </div>
        </Card>

        <Card title="สรุปยอดเงิน" size="lg">
          <div className="px-5 pb-5 space-y-2 text-base">
            {roomCount > 1 && <Row label="รวมต่อ 1 ห้อง" value={baht(roomSubTotal)} />}
            {roomCount > 1 && <Row label="จำนวนห้อง" value={`× ${roomCount}`} />}
            <Row label="ยอดรวมสินค้า" value={baht(subTotal)} />
            <Row label="ภาษีมูลค่าเพิ่ม (VAT 7%)" value={baht(vat)} />
            <div className="flex justify-between items-baseline border-t-2 border-border pt-3 mt-1">
              <span className="text-lg font-semibold">รวมทั้งสิ้น</span>
              <span className="text-3xl font-bold font-mono text-primary">{baht(total)}</span>
            </div>
            <Row label="มัดจำ 50% (ชำระก่อน)" value={baht(depositAmount)} />
            <Row label="คงเหลือ (ชำระหลังติดตั้ง)" value={baht(total - depositAmount)} />
            {invalid && <p className="text-base text-red-600 pt-2">ยังกรอกข้อมูลไม่ครบ ดูช่องที่เป็นสีแดงด้านบน</p>}
            <button onClick={save} disabled={saving || !items.length || invalid}
              className="w-full mt-3 bg-primary text-primary-foreground py-4 rounded-xl text-lg font-semibold hover:opacity-90 disabled:opacity-50">
              {saving ? "กำลังบันทึก..." : editing ? "บันทึกการแก้ไข" : "บันทึกและสร้างใบเสนอราคา"}
            </button>
          </div>
        </Card>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
