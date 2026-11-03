// รูปแอดมินมุมขวาบน: วงกลมตัวอักษรแรกของชื่อแอดมินที่เข้าสู่ระบบ (lib/admin-auth.ts)
import { currentAdmin } from "@/lib/admin-auth";

export async function AdminAvatar() {
  const admin = await currentAdmin();
  const name = admin?.full_name ?? "";
  return (
    <div title={name} className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
      {name.charAt(0) || "?"}
    </div>
  );
}
