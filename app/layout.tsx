import type { Metadata } from "next";
import { DM_Mono, Noto_Sans_Thai, Playfair_Display } from "next/font/google";
import "./globals.css";

const thai = Noto_Sans_Thai({ variable: "--font-thai", subsets: ["thai", "latin"], weight: ["300", "400", "500", "600", "700"] });
const display = Playfair_Display({ variable: "--font-display", subsets: ["latin"], weight: ["600", "700"] });
const mono = DM_Mono({ variable: "--font-mono-dm", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "ระบบบริหารจัดการร้านผ้าม่าน",
  description: "Curtain Shop Management System",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body className={`${thai.variable} ${display.variable} ${mono.variable} antialiased`}>{children}</body>
    </html>
  );
}
