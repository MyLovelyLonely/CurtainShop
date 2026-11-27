"use client"
import { use, useState } from "react";
import { useLiffData } from "@/components/liff/LiffProvider";
import { PageHeader } from "@/components/liff/PageHeader";
import { Plus, Trash2 } from "lucide-react";
type Product = {
  product_id: number;
  name: string;
  base_price: number;
  price_unit: string;
};

export default function MeasurePage({params}: {params: Promise<{id : string}>}){
    const {id} = use(params)
    const { data, error } = useLiffData<{product:Product}>(`/api/liff/catalog/${id}`)  

    const [widthText, setWidthText] = useState("");
    const [heightText, setHeightText] = useState("");
    const [qtyText, setQtyText] = useState("1");

    if (error) return <p className="py-16 text-center text-stone-500">{error}</p>;
    if (!data) return <p className="py-16 text-center text-stone-400">กำลังโหลด...</p>;

    const p = data.product;

    // ---------- UI เปล่า (ยังไม่มี logic) ----------
    // TODO: ผูก value/onChange กับ widthText, heightText, qtyText
    // TODO: คำนวณราคาประเมิน, ตรวจค่า, ปุ่มเพิ่มลงตะกร้า (add)
    return (
      <div className="-mx-4 -mt-4 pb-4">
        <PageHeader backHref={`/liff/catalog/${p.product_id}`} backLabel="กรอกขนาดหน้าต่าง" />

        {/* สินค้าที่เลือก */}
        <section className="space-y-1 px-4 pt-2">
          <h1 className="text-lg font-semibold leading-snug">{p.name}</h1>
          <p className="text-xl font-semibold tabular-nums text-primary">
            ฿{p.base_price.toLocaleString("th-TH")}
            <span className="text-sm font-normal text-stone-500"> / {p.price_unit}</span>
          </p>
        </section>

        {/* ฟอร์มกรอกขนาด: 1 กล่อง = 1 ขนาดหน้าต่าง (หน้าต่างขนาดเดียวกันหลายบาน ใส่ในช่องจำนวน) */}
        {/* TODO: วนสร้างกล่องจากรายการหน้าต่าง (.map) ตอนนี้วางไว้กล่องเดียวเป็นตัวอย่าง */}
        <section className="space-y-3 px-4 pt-5">
          <h2 className="font-medium">ขนาดหน้าต่าง</h2>
          <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">หน้าต่างที่ 1</span>
              {/* ปุ่มลบ: ซ่อนไว้ถ้าเหลือกล่องเดียว */}
              <button type="button" aria-label="ลบหน้าต่างนี้"
                className="rounded-lg p-1.5 text-stone-400 hover:bg-muted active:text-red-600">
                <Trash2 size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-sm text-stone-500">กว้าง (ม.)</span>
                <input type="text" inputMode="decimal" placeholder="0.00"
                  className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-stone-500">สูง (ม.)</span>
                <input type="text" inputMode="decimal" placeholder="0.00"
                  className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary" />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-sm text-stone-500">จำนวน (บาน)</span>
              <input type="text" inputMode="numeric" placeholder="1"
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary" />
            </label>
            {/* สรุปของกล่องนี้: พื้นที่รวม + ราคาของหน้าต่างนี้ */}
            {/* TODO: หน่วย "เมตร" ซ่อนช่องสูง แล้วเปลี่ยนคำว่า "พื้นที่รวม" เป็น "ความยาวรวม" และหน่วยเป็น "ม." */}
            <div className="space-y-1 border-t border-stone-100 pt-3 text-sm">
              <div className="flex justify-between">
                <span className="text-stone-500">พื้นที่รวม</span>
                <span className="font-semibold tabular-nums">0.00 ตร.ม.</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">ราคาหน้าต่างนี้</span>
                <span className="font-semibold tabular-nums text-primary">฿0</span>
              </div>
              {/* สูตรที่ใช้คิดราคา ให้ลูกค้าเห็นว่าได้ตัวเลขมายังไง */}
              {/* TODO: แทน 0.00 ด้วยพื้นที่รวม (หน่วยเมตร = ความยาวรวม ม.) */}
              <p className="text-right text-xs tabular-nums text-stone-400">
                0.00 ตร.ม. × ฿{p.base_price.toLocaleString("th-TH")}/{p.price_unit}
              </p>
            </div>
            {/* ที่วางข้อความ error */}
            {/* <p className="text-sm text-red-600" role="alert">...</p> */}
          </div>

          {/* ปุ่มเพิ่มกล่องหน้าต่างใหม่ */}
          <button type="button"
            className="flex w-full items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-stone-300 py-3 text-sm font-medium text-stone-600 active:bg-stone-100">
            <Plus size={16} /> เพิ่มหน้าต่าง
          </button>
        </section>

        {/* ราคาประเมิน */}
        <section className="px-4 pt-5">
          <div className="flex items-center justify-between rounded-2xl bg-primary/10 px-4 py-3">
            {/* รวมทุกกล่องในหน้านี้ (สินค้านี้ตัวเดียว) / รวมทุกสินค้าอยู่หน้าสรุปราคา */}
            <span className="text-sm text-stone-600">ราคาประเมินรวม</span>
            <span className="text-xl font-semibold tabular-nums text-primary">฿0</span>
          </div>
          <p className="pt-1.5 text-xs text-stone-400">ราคาเบื้องต้น ช่างจะวัดจริงอีกครั้งก่อนออกใบเสนอราคา</p>
        </section>

        {/* ปุ่ม */}
        <div className="px-4 pt-6">
          <button type="button"
            className="w-full rounded-xl bg-stone-900 py-2.5 text-sm font-semibold text-white active:bg-stone-700 disabled:bg-stone-300">
            เพิ่มลงใบสรุปราคา
          </button>
        </div>
      </div>
    );
}
