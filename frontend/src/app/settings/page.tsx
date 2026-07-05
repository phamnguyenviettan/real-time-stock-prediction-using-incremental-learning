"use client";

import React, { useEffect, useState, useRef } from "react";
import { useTheme } from "@/context/ThemeContext";
import { 
  Sun, 
  Moon, 
  Settings, 
  Cpu, 
  Play, 
  Terminal, 
  Loader2, 
  Sliders, 
  BookOpen 
} from "lucide-react";

interface ModelConfig {
  initial_epochs: number;
  batch_size: number;
  lr: number;
  incremental_epochs: number;
  incremental_lr: number;
  ewc_lambda: number;
  replay_alpha: number;
  replay_ratio: number;
  lookback_window: number;
  forecast_horizon: number;
  device: string;
  hidden_size: number;
  num_layers: number;
  dropout: number;
}

interface TrainingStatus {
  ticker: string;
  status: "idle" | "running" | "completed" | "failed";
  logs: string;
}

const API_BASE = "/api";

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const [config, setConfig] = useState<ModelConfig | null>(null);
  const [tickers, setTickers] = useState<string[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<string>("AAPL");
  const [maxTicks, setMaxTicks] = useState<number>(100);
  
  // Training state
  const [trainStatus, setTrainStatus] = useState<TrainingStatus>({
    ticker: "AAPL",
    status: "idle",
    logs: ""
  });
  
  const [startingTrain, setStartingTrain] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Console logs autoscroll ref
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  // Fetch configs and tickers
  useEffect(() => {
    async function initData() {
      try {
        setLoadingConfig(true);
        setError(null);
        
        // Fetch project configuration
        const configRes = await fetch(`${API_BASE}/config`);
        if (!configRes.ok) throw new Error("Không thể kết nối đến API lấy cấu hình.");
        const configJson = await configRes.json();
        setConfig(configJson);
        
        // Fetch tickers list
        const tickersRes = await fetch(`${API_BASE}/tickers`);
        if (tickersRes.ok) {
          const tickersJson = await tickersRes.json();
          setTickers(tickersJson);
          if (tickersJson.length > 0) {
            setSelectedTicker(tickersJson[0]);
          }
        }
      } catch (err: any) {
        setError(err.message || "Lỗi tải cấu hình backend.");
      } finally {
        setLoadingConfig(false);
      }
    }
    initData();
  }, []);

  // Poll status of the training process
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    async function checkStatus() {
      if (!selectedTicker) return;
      try {
        const res = await fetch(`${API_BASE}/train?ticker=${selectedTicker}&action=status`);
        if (res.ok) {
          const statusJson = await res.json();
          setTrainStatus(statusJson);
          
          // Stop polling if completed or failed
          if (statusJson.status !== "running" && intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
        }
      } catch (err) {
        console.error("Lỗi kiểm tra trạng thái huấn luyện:", err);
      }
    }

    // Always fetch initial status when ticker changes
    checkStatus();

    // Set interval if the current selection is running, or if we just started it
    intervalId = setInterval(checkStatus, 2000);

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [selectedTicker, startingTrain]);

  // Scroll terminal logs automatically
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [trainStatus.logs]);

  // Trigger training
  const handleStartTraining = async () => {
    if (!selectedTicker) return;
    try {
      setStartingTrain(true);
      const res = await fetch(`${API_BASE}/train?ticker=${selectedTicker}&action=start&max_ticks=${maxTicks}`, {
        method: "POST"
      });
      if (!res.ok) throw new Error("Không thể kích hoạt tiến trình huấn luyện.");
      const data = await res.json();
      
      setTrainStatus((prev) => ({
        ...prev,
        status: data.status,
        logs: prev.logs + "\n[Hệ thống] Đang gửi yêu cầu khởi chạy...\n"
      }));
    } catch (err: any) {
      alert(err.message || "Có lỗi xảy ra khi chạy huấn luyện.");
    } finally {
      setStartingTrain(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "running":
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-semibold animate-pulse">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Đang chạy
          </span>
        );
      case "completed":
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Hoàn thành
          </span>
        );
      case "failed":
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-semibold">
            <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            Thất bại
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-500/10 text-[color:var(--muted)] text-xs font-semibold">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            Sẵn sàng (Chưa chạy)
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col gap-8 max-w-[1200px] mx-auto pb-12 animate-fade-in">
      {/* Title */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-[color:var(--foreground)]">
          Cấu hình Hệ thống
        </h1>
        <p className="text-sm text-[color:var(--muted)] mt-1">
          Tùy chỉnh giao diện hiển thị và quản lý cấu hình mô hình học sâu của bạn
        </p>
      </div>

      {/* Grid: Theme and Hyperparameters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left Side: General options */}
        <div className="flex flex-col gap-8">
          {/* Card 1: Theme mode selector */}
          <div className="bg-[color:var(--card)] border border-[color:var(--border)] rounded-2xl p-6 shadow-sm flex flex-col gap-4 transition-colors duration-300">
            <h3 className="font-bold text-base text-[color:var(--foreground)] flex items-center gap-2">
              <Sun className="w-5 h-5 text-indigo-500" />
              Chế độ giao diện
            </h3>
            <p className="text-xs text-[color:var(--muted)]">
              Chuyển đổi giao diện Sáng / Tối phù hợp với môi trường làm việc của bạn.
            </p>
            
            <div className="grid grid-cols-2 rounded-xl bg-[color:var(--accent)] p-1 border border-[color:var(--border)] mt-2">
              <button
                onClick={() => theme !== "light" && toggleTheme()}
                className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  theme === "light"
                    ? "bg-[color:var(--card)] text-indigo-600 shadow-sm"
                    : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
                }`}
              >
                <Sun className="w-4 h-4" />
                Sáng
              </button>
              <button
                onClick={() => theme !== "dark" && toggleTheme()}
                className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  theme === "dark"
                    ? "bg-[color:var(--card)] text-indigo-400 shadow-sm"
                    : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
                }`}
              >
                <Moon className="w-4 h-4" />
                Tối
              </button>
            </div>
          </div>

          {/* Card 2: Environment details */}
          <div className="bg-[color:var(--card)] border border-[color:var(--border)] rounded-2xl p-6 shadow-sm flex flex-col gap-4 transition-colors duration-300">
            <h3 className="font-bold text-base text-[color:var(--foreground)] flex items-center gap-2">
              <Cpu className="w-5 h-5 text-emerald-500" />
              Môi trường phần cứng
            </h3>
            
            <div className="flex flex-col gap-3 mt-2 text-xs">
              <div className="flex justify-between py-1 border-b border-[color:var(--border)]">
                <span className="text-[color:var(--muted)]">Hệ điều hành</span>
                <span className="font-semibold">WSL (Linux-Ubuntu)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[color:var(--border)]">
                <span className="text-[color:var(--muted)]">Môi trường Conda</span>
                <span className="font-semibold">ivf</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[color:var(--border)]">
                <span className="text-[color:var(--muted)]">Thiết bị huấn luyện</span>
                {loadingConfig || !config ? (
                  <span className="h-4 w-12 bg-[color:var(--accent)] rounded animate-pulse" />
                ) : (
                  <span className="font-bold text-blue-600 dark:text-blue-400 uppercase">
                    {config.device}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Hyperparameters summary */}
        <div className="md:col-span-2 bg-[color:var(--card)] border border-[color:var(--border)] rounded-2xl p-6 shadow-sm flex flex-col gap-4 transition-colors duration-300">
          <h3 className="font-bold text-base text-[color:var(--foreground)] flex items-center gap-2">
            <Sliders className="w-5 h-5 text-blue-600" />
            Cấu hình Hyperparameters (Mô hình LSTM)
          </h3>
          <p className="text-xs text-[color:var(--muted)]">
            Thông số huấn luyện được khai báo và đọc trực tiếp từ file cấu hình nguồn <code className="font-mono text-blue-600 dark:text-blue-400">src/config.py</code>.
          </p>

          {loadingConfig || !config ? (
            <div className="flex-1 flex items-center justify-center p-12">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 mt-2">
              {/* Box 1: Slide Window */}
              <div className="flex flex-col gap-1.5 p-4 rounded-xl bg-[color:var(--accent)]/55">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--muted)] flex items-center gap-1">
                  <BookOpen className="w-3.5 h-3.5 text-blue-500" />
                  Kích thước cửa sổ
                </span>
                <div className="flex justify-between items-baseline mt-1 text-xs">
                  <span>Lookback Window (Context)</span>
                  <span className="font-bold text-sm text-[color:var(--foreground)]">{config.lookback_window} bars (19.5h)</span>
                </div>
                <div className="flex justify-between items-baseline text-xs">
                  <span>Forecast Horizon (Dự báo trước)</span>
                  <span className="font-bold text-sm text-[color:var(--foreground)]">{config.forecast_horizon} bars (6.5h)</span>
                </div>
              </div>

              {/* Box 2: Network structure */}
              <div className="flex flex-col gap-1.5 p-4 rounded-xl bg-[color:var(--accent)]/55">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--muted)] flex items-center gap-1">
                  <Cpu className="w-3.5 h-3.5 text-indigo-500" />
                  Cấu trúc mạng LSTM
                </span>
                <div className="flex justify-between items-baseline mt-1 text-xs">
                  <span>Hidden Size (Số nơ-ron)</span>
                  <span className="font-bold text-sm text-[color:var(--foreground)]">{config.hidden_size}</span>
                </div>
                <div className="flex justify-between items-baseline text-xs">
                  <span>Num Layers / Dropout</span>
                  <span className="font-bold text-sm text-[color:var(--foreground)]">{config.num_layers} layers / {config.dropout}</span>
                </div>
              </div>

              {/* Box 3: Phase 1 Offline params */}
              <div className="flex flex-col gap-1.5 p-4 rounded-xl bg-[color:var(--accent)]/55">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--muted)]">
                  Huấn luyện Nền (Phase 1 Batch)
                </span>
                <div className="flex justify-between items-baseline mt-1 text-xs">
                  <span>Epochs tối đa / Batch size</span>
                  <span className="font-bold text-sm text-[color:var(--foreground)]">{config.initial_epochs} / {config.batch_size}</span>
                </div>
                <div className="flex justify-between items-baseline text-xs">
                  <span>Tốc độ học (Learning Rate)</span>
                  <span className="font-bold text-sm text-[color:var(--foreground)]">{config.lr}</span>
                </div>
              </div>

              {/* Box 4: Phase 2 Incremental params */}
              <div className="flex flex-col gap-1.5 p-4 rounded-xl bg-[color:var(--accent)]/55">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--muted)]">
                  Huấn luyện gia tăng (Phase 2 Online)
                </span>
                <div className="flex justify-between items-baseline mt-1 text-xs">
                  <span>Tốc độ học (LR gia tăng)</span>
                  <span className="font-bold text-sm text-[color:var(--foreground)]">{config.incremental_lr}</span>
                </div>
                <div className="flex justify-between items-baseline text-xs">
                  <span>EWC Lambda / Replay Ratio</span>
                  <span className="font-bold text-sm text-[color:var(--foreground)]">{config.ewc_lambda} / {config.replay_ratio}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Background Retraining Runner Module */}
      <div className="bg-[color:var(--card)] border border-[color:var(--border)] rounded-2xl p-6 shadow-sm flex flex-col gap-6 transition-colors duration-300">
        <div>
          <h3 className="font-bold text-lg text-[color:var(--foreground)] flex items-center gap-2">
            <Play className="w-5 h-5 text-emerald-500 fill-emerald-500/20" />
            Trình thử nghiệm Huấn luyện Gia tăng (Incremental Retraining Run)
          </h3>
          <p className="text-xs text-[color:var(--muted)] mt-1">
            Cho phép bạn trực tiếp chạy tiến trình huấn luyện học sâu gia tăng (EWC + Experience Replay) trong WSL và theo dõi log đầu ra trong thời gian thực.
          </p>
        </div>

        {/* Configurations inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-end bg-[color:var(--accent)]/30 border border-[color:var(--border)] p-5 rounded-xl">
          {/* Ticker select */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold uppercase tracking-wider text-[color:var(--muted)]">
              Mã cổ phiếu chạy thử nghiệm
            </label>
            <select
              value={selectedTicker}
              onChange={(e) => setSelectedTicker(e.target.value)}
              className="h-11 px-4 rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] text-[color:var(--foreground)] font-semibold text-sm focus:outline-none"
              disabled={trainStatus.status === "running"}
            >
              {tickers.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Slider Max Ticks */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold uppercase tracking-wider text-[color:var(--muted)]">
                Số lượng Ticks tối đa
              </label>
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{maxTicks} ticks</span>
            </div>
            <input
              type="range"
              min={20}
              max={500}
              step={20}
              value={maxTicks}
              onChange={(e) => setMaxTicks(Number(e.target.value))}
              className="h-11 w-full accent-blue-600 bg-transparent cursor-pointer"
              disabled={trainStatus.status === "running"}
            />
          </div>

          {/* Trigger button */}
          <button
            onClick={handleStartTraining}
            disabled={trainStatus.status === "running" || startingTrain}
            className="h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md shadow-emerald-600/15 flex items-center justify-center gap-2 disabled:opacity-40 transition-all"
          >
            {trainStatus.status === "running" ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Đang huấn luyện...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Khởi chạy Huấn luyện
              </>
            )}
          </button>
        </div>

        {/* Live log Console */}
        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-bold text-[color:var(--foreground)] flex items-center gap-2">
              <Terminal className="w-4 h-4 text-blue-600" />
              Console Logs đầu ra (Real-time logs)
            </span>
            {getStatusBadge(trainStatus.status)}
          </div>

          {/* Terminal Box */}
          <div className="h-80 w-full rounded-xl bg-slate-950 border border-slate-800 text-slate-300 font-mono text-xs p-5 overflow-y-auto flex flex-col gap-1 shadow-inner select-text">
            {trainStatus.logs ? (
              trainStatus.logs.split("\n").map((line, idx) => (
                <div key={idx} className="leading-relaxed whitespace-pre-wrap">
                  {line}
                </div>
              ))
            ) : (
              <div className="text-slate-500 italic">
                Chưa có tiến trình huấn luyện nào được khởi chạy hoặc chưa có nhật ký log hiển thị.
              </div>
            )}
            <div ref={terminalEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
