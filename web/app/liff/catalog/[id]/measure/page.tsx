"use client"
import { use, useState } from "react";
import { useLiffData } from "@/components/liff/LiffProvider";
import { useCart } from "@/components/liff/CartProvider";
import { PageHeader } from "@/components/liff/PageHeader";
import { Plus, Trash2 } from "lucide-react";
import { isAreaUnit, lineTotal, lineArea, missingSize, priceMode } from "@/lib/pricing";
import { MAX_QTY } from "@/lib/quantity";

type Product = {
  product_id: number;
  name: string;
  base_price: number;
  price_unit: string;
};

// ============================================================
// บล็อก 1: ข้อมูล 1 กล่อง = 1 ขนาดหน้าต่าง (เก็บเป็นข้อความ เพราะระหว่างพิมพ์ช่องอาจว่าง)
// ============================================================
type Win = { id: number; w: string; h: string; qty: string };
const newWin = (id: number): Win => ({ id, w: "", h: "", qty: "1" });

// ============================================================
// บล็อก 2: ฟังก์ชันช่วย (หน้าบ้าน)
// ============================================================
const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
const baht = (n: number) => `฿${n.toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;

// กรองตัวอักษรที่พิมพ์: ขนาด = ทศนิยมไม่เกิน 2 ตำแหน่ง / จำนวน = เลขจำนวนเต็มไม่เกิน 3 หลัก
const okDecimal = (s: string) => /^\d{0,3}(\.\d{0,2})?$/.test(s);
const okInt = (s: string) => /^\d{0,3}$/.test(s);

// แปลงกล่องเป็นรายการสำหรับสูตรราคา (lib/pricing.ts)
const toLine = (win: Win, price: number) => ({ width: num(win.w), height: num(win.h), quantity: num(win.qty), unit_price: price });

// ตรวจค่าในกล่อง คืนข้อความ error หรือ null ถ้าครบ
function winError(win: Win, unit: string): string | null {
  const q = num(win.qty);
  if (!Number.isInteger(q) || q < 1 || q > MAX_QTY) return `จำนวนต้องเป็นเลข 1–${MAX_QTY}`;
  if (missingSize(toLine(win, 0), unit)) return isAreaUnit(unit) ? "กรุณากรอกกว้างและสูงให้มากกว่า 0" : "กรุณากรอกความกว้างให้มากกว่า 0";
  return null;
}

// ราคาของกล่อง (ข้อมูลไม่ครบ = 0)
const winTotal = (win: Win, p: Product) => (winError(win, p.price_unit) ? 0 : lineTotal(toLine(win, p.base_price), p.price_unit));
// พื้นที่รวม / ความยาวรวม (ข้อมูลไม่ครบ = 0)
const winSize = (win: Win, p: Product) => (winError(win, p.price_unit) ? 0 : lineArea(toLine(win, p.base_price), p.price_unit) ?? 0);

export default function MeasurePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error } = useLiffData<{ product: Product }>(`/api/liff/catalog/${id}`);
  const { add } = useCart();

  // ============================================================
  // บล็อก 3: state ของหน้า (ต้องอยู่ก่อน return เพราะเป็น hook)
  // ============================================================
  const [wins, setWins] = useState<Win[]>([newWin(1)]);
  const [tried, setTried] = useState(false); // กดเพิ่มแล้วอย่างน้อย 1 ครั้ง → โชว์ error ทุกกล่อง
  const [added, setAdded] = useState(false);

  if (error) return <p className="py-16 text-center text-stone-500">{error}</p>;
  if (!data) return <p className="py-16 text-center text-stone-400">กำลังโหลด...</p>;

  const p = data.product;

  // ============================================================
  // บล็อก 4: หน่วยนี้ใช้ช่องไหนบ้าง
  //   ตร.ม. / หลา = กว้าง + สูง + จำนวนบาน
  //   เมตร        = กว้าง + จำนวนบาน (ซ่อนสูง)
  //   ชิ้น / ชุด   = จำนวนอย่างเดียว
  // ============================================================
  const mode = priceMode(p.price_unit);
  const showWidth = mode !== "piece";
  const showHeight = isAreaUnit(p.price_unit);
  const sizeLabel = showHeight ? "พื้นที่รวม" : "ความยาวรวม";
  const qtyLabel = mode === "piece" ? `จำนวน (${p.price_unit})` : "จำนวน (บาน)";

  // ============================================================
  // บล็อก 5: การกระทำของผู้ใช้
  // ============================================================
  const update = (wid: number, field: "w" | "h" | "qty", value: string) => {
    if (!(field === "qty" ? okInt(value) : okDecimal(value))) return; // พิมพ์ตัวที่ไม่ใช่ตัวเลข = ไม่รับ
    setAdded(false);
    setWins(wins.map((x) => (x.id === wid ? { ...x, [field]: value } : x)));
  };
  const addWin = () => setWins([...wins, newWin(Math.max(...wins.map((x) => x.id)) + 1)]);
  const removeWin = (wid: number) => setWins(wins.filter((x) => x.id !== wid));

  const grandTotal = wins.reduce((s, x) => s + winTotal(x, p), 0);

  const submit = () => {
    setTried(true);
    if (wins.some((x) => winError(x, p.price_unit))) return;
    for (const x of wins) {
      add({
        product_id: p.product_id,
        quantity: Number(x.qty),
        width: showWidth ? Number(x.w) : undefined,
        height: showHeight ? Number(x.h) : undefined,
      });
    }
    setWins([newWin(1)]);
    setTried(false);
    setAdded(true);
  };

  const inputCls = "w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary";

  return (
    <div className="-mx-4 -mt-4 pb-4">
      <PageHeader backHref={`/liff/catalog/${p.product_id}`} backLabel={mode === "piece" ? "ระบุจำนวน" : "กรอกขนาดหน้าต่าง"} />

      {/* สินค้าที่เลือก */}
      <section className="space-y-1 px-4 pt-2">
        <h1 className="text-lg font-semibold leading-snug">{p.name}</h1>
        <p className="text-xl font-semibold tabular-nums text-primary">
          {baht(p.base_price)}
          <span className="text-sm font-normal text-stone-500"> / {p.price_unit}</span>
        </p>
      </section>

      {/* ฟอร์ม: 1 กล่อง = 1 ขนาดหน้าต่าง (หน้าต่างขนาดเดียวกันหลายบาน ใส่ในช่องจำนวน) */}
      <section className="space-y-3 px-4 pt-5">
        <h2 className="font-medium">{mode === "piece" ? "จำนวน" : "ขนาดหน้าต่าง"}</h2>

        {wins.map((x, i) => {
          const err = winError(x, p.price_unit);
          const showErr = err && (tried || x.w !== "" || x.h !== "");
          return (
            <div key={x.id} className="space-y-4 rounded-2xl border border-border bg-card p-4">
              {mode !== "piece" && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">หน้าต่างที่ {i + 1}</span>
                  {/* ปุ่มลบ: ซ่อนไว้ถ้าเหลือกล่องเดียว */}
                  {wins.length > 1 && (
                    <button type="button" aria-label="ลบหน้าต่างนี้" onClick={() => removeWin(x.id)}
                      className="rounded-lg p-1.5 text-stone-400 hover:bg-muted active:text-red-600">
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              )}

              {/* กว้าง / สูง: มีสูง = 2 คอลัมน์, ไม่มีสูง = กว้างเต็มแถว */}
              {showWidth && (
                <div className={`grid gap-3 ${showHeight ? "grid-cols-2" : "grid-cols-1"}`}>
                  <label className="block">
                    <span className="mb-1 block text-sm text-stone-500">กว้าง (ม.)</span>
                    <input type="text" inputMode="decimal" placeholder="0.00" value={x.w}
                      onChange={(e) => update(x.id, "w", e.target.value)} className={inputCls} />
                  </label>
                  {showHeight && (
                    <label className="block">
                      <span className="mb-1 block text-sm text-stone-500">สูง (ม.)</span>
                      <input type="text" inputMode="decimal" placeholder="0.00" value={x.h}
                        onChange={(e) => update(x.id, "h", e.target.value)} className={inputCls} />
                    </label>
                  )}
                </div>
              )}

              <label className="block">
                <span className="mb-1 block text-sm text-stone-500">{qtyLabel}</span>
                <input type="text" inputMode="numeric" placeholder="1" value={x.qty}
                  onChange={(e) => update(x.id, "qty", e.target.value)} className={inputCls} />
              </label>

              {/* สรุปของกล่องนี้ */}
              <div className="space-y-1 border-t border-stone-100 pt-3 text-sm">
                {showWidth && (
                  <div className="flex justify-between">
                    <span className="text-stone-500">{sizeLabel}</span>
                    <span className="font-semibold tabular-nums">{winSize(x, p).toFixed(2)} {p.price_unit}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-stone-500">{mode === "piece" ? "ราคา" : "ราคาหน้าต่างนี้"}</span>
                  <span className="font-semibold tabular-nums text-primary">{baht(winTotal(x, p))}</span>
                </div>
                {/* สูตรที่ใช้คิดราคา ให้ลูกค้าเห็นว่าได้ตัวเลขมายังไง */}
                <p className="text-right text-xs tabular-nums text-stone-400">
                  {mode === "piece" ? (num(x.qty) || 0) : winSize(x, p).toFixed(2)} {p.price_unit} × {baht(p.base_price)}/{p.price_unit}
                </p>
              </div>

              {showErr && <p className="text-sm text-red-600" role="alert">{err}</p>}
            </div>
          );
        })}

        {/* ปุ่มเพิ่มกล่องหน้าต่างใหม่ (สินค้านับชิ้นไม่ต้องมี) */}
        {mode !== "piece" && (
          <button type="button" onClick={addWin}
            className="flex w-full items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-stone-300 py-3 text-sm font-medium text-stone-600 active:bg-stone-100">
            <Plus size={16} /> เพิ่มหน้าต่าง
          </button>
        )}
      </section>

      {/* ราคาประเมินรวม (สินค้านี้ตัวเดียว / รวมทุกสินค้าอยู่หน้าสรุปราคา) */}
      <section className="px-4 pt-5">
        <div className="flex items-center justify-between rounded-2xl bg-primary/10 px-4 py-3">
          <span className="text-sm text-stone-600">ราคาประเมินรวม</span>
          <span className="text-xl font-semibold tabular-nums text-primary">{baht(grandTotal)}</span>
        </div>
        <p className="pt-1.5 text-xs text-stone-400">ราคาเบื้องต้น ช่างจะวัดจริงอีกครั้งก่อนออกใบเสนอราคา</p>
      </section>

      {/* ปุ่ม */}
      <div className="space-y-2 px-4 pt-6">
        <button type="button" onClick={submit}
          className="w-full rounded-xl bg-stone-900 py-2.5 text-sm font-semibold text-white active:bg-stone-700 disabled:bg-stone-300">
          เพิ่มลงใบสรุปราคา
        </button>
        {added && <p className="text-center text-sm text-green-700" role="status">เพิ่มลงใบสรุปราคาแล้ว</p>}
      </div>
    </div>
  );
}
