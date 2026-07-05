"use client";

import React, { useEffect, useState } from "react";
import StockChart from "@/components/StockChart";
import { 
  BarChart3, 
  Layers, 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  Activity,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  FolderOpen
} from "lucide-react";

interface TickerStats {
  ticker: string;
  total_rows: number;
  start_date: string;
  end_date: string;
  close: {
    mean: number;
    min: number;
    max: number;
    std: number;
  };
  volume: {
    mean: number;
    min: number;
    max: number;
    std: number;
  };
}

interface StockRecord {
  Datetime: string;
  Open: number;
  High: number;
  Low: number;
  Close: number;
  Volume: number;
}

const API_BASE = "/api";

export default function ViewDataset() {
  const [tickers, setTickers] = useState<string[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<string>("AAPL");
  const [selectedMonth, setSelectedMonth] = useState<string>(""); // Empty means full year
  
  const [stats, setStats] = useState<TickerStats | null>(null);
  const [chartData, setChartData] = useState<StockRecord[]>([]);
  const [tableData, setTableData] = useState<StockRecord[]>([]);
  
  // Pagination
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalRecords, setTotalRecords] = useState<number>(0);
  
  // Loading & error states
  const [loadingTickers, setLoadingTickers] = useState(true);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingChart, setLoadingChart] = useState(false);
  const [loadingTable, setLoadingTable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch tickers list once
  useEffect(() => {
    async function fetchTickers() {
      try {
        setLoadingTickers(true);
        const res = await fetch(`${API_BASE}/tickers`);
        if (!res.ok) throw new Error("Không thể kết nối đến máy chủ Backend.");
        const data = await res.json();
        setTickers(data);
        if (data.length > 0) {
          setSelectedTicker(data[0]);
        }
      } catch (err: any) {
        setError(err.message || "Lỗi tải danh sách mã chứng khoán.");
      } finally {
        setLoadingTickers(false);
      }
    }
    fetchTickers();
  }, []);

  // Fetch stats and chart data whenever ticker or month changes
  useEffect(() => {
    if (!selectedTicker) return;

    async function fetchStatsAndChart() {
      try {
        setLoadingStats(true);
        setLoadingChart(true);
        setError(null);

        // 1. Stats (Always fetch for the full year to show basic ticker profile)
        const statsRes = await fetch(`${API_BASE}/tickers/${selectedTicker}/stats`);
        if (!statsRes.ok) throw new Error(`Lỗi tải stats cho ${selectedTicker}`);
        const statsJson = await statsRes.json();
        setStats(statsJson);

        // 2. Chart data (can be filtered by month)
        const monthQuery = selectedMonth ? `?month=${selectedMonth}` : "";
        const chartRes = await fetch(`${API_BASE}/tickers/${selectedTicker}/chart${monthQuery}`);
        if (!chartRes.ok) throw new Error(`Lỗi tải dữ liệu biểu đồ cho ${selectedTicker}`);
        const chartJson = await chartRes.json();
        setChartData(chartJson);

      } catch (err: any) {
        setError(err.message || "Lỗi tải thông số dữ liệu.");
      } finally {
        setLoadingStats(false);
        setLoadingChart(false);
      }
    }

    fetchStatsAndChart();
    setPage(1); // Reset page on ticker/month changes
  }, [selectedTicker, selectedMonth]);

  // Fetch table data whenever ticker, month, page, or page size changes
  useEffect(() => {
    if (!selectedTicker) return;

    async function fetchTableData() {
      try {
        setLoadingTable(true);
        const monthQuery = selectedMonth ? `&month=${selectedMonth}` : "";
        const tableRes = await fetch(
          `${API_BASE}/tickers/${selectedTicker}/data?page=${page}&page_size=${pageSize}${monthQuery}`
        );
        if (!tableRes.ok) throw new Error("Lỗi tải danh sách dữ liệu phân trang.");
        const tableJson = await tableRes.json();
        
        setTableData(tableJson.data);
        setTotalPages(tableJson.pages);
        setTotalRecords(tableJson.total);
      } catch (err: any) {
        setError(err.message || "Lỗi tải bảng dữ liệu.");
      } finally {
        setLoadingTable(false);
      }
    }

    fetchTableData();
  }, [selectedTicker, selectedMonth, page, pageSize]);

  // Handle manual refresh
  const handleRefresh = () => {
    setSelectedTicker(selectedTicker);
    // Trigger double effect trigger workaround
    const temp = selectedMonth;
    setSelectedMonth("temp");
    setTimeout(() => setSelectedMonth(temp), 50);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD"
    }).format(val);
  };

  const formatVolume = (val: number) => {
    return new Intl.NumberFormat("en-US").format(val);
  };

  const monthsList = [
    { value: "", label: "Cả năm (Gộp ngày)" },
    { value: "01", label: "Tháng 01 (15 phút)" },
    { value: "02", label: "Tháng 02 (15 phút)" },
    { value: "03", label: "Tháng 03 (15 phút)" },
    { value: "04", label: "Tháng 04 (15 phút)" },
    { value: "05", label: "Tháng 05 (15 phút)" },
    { value: "06", label: "Tháng 06 (15 phút)" },
    { value: "07", label: "Tháng 07 (15 phút)" },
    { value: "08", label: "Tháng 08 (15 phút)" },
    { value: "09", label: "Tháng 09 (15 phút)" },
    { value: "10", label: "Tháng 10 (15 phút)" },
    { value: "11", label: "Tháng 11 (15 phút)" },
    { value: "12", label: "Tháng 12 (15 phút)" }
  ];

  return (
    <div className="flex flex-col gap-8 max-w-[1600px] mx-auto pb-12 animate-fade-in">
      {/* Title block */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[color:var(--foreground)]">
            Xem Tập Dữ Liệu
          </h1>
          <p className="text-sm text-[color:var(--muted)] mt-1">
            Theo dõi dữ liệu lịch sử và các đặc trưng kỹ thuật của các cổ phiếu NASDAQ 2022
          </p>
        </div>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-md shadow-blue-600/15 transition-all"
        >
          <RefreshCw className="w-4 h-4" />
          Làm mới dữ liệu
        </button>
      </div>

      {/* Error state alert */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center gap-3 text-sm">
          <div className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
          <span>{error} - Hãy đảm bảo máy chủ Python Flask backend đã được khởi chạy ở cổng 5000.</span>
        </div>
      )}

      {/* Filter and selectors bar */}
      <div className="bg-[color:var(--card)] border border-[color:var(--border)] rounded-2xl p-6 shadow-sm flex flex-col md:flex-row gap-6 items-stretch md:items-center justify-between transition-colors duration-300">
        <div className="flex flex-col sm:flex-row gap-6 flex-1">
          {/* Ticker Selector */}
          <div className="flex-1 flex flex-col gap-2">
            <label className="text-xs font-bold uppercase tracking-wider text-[color:var(--muted)]">
              Mã chứng khoán (Ticker)
            </label>
            {loadingTickers ? (
              <div className="h-11 bg-[color:var(--accent)] border border-[color:var(--border)] rounded-xl animate-pulse" />
            ) : (
              <select
                value={selectedTicker}
                onChange={(e) => setSelectedTicker(e.target.value)}
                className="h-11 px-4 rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] text-[color:var(--foreground)] font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
              >
                {tickers.map((t) => (
                  <option key={t} value={t}>
                    {t} (NASDAQ)
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Month Selector */}
          <div className="flex-1 flex flex-col gap-2">
            <label className="text-xs font-bold uppercase tracking-wider text-[color:var(--muted)]">
              Khoảng thời gian (Tháng)
            </label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="h-11 px-4 rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] text-[color:var(--foreground)] font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
            >
              {monthsList.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Short description status */}
        <div className="md:border-l border-[color:var(--border)] pl-0 md:pl-6 flex flex-col justify-center">
          <span className="text-xs text-[color:var(--muted)] font-medium">Trạng thái tệp tin</span>
          <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center gap-1.5">
            <FolderOpen className="w-4 h-4" />
            Đã tải thành công
          </span>
        </div>
      </div>

      {/* Grid of stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1: Row count */}
        <div className="bg-[color:var(--card)] border border-[color:var(--border)] rounded-2xl p-6 shadow-sm flex items-center gap-5 transition-colors duration-300">
          <div className="p-3.5 bg-blue-600/10 text-blue-600 dark:text-blue-400 rounded-xl">
            <Layers className="w-6 h-6" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-medium text-[color:var(--muted)]">Tổng số dòng dữ liệu</span>
            {loadingStats || !stats ? (
              <span className="h-6 w-24 bg-[color:var(--accent)] rounded-lg animate-pulse mt-1" />
            ) : (
              <span className="text-2xl font-bold text-[color:var(--foreground)] truncate">
                {formatVolume(stats.total_rows)}
              </span>
            )}
          </div>
        </div>

        {/* Card 2: Date range */}
        <div className="bg-[color:var(--card)] border border-[color:var(--border)] rounded-2xl p-6 shadow-sm flex items-center gap-5 transition-colors duration-300">
          <div className="p-3.5 bg-violet-600/10 text-violet-600 dark:text-violet-400 rounded-xl">
            <Calendar className="w-6 h-6" />
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-medium text-[color:var(--muted)]">Thời gian thu thập</span>
            {loadingStats || !stats ? (
              <span className="h-6 w-32 bg-[color:var(--accent)] rounded-lg animate-pulse mt-1" />
            ) : (
              <span className="text-sm font-bold text-[color:var(--foreground)] mt-1 truncate">
                03/01 - 30/12/2022
              </span>
            )}
          </div>
        </div>

        {/* Card 3: Price Peak */}
        <div className="bg-[color:var(--card)] border border-[color:var(--border)] rounded-2xl p-6 shadow-sm flex items-center gap-5 transition-colors duration-300">
          <div className="p-3.5 bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 rounded-xl">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-medium text-[color:var(--muted)]">Giá đóng cửa cao nhất</span>
            {loadingStats || !stats ? (
              <span className="h-6 w-20 bg-[color:var(--accent)] rounded-lg animate-pulse mt-1" />
            ) : (
              <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(stats.close.max)}
              </span>
            )}
          </div>
        </div>

        {/* Card 4: Price Floor */}
        <div className="bg-[color:var(--card)] border border-[color:var(--border)] rounded-2xl p-6 shadow-sm flex items-center gap-5 transition-colors duration-300">
          <div className="p-3.5 bg-rose-600/10 text-rose-600 dark:text-rose-400 rounded-xl">
            <TrendingDown className="w-6 h-6" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-medium text-[color:var(--muted)]">Giá đóng cửa thấp nhất</span>
            {loadingStats || !stats ? (
              <span className="h-6 w-20 bg-[color:var(--accent)] rounded-lg animate-pulse mt-1" />
            ) : (
              <span className="text-2xl font-bold text-rose-600 dark:text-rose-400">
                {formatCurrency(stats.close.min)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Stock Chart */}
      {loadingChart ? (
        <div className="h-[400px] w-full flex items-center justify-center bg-[color:var(--card)] border border-[color:var(--border)] rounded-2xl animate-pulse">
          <span className="text-[color:var(--muted)]">Đang tải dữ liệu biểu đồ...</span>
        </div>
      ) : (
        <StockChart data={chartData} ticker={selectedTicker} isMonthly={selectedMonth !== ""} />
      )}

      {/* Paginated Data Table Section */}
      <div className="bg-[color:var(--card)] border border-[color:var(--border)] rounded-2xl shadow-sm overflow-hidden flex flex-col transition-colors duration-300">
        {/* Table header */}
        <div className="p-6 border-b border-[color:var(--border)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="font-bold text-lg text-[color:var(--foreground)] flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              Chi tiết bảng dữ liệu ({selectedTicker})
            </h3>
            <p className="text-xs text-[color:var(--muted)] mt-1">
              Hiển thị thông số mở cửa, cao nhất, thấp nhất, đóng cửa và khối lượng 15 phút.
            </p>
          </div>
          
          {/* Page size settings */}
          <div className="flex items-center gap-2 self-stretch sm:self-auto">
            <span className="text-xs text-[color:var(--muted)] font-medium shrink-0">Kích thước trang:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="px-3 py-1.5 rounded-lg border border-[color:var(--border)] bg-[color:var(--accent)] text-[color:var(--foreground)] text-xs font-semibold focus:outline-none"
            >
              <option value={10}>10 dòng</option>
              <option value={20}>20 dòng</option>
              <option value={50}>50 dòng</option>
            </select>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto w-full">
          {loadingTable ? (
            <div className="p-12 text-center text-sm text-[color:var(--muted)] flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
              Đang tải danh sách bản ghi...
            </div>
          ) : tableData.length === 0 ? (
            <div className="p-12 text-center text-sm text-[color:var(--muted)]">
              Không tìm thấy dòng dữ liệu nào phù hợp.
            </div>
          ) : (
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-[color:var(--accent)] border-b border-[color:var(--border)] text-[color:var(--muted)] text-xs font-bold uppercase tracking-wider">
                  <th className="py-4 px-6">Thời gian (Datetime)</th>
                  <th className="py-4 px-6 text-right">Mở cửa (Open)</th>
                  <th className="py-4 px-6 text-right">Cao nhất (High)</th>
                  <th className="py-4 px-6 text-right">Thấp nhất (Low)</th>
                  <th className="py-4 px-6 text-right">Đóng cửa (Close)</th>
                  <th className="py-4 px-6 text-right">Khối lượng (Volume)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--border)]">
                {tableData.map((row, idx) => (
                  <tr 
                    key={idx} 
                    className="hover:bg-[color:var(--accent)]/40 transition-colors text-[color:var(--foreground)] font-medium"
                  >
                    <td className="py-4 px-6 font-mono text-xs">{row.Datetime}</td>
                    <td className="py-4 px-6 text-right font-mono text-xs">{formatCurrency(row.Open)}</td>
                    <td className="py-4 px-6 text-right font-mono text-xs text-emerald-600 dark:text-emerald-400">{formatCurrency(row.High)}</td>
                    <td className="py-4 px-6 text-right font-mono text-xs text-rose-600 dark:text-rose-400">{formatCurrency(row.Low)}</td>
                    <td className="py-4 px-6 text-right font-mono text-xs font-bold">{formatCurrency(row.Close)}</td>
                    <td className="py-4 px-6 text-right font-mono text-xs text-[color:var(--muted)]">{formatVolume(row.Volume)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Table footer / Pagination */}
        {totalPages > 1 && (
          <div className="p-6 border-t border-[color:var(--border)] flex flex-col sm:flex-row justify-between items-center gap-4 bg-[color:var(--accent)]/10">
            <span className="text-xs text-[color:var(--muted)] font-medium">
              Hiển thị trang <strong className="text-[color:var(--foreground)] font-bold">{page}</strong> trong tổng số <strong className="text-[color:var(--foreground)] font-bold">{totalPages}</strong> trang ({formatVolume(totalRecords)} dòng)
            </span>
            
            {/* Pagination buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] hover:bg-[color:var(--accent)] text-[color:var(--foreground)] disabled:opacity-40 disabled:hover:bg-[color:var(--card)] transition-colors"
                aria-label="Trang trước"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              
              {/* Dynamic page numbers */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                // Calculate window of page numbers to render
                let pageNum = i + 1;
                if (page > 3 && totalPages > 5) {
                  pageNum = page - 3 + i;
                  if (pageNum + (5 - i - 1) > totalPages) {
                    pageNum = totalPages - 5 + i + 1;
                  }
                }
                
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                      page === pageNum
                        ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                        : "border-[color:var(--border)] bg-[color:var(--card)] hover:bg-[color:var(--accent)] text-[color:var(--foreground)]"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] hover:bg-[color:var(--accent)] text-[color:var(--foreground)] disabled:opacity-40 disabled:hover:bg-[color:var(--card)] transition-colors"
                aria-label="Trang sau"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
