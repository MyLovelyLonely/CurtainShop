// ย่อรูปฝั่งเบราว์เซอร์ก่อนอัปโหลด (หมุนตาม EXIF ไปในตัว) ให้ส่งเร็วบนมือถือ

/** คืนรูปที่ย่อแล้วพร้อมขนาด (width/height = null ถ้าย่อไม่ได้ จะคืนไฟล์เดิม) */
export async function shrinkImage(
  file: File,
  max = 2000,
): Promise<{ blob: Blob; width: number | null; height: number | null }> {
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * s);
    canvas.height = Math.round(bmp.height * s);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error())), "image/jpeg", 0.88),
    );
    return { blob, width: canvas.width, height: canvas.height };
  } catch {
    return { blob: file, width: null, height: null };
  }
}
