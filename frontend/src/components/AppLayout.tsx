"use client";

import React from "react";
import { ThemeProvider } from "@/context/ThemeContext";
import Sidebar from "@/components/Sidebar";
import ThemeToggle from "@/components/ThemeToggle";

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <ThemeProvider>
      <div className="flex w-full h-screen overflow-hidden">
        {/* Sidebar bên trái */}
        <Sidebar />

        {/* Content area bên phải */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          {/* Top Header */}
          <header className="h-16 px-8 border-b border-[color:var(--border)] bg-[color:var(--card)] flex items-center justify-between shrink-0 z-10 transition-colors duration-300">
            <div>
              <h2 className="text-xs text-[color:var(--muted)] font-medium uppercase tracking-wider">
                Chương trình nghiên cứu khoa học
              </h2>
            </div>
            <div className="flex items-center gap-4">
              <ThemeToggle />
            </div>
          </header>

          {/* Main Scrollable Content */}
          <main className="flex-1 overflow-y-auto p-8 bg-[color:var(--background)] transition-colors duration-300">
            {children}
          </main>
        </div>
      </div>
    </ThemeProvider>
  );
}
