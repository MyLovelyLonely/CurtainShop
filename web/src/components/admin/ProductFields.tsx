"use client";

import { useEffect, useMemo } from "react";
import { LIGHT_FILTERS, PATTERN_TYPES, PRICE_UNITS, type LightFilter } from "@/types/catalog";
import type { ProductDraft } from "./product-draft";

type Props = {
  value: ProductDraft;
  onChange: (next: ProductDraft) => void;
  /** แสดงกรอบแดงที่ช่องบังคับที่ยังว่าง */
  showErrors?: boolean;
};

const MAX_IMAGES = 8;

export default function ProductFields({ value: d, onChange, showErrors }: Props) {
  const set = <K extends keyof ProductDraft>(k: K, v: ProductDraft[K]) => onChange({ ...d, [k]: v });
  const text = (k: keyof ProductDraft) => ({
    value: d[k] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value as never),
  });
  const invalid = (k: "code" | "name" | "base_price") =>
    showErrors && !d[k].trim() ? " border-red-400 bg-red-50" : "";

  const previews = useMemo(() => d.newImages.map((f) => URL.createObjectURL(f)), [d.newImages]);
  useEffect(() => () => previews.forEach(URL.revokeObjectURL), [previews]);

  const imageCount = d.existingImages.length + d.newImages.length;

  return (
    <div className="grid gap-4 sm:grid-cols-6">
      <Field label="รหัสสินค้า *" className="sm:col-span-2">
        <input className={"input" + invalid("code")} placeholder="เช่น BK-1001" {...text("code")} />
      </Field>
      <Field label="ชื่อสินค้า *" className="sm:col-span-4">
        <input className={"input" + invalid("name")} {...text("name")} />
      </Field>

      <Field label="คอลเลคชั่น" className="sm:col-span-2">
        <input className="input" {...text("collection")} />
      </Field>
      <Field label="ชื่อลาย" className="sm:col-span-2">
        <input className="input" {...text("pattern_name")} />
      </Field>
      <Field label="ประเภทลาย" className="sm:col-span-2">
        <input className="input" list="pattern-types" placeholder="เลือกหรือพิมพ์เอง" {...text("pattern_type")} />
      </Field>

      <Field label="สี" hint="คั่นด้วย ," className="sm:col-span-3">
        <input className="input" placeholder="เช่น เทา, ครีม" {...text("colors")} />
      </Field>
      <Field label="ส่วนประกอบ" className="sm:col-span-3">
        <input className="input" placeholder="เช่น Polyester 70%, Linen 30%" {...text("composition")} />
      </Field>

      <Field label="หน้ากว้าง (ซม.)" className="sm:col-span-2">
        <input className="input" inputMode="decimal" placeholder="เช่น 280" {...text("width_cm")} />
      </Field>
      <Field label="ระยะซ้ำลาย (ซม.)" hint="ไว้คำนวณผ้า" className="sm:col-span-2">
        <input className="input" inputMode="decimal" placeholder="0 = ไม่มีลายซ้ำ" {...text("repeat_cm")} />
      </Field>
      <Field label="การกรองแสง" className="sm:col-span-2">
        <select
          className="input"
          value={d.light_filter}
          onChange={(e) => set("light_filter", e.target.value as LightFilter | "")}
        >
          <option value="">— ไม่ระบุ —</option>
          {Object.entries(LIGHT_FILTERS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="ราคา (บาท) *" className="sm:col-span-2">
        <input className={"input" + invalid("base_price")} inputMode="decimal" {...text("base_price")} />
      </Field>
      <Field label="ต่อหน่วย" className="sm:col-span-1">
        <input className="input" list="price-units" {...text("price_unit")} />
      </Field>
      <Field label="แท็ก" hint="คั่นด้วย , ใช้ช่วยค้นหา" className="sm:col-span-3">
        <input className="input" placeholder="เช่น กันUV, ห้องนอน, มินิมอล" {...text("tags")} />
      </Field>

      <Field label="รายละเอียด" className="sm:col-span-6">
        <textarea className="input min-h-20" {...text("description")} />
      </Field>
      <Field label="วิธีดูแลรักษา" className="sm:col-span-6">
        <input className="input" placeholder="เช่น ซักเครื่องน้ำเย็น ห้ามฟอกขาว" {...text("care")} />
      </Field>

      <div className="sm:col-span-6">
        <FieldLabel label={`รูปสินค้า (${imageCount}/${MAX_IMAGES})`} hint="รูปแรกเป็นรูปหลัก" />
        <div className="flex flex-wrap gap-2">
          {d.existingImages.map((url) => (
            <Thumb
              key={url}
              src={url}
              onRemove={() => set("existingImages", d.existingImages.filter((u) => u !== url))}
            />
          ))}
          {previews.map((src, i) => (
            <Thumb
              key={src}
              src={src}
              onRemove={() => set("newImages", d.newImages.filter((_, j) => j !== i))}
            />
          ))}
          {imageCount < MAX_IMAGES && (
            <label className="flex size-20 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-stone-300 text-xs text-stone-500 hover:border-brand hover:text-brand">
              <span className="text-2xl leading-none">+</span>
              เพิ่มรูป
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = [...(e.target.files ?? [])].slice(0, MAX_IMAGES - imageCount);
                  set("newImages", [...d.newImages, ...files]);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
      </div>
    </div>
  );
}

/** ตัวเลือกของช่องประเภทลาย/หน่วยราคา — ใส่ครั้งเดียวต่อหน้า */
export function ProductDatalists() {
  return (
    <>
      <datalist id="pattern-types">
        {PATTERN_TYPES.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <datalist id="price-units">
        {PRICE_UNITS.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </>
  );
}

function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={className}>
      <FieldLabel label={label} hint={hint} />
      {children}
    </label>
  );
}

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <span className="label">
      {label}
      {hint && <span className="ml-1 font-normal text-stone-400">({hint})</span>}
    </span>
  );
}

function Thumb({ src, onRemove }: { src: string; onRemove: () => void }) {
  return (
    <div className="group relative size-20 overflow-hidden rounded-lg border border-stone-200">
      {/* eslint-disable-next-line @next/next/no-img-element -- รองรับ blob: preview */}
      <img src={src} alt="" className="size-full object-cover" />
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-xs text-white opacity-80 hover:opacity-100"
        aria-label="ลบรูป"
      >
        ✕
      </button>
    </div>
  );
}
