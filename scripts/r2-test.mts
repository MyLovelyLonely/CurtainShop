// ทดสอบอัปโหลดรูปขึ้น R2: npx tsx --env-file=.env.local scripts/r2-test.mts
import { uploadFile } from "../lib/r2";

// รูป PNG สีทองขนาด 1x1
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mO8u3P2fwAH4AMf9rN2SgAAAABJRU5ErkJggg==", "base64");

const url = await uploadFile(`test/r2-test-${Date.now()}.png`, png, "image/png");
console.log("อัปโหลดแล้ว:", url);
const res = await fetch(url);
console.log("เปิดลิงก์สาธารณะ:", res.status, res.headers.get("content-type"));
