"use client";
// ตะกร้า (ใบสรุปราคาที่ยังไม่ส่ง) ใบเดียวใช้ทุกหน้าใต้ /liff
// - ของจริงอยู่ใน state "items" ทุกอย่างบนจออ่านจากตัวนี้
// - localStorage เป็นที่สำรอง: อ่านครั้งเดียวตอนเปิดแอป และเขียนตามทุกครั้งที่ตะกร้าเปลี่ยน (ปิดแอปแล้วไม่หาย)
// - เก็บแค่ของที่ลูกค้าเลือก ไม่เก็บราคา (server คำนวณราคาใหม่ตอนยืนยัน)
import { createContext, useContext, useEffect, useState } from "react";
import { MAX_QTY } from "@/lib/quantity";

// ของ 1 รายการ: อุปกรณ์ไม่มีขนาด / ผ้าม่านมีขนาด (ซม.)
export type CartItem = {
  key: string;        // ไว้ลบหรือแก้ทีละรายการ
  product_id: number;
  quantity: number;
  width?: number;
  height?: number;
};

type Cart = {
  items: CartItem[];
  count: number;                                // จำนวน "รายการ" (บรรทัดในใบสรุปราคา) ไว้แสดงบนไอคอนตะกร้า
  loaded: boolean;                              // อ่าน localStorage เสร็จแล้วหรือยัง (แยก "ว่างจริง" กับ "ยังโหลดไม่เสร็จ")
  lastAddAt: number;                            // เวลาที่ใส่ของสำเร็จครั้งล่าสุด (รวมกรณีเพิ่มจำนวนรายการเดิม) ใช้สั่งจุดแดงให้เด้ง
  add: (item: Omit<CartItem, "key">) => void;   // ปุ่มเข้าตะกร้าทุกที่เรียกตัวนี้
  remove: (key: string) => void;
  clear: () => void;                            // เรียกหลังส่งใบประเมินสำเร็จ
};

const CartContext = createContext<Cart | null>(null);
const STORAGE_KEY = "estimate-draft";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [lastAddAt, setLastAddAt] = useState(0);

  // เปิดแอป: โหลดตะกร้าเดิมจากเครื่อง (ทำใน useEffect เพราะตอน render บน server ไม่มี localStorage)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      // ESLint เตือนเรื่อง setState ใน effect แต่กรณีนี้ตั้งใจ: localStorage อ่านได้หลังหน้าโหลดในเบราว์เซอร์แล้วเท่านั้น
      // ถ้าอ่านตั้งแต่ useState(...) หน้าแรกที่ render บน server (ตะกร้าว่าง) จะไม่ตรงกับในเบราว์เซอร์ แล้ว React error
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setItems(JSON.parse(saved));
    } catch {
      // ข้อมูลเสียหรือเบราว์เซอร์ไม่ให้ใช้ localStorage → เริ่มตะกร้าว่าง
    }
    setLoaded(true);
  }, []);

  // อัปเดตตะกร้า + บันทึกลงเครื่อง
  function save(next: CartItem[]) {
    setItems(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // บันทึกไม่ได้ (เช่น โหมดส่วนตัว) ตะกร้ายังใช้ได้จนกว่าจะปิดแอป
    }
  }

  function add(item: Omit<CartItem, "key">) {
    // อุปกรณ์ชิ้นเดิม (ไม่มีขนาด) → รวมจำนวนเข้ารายการเดิม ไม่เกิน MAX_QTY
    const same = items.find((i) => i.product_id === item.product_id && i.width == null && item.width == null);
    if (same) {
      const quantity = Math.min(MAX_QTY, same.quantity + item.quantity);
      if (quantity === same.quantity) return; // เต็ม MAX_QTY แล้ว เพิ่มไม่ได้ → ไม่เด้ง
      save(items.map((i) => (i === same ? { ...i, quantity } : i)));
      setLastAddAt(Date.now()); // เลขรายการเท่าเดิม แต่จุดแดงเด้งให้รู้ว่ากดแล้ว
      return;
    }
    // ผ้าม่าน หรือของใหม่ → รายการใหม่ (ผ้าเดียวกันคนละหน้าต่าง = คนละรายการ) เลขเพิ่ม 1
    save([...items, { ...item, key: crypto.randomUUID() }]);
    setLastAddAt(Date.now());
  }

  const value: Cart = {
    items,
    count: items.length,
    loaded,
    lastAddAt,
    add,
    remove: (key) => save(items.filter((i) => i.key !== key)),
    clear: () => save([]),
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const cart = useContext(CartContext);
  if (!cart) throw new Error("useCart ต้องอยู่ใน CartProvider");
  return cart;
}
