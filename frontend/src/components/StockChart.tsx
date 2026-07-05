"use client";

import React, { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from "recharts";
import { LineChart as ChartIcon, Eye } from "lucide-react";

interface ChartDataPoint {
  Datetime: string;
  Open: number;
  High: number;
  Low: number;
  Close: number;
  Volume: number;
}

interface StockChartProps {
  data: ChartDataPoint[];
  ticker: string;
  isMonthly: boolean;
}

export default function StockChart({ data, ticker, isMonthly }: StockChartProps) {
  const [mounted, setMounted] = useState(false);
  const [chartType, setChartType] = useState<"close" | "volume">("close");

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="h-[400px] w-full flex items-center justify-center bg-[color:var(--card)] border border-[color:var(--border)] rounded-2xl animate-pulse">
        <span className="text-[color:var(--muted)]">Đang tải biểu đồ...</span>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-[400px] w-full flex flex-col items-center justify-center bg-[color:var(--card)] border border-[color:var(--border)] rounded-2xl p-6 text-center">
        <Eye className="w-8 h-8 text-[color:var(--muted)] mb-2" />
        <span className="text-sm font-semibold text-[color:var(--foreground)]">Không có dữ liệu</span>
        <span className="text-xs text-[color:var(--muted)] mt-1">Vui lòng chọn bộ lọc khác.</span>
      </div>
    );
  }

  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  // Format volume
  const formatVolume = (value: number) => {
    if (value >= 1_000_000) {
      return (value / 1_000_000).toFixed(2) + "M";
    }
    if (value >= 1_000) {
      return (value / 1_000).toFixed(1) + "K";
    }
    return value.toString();
  };

  return (
    <div className="bg-[color:var(--card)] border border-[color:var(--border)] rounded-2xl p-6 flex flex-col gap-6 shadow-sm transition-colors duration-300">
      {/* Chart controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="font-bold text-lg text-[color:var(--foreground)] flex items-center gap-2">
            <ChartIcon className="w-5 h-5 text-blue-600" />
            Biểu đồ diễn biến {ticker} (2022)
          </h3>
          <p className="text-xs text-[color:var(--muted)] mt-1">
            {isMonthly 
              ? "Hiển thị dữ liệu tần suất 15 phút của tháng được chọn" 
              : "Hiển thị dữ liệu gộp trung bình hàng ngày của cả năm"}
          </p>
        </div>
        
        {/* Toggle between Price and Volume */}
        <div className="flex rounded-xl bg-[color:var(--accent)] p-1 border border-[color:var(--border)] self-stretch sm:self-auto">
          <button
            onClick={() => setChartType("close")}
            className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              chartType === "close"
                ? "bg-[color:var(--card)] text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
            }`}
          >
            Giá đóng cửa
          </button>
          <button
            onClick={() => setChartType("volume")}
            className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              chartType === "volume"
                ? "bg-[color:var(--card)] text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
            }`}
          >
            Khối lượng
          </button>
        </div>
      </div>

      {/* Main chart rendering area */}
      <div className="h-[320px] w-full select-none">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === "close" ? (
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis 
                dataKey="Datetime" 
                tick={{ fontSize: 10, fill: "var(--muted)" }} 
                axisLine={{ stroke: "var(--border)" }}
                tickLine={{ stroke: "var(--border)" }}
                minTickGap={40}
              />
              <YAxis 
                domain={["auto", "auto"]}
                tickFormatter={(val) => `$${val}`}
                tick={{ fontSize: 10, fill: "var(--muted)" }} 
                axisLine={{ stroke: "var(--border)" }}
                tickLine={{ stroke: "var(--border)" }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--card)",
                  borderColor: "var(--border)",
                  borderRadius: "12px",
                  color: "var(--foreground)",
                  fontSize: "12px",
                  boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)"
                }}
                formatter={(value: any) => [formatCurrency(Number(value)), "Giá Close"]}
                labelFormatter={(label) => `Thời gian: ${label}`}
              />
              <Area 
                type="monotone" 
                dataKey="Close" 
                stroke="#2563eb" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorClose)" 
              />
            </AreaChart>
          ) : (
            <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis 
                dataKey="Datetime" 
                tick={{ fontSize: 10, fill: "var(--muted)" }} 
                axisLine={{ stroke: "var(--border)" }}
                tickLine={{ stroke: "var(--border)" }}
                minTickGap={40}
              />
              <YAxis 
                tickFormatter={formatVolume}
                tick={{ fontSize: 10, fill: "var(--muted)" }} 
                axisLine={{ stroke: "var(--border)" }}
                tickLine={{ stroke: "var(--border)" }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--card)",
                  borderColor: "var(--border)",
                  borderRadius: "12px",
                  color: "var(--foreground)",
                  fontSize: "12px",
                  boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)"
                }}
                formatter={(value: any) => [new Intl.NumberFormat("en-US").format(Number(value)), "Khối lượng"]}
                labelFormatter={(label) => `Thời gian: ${label}`}
              />
              <Bar dataKey="Volume" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
