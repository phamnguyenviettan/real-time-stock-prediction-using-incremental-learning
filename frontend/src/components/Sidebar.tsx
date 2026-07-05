"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Database, Settings, Activity, Sparkles, TrendingUp } from "lucide-react";

export default function Sidebar() {
  const pathname = usePathname();

  const menuItems = [
    {
      name: "Xem Dataset",
      path: "/view-dataset",
      icon: Database,
      desc: "Xem dữ liệu thô & biểu đồ kỹ thuật"
    },
    {
      name: "Dự báo Real-time",
      path: "/realtime-forecast",
      icon: TrendingUp,
      desc: "Chạy mô phỏng dự báo trực tuyến"
    },
    {
      name: "Cấu hình hệ thống",
      path: "/settings",
      icon: Settings,
      desc: "Chế độ giao diện & huấn luyện"
    }
  ];

  return (
    <aside className="w-80 bg-[color:var(--sidebar)] border-r border-[color:var(--sidebar-border)] h-screen flex flex-col justify-between shrink-0 transition-colors duration-300">
      <div className="flex flex-col gap-8 p-6">
        {/* Brand/Header */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-600/10 text-blue-600 dark:text-blue-400 rounded-xl">
            <Activity className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight tracking-wide text-slate-800 dark:text-slate-100">
              NASDAQ Dashboard
            </h1>
            <span className="text-xs text-[color:var(--muted)] flex items-center gap-1 mt-0.5">
              <Sparkles className="w-3 h-3 text-amber-500" />
              Incremental Learning
            </span>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="flex flex-col gap-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.path || (item.path === "/view-dataset" && pathname === "/");

            return (
              <Link
                key={item.path}
                href={item.path}
                className={`flex items-start gap-4 p-4 rounded-xl transition-all duration-200 group ${
                  isActive
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                    : "hover:bg-[color:var(--accent)] text-[color:var(--foreground)]"
                }`}
              >
                <Icon className={`w-5 h-5 mt-0.5 shrink-0 transition-transform duration-300 ${
                  isActive ? "scale-110" : "group-hover:scale-110"
                }`} />
                <div className="flex flex-col">
                  <span className="font-semibold text-sm leading-normal">
                    {item.name}
                  </span>
                  <span className={`text-[11px] mt-0.5 ${
                    isActive ? "text-blue-100" : "text-[color:var(--muted)]"
                  }`}>
                    {item.desc}
                  </span>
                </div>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Info */}
      <div className="p-6 border-t border-[color:var(--sidebar-border)] bg-[color:var(--accent)]/30">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
          <span className="text-xs font-medium text-[color:var(--foreground)]">
            Hệ thống: Sẵn sàng
          </span>
        </div>
        <p className="text-[10px] text-[color:var(--muted)] mt-2">
          Chuyên đề Nghiên cứu Deep Learning © 2026
        </p>
      </div>
    </aside>
  );
}
