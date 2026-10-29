// ชั่วคราวช่วงทดสอบจำลองผ้าม่าน: สินค้าที่ไม่ได้อยู่ในฐานข้อมูล แสดงในหน้าแคตตาล็อกฝั่งลูกค้าเท่านั้น
// รูปจากเว็บภายนอก ใช้ทดสอบภายในเท่านั้น ห้ามใช้จริง — ลบไฟล์นี้ (และ TEST_IMAGE_PREFIXES ใน ai-server/app/config.py) เมื่อมีสินค้าจริงแล้ว

import type { Catalog } from "@/types/db";
import type { ProductView } from "@/types/catalog";

// id สูงมากเพื่อไม่ชนกับ product_id จริง (parseId รับเฉพาะเลขบวก)
export const TEST_CATALOG: Catalog = {
  catalog_id: 999_000,
  category_id: 1,
  name: "สินค้าทดสอบ (ไม่อยู่ในฐานข้อมูล)",
  description: null,
  file_url: null,
  is_visible: true,
};

const LANGDANS = "https://www.ikea.com/th/th/images/products/langdans-roller-blind-grey__0751619_pe747107_s5.jpg?f=s";
const LEAF =
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRAxGo4F1o6upFvVcr8DBUcFaNij0YXXhIZycR_Lq9hqS1OessKKrJ4JFFE&s=10";

export const TEST_PRODUCTS: ProductView[] = [
  {
    product_id: 999_001,
    catalog_id: TEST_CATALOG.catalog_id,
    name: "[ทดสอบ] ผ้าลินินสีเทา (LÅNGDANS)",
    base_price: 0,
    price_unit: "ตร.ม.",
    description: "สินค้าทดสอบสำหรับลองจำลองผ้าม่าน ไม่ได้บันทึกในฐานข้อมูล",
    image_url: LANGDANS,
    details: {
      code: "TEST-LANGDANS",
      collection: null,
      pattern_name: "Linen Look",
      pattern_type: "ลายผ้า/เท็กซ์เจอร์ (Texture)",
      colors: ["เทา"],
      composition: null,
      width_cm: null,
      repeat_cm: null,
      light_filter: "dimout",
      tags: ["ทดสอบ"],
      care: null,
      images: [LANGDANS],
    },
  },
  {
    product_id: 999_002,
    catalog_id: TEST_CATALOG.catalog_id,
    name: "[ทดสอบ] ผ้าลายใบไม้สีครีม",
    base_price: 0,
    price_unit: "หลา",
    description: "สินค้าทดสอบสำหรับลองจำลองผ้าม่าน ไม่ได้บันทึกในฐานข้อมูล",
    image_url: LEAF,
    details: {
      code: "TEST-LEAF",
      collection: null,
      pattern_name: "Leaf",
      pattern_type: "ลายใบไม้ (Botanical)",
      colors: ["ครีม", "เบจ"],
      composition: null,
      width_cm: null,
      repeat_cm: 70,
      light_filter: "dimout",
      tags: ["ทดสอบ"],
      care: null,
      images: [LEAF],
    },
  },
];

export const findTestProduct = (id: number) => TEST_PRODUCTS.find((p) => p.product_id === id);
