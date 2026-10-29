// อัปโหลดไฟล์ไป Cloudflare R2 (S3 API) แล้วคืน public URL ของ bucket (R2_PUBLIC_URL) ใช้ฝั่งเซิร์ฟเวอร์เท่านั้น

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

let client: S3Client | undefined;

function r2(): S3Client {
  if (!client) {
    const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY)
      throw new Error("ยังไม่ได้ตั้งค่า R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY");
    client = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    });
  }
  return client;
}

function publicBase(): string {
  const base = process.env.R2_PUBLIC_URL?.replace(/\/+$/, "");
  if (!base) throw new Error("ยังไม่ได้ตั้งค่า R2_PUBLIC_URL");
  return base;
}

/** อัปโหลดไปที่ key (เช่น simulations/rooms/<uuid>.jpg) แล้วคืน public URL */
export async function putR2(key: string, body: Uint8Array, contentType: string): Promise<string> {
  const Bucket = process.env.R2_BUCKET;
  if (!Bucket) throw new Error("ยังไม่ได้ตั้งค่า R2_BUCKET");
  await r2().send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }));
  return `${publicBase()}/${key}`;
}

/** URL นี้เป็นไฟล์ใน R2 ของร้านหรือไม่ (กันส่ง URL ภายนอกให้ ai-server) */
export const isR2Url = (url: string) => url.startsWith(`${publicBase()}/`);
