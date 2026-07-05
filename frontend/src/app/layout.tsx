import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AppLayout from "@/components/AppLayout";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "NASDAQ 2022 - Phân tích & Dự báo Chứng khoán học sâu",
  description: "Hệ thống phân tích dữ liệu 15 phút NASDAQ 2022 và huấn luyện học sâu gia tăng (incremental learning)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="h-full">
      <body className={`${inter.className} min-h-full flex bg-[color:var(--background)] text-[color:var(--foreground)] transition-colors duration-300`}>
        <AppLayout>{children}</AppLayout>
      </body>
    </html>
  );
}
