// POST /api/liff/quotations/{quotation_id}/confirm   ลูกค้ายืนยันใบเสนอราคา (Activity Diagram 3-4, ขอบเขต 1.3.3.3)
//   0. (สวิตช์ใน lib/confirm-rules.ts เปิด) ต้อง export PDF ฉบับทางการได้ก่อน ไม่งั้นตอบ 503
//   1. เปลี่ยนสถานะใน FlowAccount เป็น "อนุมัติ" (/quotations/{recordId}/status/approved)
//   2. บันทึกเวลาที่ยืนยันใน quotation.confirmed_at
//   ร้านออกใบแจ้งหนี้ไปแล้ว = ใบเสนอราคาใน FlowAccount ถูกล็อก จึงบันทึกเวลาอย่างเดียว
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { flowAccount, officialPdfAvailable } from "@/lib/flowaccount";
import { OFFICIAL_DOC_UNAVAILABLE_MESSAGE, REQUIRE_OFFICIAL_DOC_TO_CONFIRM } from "@/lib/confirm-rules";
import { currentCustomer, unauthorized } from "@/lib/liff-auth";
import { customerQuotation } from "@/lib/customer-data";

type Params = { params: Promise<{ id: string }> };

// req = request จากหน้า LIFF (มี LINE token อยู่ใน header), params = ส่วนของ URL ({id} = quotation_id)
export async function POST(req: Request, { params }: Params) {
  // ตรวจตัวตนลูกค้าจาก LINE token ใน header แล้วหาแถว customer ที่ผูกกับ LINE User ID นั้น (Use Case 1)
  const c = await currentCustomer(req);
  // ไม่มี token / token ไม่ถูกต้อง / ไม่พบลูกค้า = ตอบ 401 ไม่ให้ทำต่อ
  if (!c) return unauthorized();
  // ดึงรหัสใบเสนอราคาจาก URL (Next.js เวอร์ชันนี้ params เป็น Promise ต้อง await ก่อน) ค่าที่ได้เป็น string
  const { id } = await params;

  // ครอบทั้งหมดด้วย try เพื่อให้ error ที่ไม่คาดคิด (เช่น DB ล่ม เน็ตหลุด) ตอบเป็น JSON แทนหน้า error ของ Next.js
  try {
    // ดึงใบเสนอราคาโดยกรองด้วย customer_id ด้วย = ลูกค้าดึงใบของคนอื่นไม่ได้ แม้จะเดา quotation_id ถูก
    //   ได้ record_id (รหัสเอกสารใน FlowAccount), confirmed_at, change_request และ has_invoice (มีใบแจ้งหนี้แล้วหรือยัง)
    const quotation = await customerQuotation(c.customer_id, Number(id));
    // ไม่พบ = ไม่มีใบนี้ หรือเป็นใบของลูกค้าคนอื่น ตอบเหมือนกันทั้งสองกรณีเพื่อไม่ให้รู้ว่าใบของคนอื่นมีอยู่จริง (404)
    if (!quotation) return NextResponse.json({ error: "ไม่พบใบเสนอราคา" }, { status: 404 });
    // ยืนยันไปแล้ว ห้ามยืนยันซ้ำ (409 Conflict = สถานะของข้อมูลไม่เอื้อให้ทำคำขอนี้)
    if (quotation.confirmed_at) return NextResponse.json({ error: "ยืนยันใบเสนอราคานี้แล้ว" }, { status: 409 });
    // ลูกค้าแจ้งว่าข้อมูลไม่ถูกต้องไว้แล้ว (Activity Diagram 3-4 ทาง "no") ต้องรอแอดมินแก้ใบก่อน จึงยืนยันฉบับเดิมไม่ได้ (409)
    if (quotation.change_request) return NextResponse.json({ error: "แจ้งแก้ไขไว้แล้ว รอร้านส่งใบเสนอราคาฉบับแก้ไข" }, { status: 409 });

    // สวิตช์เปิด (lib/confirm-rules.ts) = ต้อง export PDF ฉบับทางการได้ก่อนยืนยัน (ไม่นับลิงก์หน้าแชร์)
    //   เช็กซ้ำฝั่งเซิร์ฟเวอร์ แม้หน้า LIFF จะล็อกปุ่มไว้แล้ว กันกรณียิง API ตรงโดยไม่ผ่านปุ่ม
    //   ไม่มี record_id = ใบยังไม่ถูกสร้างใน FlowAccount = ไม่มีฉบับทางการให้ดู ถือว่าเปิดไม่ได้
    if (REQUIRE_OFFICIAL_DOC_TO_CONFIRM) {
      const canOpen = Boolean(quotation.record_id) && (await officialPdfAvailable("quotations", Number(quotation.record_id)));
      // 503 Service Unavailable = ยืนยันไม่ได้ชั่วคราวเพราะบริการปลายทาง (FlowAccount) ไม่พร้อม ลองใหม่ภายหลังได้
      if (!canOpen) return NextResponse.json({ error: OFFICIAL_DOC_UNAVAILABLE_MESSAGE }, { status: 503 });
    }

    // เปลี่ยนสถานะใน FlowAccount เฉพาะเมื่อ
    //   - record_id มีค่า = ใบนี้ถูกสร้างใน FlowAccount แล้ว
    //   - ยังไม่มีใบแจ้งหนี้ = ใบเสนอราคาใน FlowAccount ยังไม่ถูกล็อก (ออกใบแจ้งหนี้แล้ว FlowAccount จะไม่ให้เปลี่ยนสถานะ)
    if (quotation.record_id && !quotation.has_invoice) {
      // ยิง API ให้ FlowAccount เปลี่ยนสถานะใบเสนอราคาเป็น "อนุมัติ" ทำก่อนบันทึกฝั่งเรา เพื่อให้สองระบบตรงกัน
      const fa = await flowAccount("POST", `/quotations/${quotation.record_id}/status/approved`);
      // สำเร็จต้องได้ทั้ง HTTP 200 และ status = true ใน body (FlowAccount บอกผลจริงไว้ใน status ของ body เช็ก HTTP อย่างเดียวไม่พอ)
      //   ไม่สำเร็จ เช่น FlowAccount ล่ม (502/503/504) หรือ token ผิด = ไม่บันทึกอะไรฝั่งเรา
      if (fa.status !== 200 || !fa.data?.status) {
        // แจ้งลูกค้าตามเล่ม (ลองใหม่อีกครั้ง) และแนบคำตอบของ FlowAccount ไว้ดูสาเหตุตอน debug
        //   502 Bad Gateway = ระบบเราทำงานปกติ แต่ปลายทาง (FlowAccount) ตอบไม่สำเร็จ
        return NextResponse.json({ error: "ไม่สามารถยืนยันได้ในขณะนี้ เนื่องจากระบบเอกสารของร้านขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง", flowaccount: fa.data }, { status: 502 });
      }
    }

    // บันทึกเวลาที่ลูกค้ายืนยันลงฐานข้อมูลของเรา
    const r = await pool.query(
      // "confirmed_at is null" กันกดซ้ำพร้อมกันสองครั้ง (double click / สองเครื่อง): ครั้งที่สองจะ update ไม่โดนแถวไหน
      // returning ส่งเวลาที่บันทึกจริงกลับมาให้ตอบหน้าเว็บ
      `update quotation set confirmed_at = now() where quotation_id = $1 and confirmed_at is null returning confirmed_at`,
      // $1 = id จาก URL ส่งเป็นพารามิเตอร์ (ไม่ต่อ string) กัน SQL injection
      [id],
    );
    // TODO: แจ้งเตือนแอดมิน (Use Case 22) เมื่อมี LINE Messaging API
    // ตอบเวลาที่ยืนยันกลับไปให้หน้า LIFF แสดงผล ถ้าถูกกดซ้ำพร้อมกัน แถวจะว่าง ค่าจะเป็น undefined (?. กัน error)
    return NextResponse.json({ confirmed_at: r.rows[0]?.confirmed_at });
  } catch (e) {
    // error ที่ไม่คาดคิด (DB ล่ม / FlowAccount ไม่ตอบจน fetch throw) ตอบ 500 พร้อมข้อความ error
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
