"use client";

import React, { useEffect, useState } from "react";
import { useTheme } from "@/context/ThemeContext";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-28 h-10 rounded-xl bg-[color:var(--accent)] border border-[color:var(--border)] animate-pulse" />
    );
  }

  return (
    <button
      onClick={toggleTheme}
      className="p-2.5 rounded-xl bg-[color:var(--card)] border border-[color:var(--border)] text-[color:var(--foreground)] hover:bg-[color:var(--accent)] transition-all duration-200 shadow-sm flex items-center gap-2 font-medium text-sm group cursor-pointer"
      aria-label="Toggle Theme"
    >
      {theme === "light" ? (
        <>
          <Moon className="w-4 h-4 text-indigo-500 group-hover:rotate-12 transition-transform duration-200" />
          <span className="hidden sm:inline">Chế độ Tối</span>
        </>
      ) : (
        <>
          <Sun className="w-4 h-4 text-amber-500 animate-spin-slow" />
          <span className="hidden sm:inline">Chế độ Sáng</span>
        </>
      )}
    </button>
  );
}
