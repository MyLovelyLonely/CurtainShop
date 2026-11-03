"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, KeyRound, Scissors, UserRound } from "lucide-react";

type AdminAuthFormProps = {
  mode: "login" | "register";
};

export function AdminAuthForm({ mode }: AdminAuthFormProps) {
  const isRegister = mode === "register";
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("ระบบบัญชีผู้ดูแลยังไม่พร้อมใช้งาน");
  }

  return (
    <main className="fixed inset-0 z-50 flex min-h-screen items-center justify-center overflow-y-auto bg-admin-auth-background px-5 py-10">
      <section className="relative w-full max-w-[440px] rounded-3xl border border-border bg-card p-7 shadow-[0_24px_70px_-35px_rgba(54,37,17,0.35)] sm:p-10">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <Scissors size={20} />
          </div>
          <div>
            <p className="font-serif text-base font-bold leading-tight">ร้านผ้าม่าน</p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Admin Workspace</p>
          </div>
        </div>

        <header className="mb-7 text-center">
          <p className="mb-2 text-xs font-semibold tracking-wide text-primary">
            {isRegister ? "เริ่มต้นใช้งาน" : "ยินดีต้อนรับกลับ"}
          </p>
          <h1 className="font-serif text-2xl font-bold">
            {isRegister ? "สมัครบัญชีแอดมิน" : "เข้าสู่ระบบแอดมิน"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {isRegister ? "กรอกข้อมูลเพื่อสร้างบัญชีผู้ดูแลระบบ" : "กรอกชื่อผู้ใช้และรหัสผ่านเพื่อดำเนินการต่อ"}
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-5">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">ชื่อผู้ใช้</span>
            <span className="relative block">
              <UserRound size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                name="username"
                type="text"
                autoComplete="username"
                placeholder="กรอกชื่อผู้ใช้"
                required
                className="h-11 w-full rounded-lg border border-border bg-card pl-11 pr-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </span>
          </label>

          {isRegister && (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">ชื่อ-นามสกุล</span>
              <span className="relative block">
                <UserRound size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  name="full_name"
                  type="text"
                  autoComplete="name"
                  placeholder="ชื่อและนามสกุล"
                  required
                  className="h-11 w-full rounded-xl border border-border bg-background/70 pl-11 pr-4 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-primary focus:bg-card focus:ring-2 focus:ring-primary/15"
                />
              </span>
            </label>
          )}

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">รหัสผ่าน</span>
            <span className="relative block">
              <KeyRound size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={isRegister ? "new-password" : "current-password"}
                placeholder="กรอกรหัสผ่าน"
                minLength={isRegister ? 8 : undefined}
                required
                className="h-11 w-full rounded-xl border border-border bg-background/70 pl-11 pr-11 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-primary focus:bg-card focus:ring-2 focus:ring-primary/15"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </span>
          </label>

          {isRegister && (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">ยืนยันรหัสผ่าน</span>
              <span className="relative block">
                <KeyRound size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  name="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="กรอกรหัสผ่านอีกครั้ง"
                  minLength={8}
                  required
                  className="h-11 w-full rounded-xl border border-border bg-background/70 pl-11 pr-4 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-primary focus:bg-card focus:ring-2 focus:ring-primary/15"
                />
              </span>
            </label>
          )}

          {notice && (
            <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              {notice}
            </p>
          )}

          <button
            type="submit"
            className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-2"
          >
            {isRegister ? "สมัครสมาชิก" : "เข้าสู่ระบบ"}
            <ArrowRight size={16} />
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {isRegister ? "มีบัญชีอยู่แล้ว?" : "ยังไม่มีบัญชีผู้ดูแล?"}{" "}
          <Link
            href={isRegister ? "/admin/login" : "/admin/register"}
            className="font-semibold text-primary hover:underline"
          >
            {isRegister ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
          </Link>
        </p>
      </section>
    </main>
  );
}
