// จำลองผ้าม่าน (หัวข้อ 2.5): ใช้ร่วมกันทั้ง API และหน้า LIFF

export const CURTAIN_STYLES = {
  pleated: { label: "ผ้าจีบ", hint: "ม่านแขวนราง จีบตามแนวตั้ง รูดเปิด-ปิดด้านข้าง" },
  roller: { label: "ม่านม้วน", hint: "ผ้าเรียบติดในวงกบ ม้วนขึ้น-ลง" },
  louis: { label: "ม่านหลุยส์", hint: "ระบายโค้งด้านบนพร้อมหางห้อย ม่านสองข้างผูกรวบ มีพู่ตามขอบ ดูหรูหรา" },
} as const;

export type CurtainStyle = keyof typeof CURTAIN_STYLES;

/** จุดบนรูปเป็นสัดส่วน 0–1 [x, y] */
export type Point = [number, number];

/** จุดที่จะจำลอง: กรอบ 4 มุม เรียง บนซ้าย → บนขวา → ล่างขวา → ล่างซ้าย (ลากเอียงตามมุมกล้องได้) */
export type Quad = [Point, Point, Point, Point];

/**
 * จุดที่จะจำลอง + จุดบนแนวพื้นใต้หน้าต่าง (ม่านที่ยาวถึงพื้นจะจบที่ระดับนี้)
 * + จุดบนแนวรางเหนือหน้าต่าง (ม่านทุกแบบเริ่มจากระดับนี้)
 */
export type Region = { quad: Quad; floor: Point; rail: Point };

export const MAX_REGIONS = 6;

/** กรอบตรงจาก YOLO [x1, y1, x2, y2] → กรอบ 4 มุม */
export const boxToQuad = ([x1, y1, x2, y2]: readonly number[]): Quad => [
  [x1, y1],
  [x2, y1],
  [x2, y2],
  [x1, y2],
];

/** จุดพื้นตั้งต้น: ใต้กึ่งกลางขอบล่างของหน้าต่าง ห่างลงไป ~0.6 เท่าของความสูงหน้าต่าง (ระยะขอบหน้าต่างถึงพื้นทั่วไป) */
export const defaultFloor = (q: Quad): Point => {
  const bx = (q[2][0] + q[3][0]) / 2;
  const by = (q[2][1] + q[3][1]) / 2;
  const h = by - (q[0][1] + q[1][1]) / 2;
  return [bx, Math.min(0.99, by + 0.6 * h)];
};

/** จุดรางตั้งต้น: เหนือกึ่งกลางขอบบนของหน้าต่าง 10% ของความสูงหน้าต่าง */
export const defaultRail = (q: Quad): Point => {
  const tx = (q[0][0] + q[1][0]) / 2;
  const ty = (q[0][1] + q[1][1]) / 2;
  const h = (q[2][1] + q[3][1]) / 2 - ty;
  return [tx, Math.max(0.005, ty - 0.1 * h)];
};

export const toRegion = (quad: Quad): Region => ({ quad, floor: defaultFloor(quad), rail: defaultRail(quad) });

/** ใช้จุดพื้นเฉพาะม่านที่ยาวถึงพื้น (ผ้าจีบ/หลุยส์ แบบยาวถึงพื้น) */
export const usesFloor = (style: CurtainStyle, opts: RenderOptions) => style !== "roller" && opts.length === "floor";

/** พื้นที่ของกรอบ (สูตรเชือกผูกรองเท้า) ใช้กันกรอบที่เล็กหรือบิดจนไม่มีพื้นที่ */
export const quadArea = (q: Quad) =>
  Math.abs(q.reduce((s, [x, y], i) => s + x * q[(i + 1) % 4][1] - q[(i + 1) % 4][0] * y, 0)) / 2;

export type DetectedWindow = { box: [number, number, number, number]; score: number };

export type SimulatePhoto = {
  photo_url: string;
  width: number;
  height: number;
  windows: DetectedWindow[];
  /** "yolo" = ตรวจด้วยโมเดล, "unavailable" = ai-server ไม่มีโมเดลตรวจหน้าต่าง */
  detector: "yolo" | "unavailable";
};

export type RenderOptions = {
  /** ผ้าจีบ/หลุยส์: 0 = ปิดสนิท, 1 = รูดเปิดสุด */
  open_ratio: number;
  /** ผ้าจีบ/หลุยส์: ยาวถึงพื้น / ถึงใต้ขอบหน้าต่าง */
  length: "floor" | "sill";
  /** ม่านม้วน: สัดส่วนความสูงหน้าต่างที่ม่านลงมาบัง */
  drop: number;
};

export type RenderInput = RenderOptions & {
  photo_url: string;
  product_id: number;
  style: CurtainStyle;
  /** หลายจุดในรูปเดียว แต่ละจุดเป็นกรอบ 4 มุม + จุดพื้น */
  regions: Region[];
};

export type RenderResult = {
  result_url: string;
  /** true = เกลาแสงเงาด้วย Stable Diffusion แล้ว, false = ภาพที่วาดจากลายผ้าอย่างเดียว */
  refined: boolean;
  /** "sam2" = ตัดขอบหน้าต่างด้วย SAM2, "box" = ใช้กรอบที่ลากตรง ๆ */
  mask_source: "sam2" | "box";
  note: string;
};

export const DEFAULT_OPTIONS: RenderOptions = { open_ratio: 0.35, length: "floor", drop: 0.7 };
