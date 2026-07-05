"use client";

import React, { useEffect, useState, useRef } from "react";
import { 
  Play, 
  Pause, 
  Activity, 
  Cpu, 
  ArrowUpRight, 
  ArrowDownRight, 
  CheckCircle, 
  AlertTriangle,
  RotateCcw,
  Sparkles,
  RefreshCw,
  LineChart as ChartIcon,
  TrendingUp,
  MessageSquareShare
} from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

interface PredictPoint {
  tick: number;
  datetime: string;
  ref_price: number;
  actual_price: number;
  predicted_price: number;
  actual_diff: number;
  predicted_diff: number;
  loss: number;
  context_prices: number[];
  context_times: string[];
  status?: string;
  total_ticks?: number;
  ticker?: string;
  spark_processed?: number;
}

const API_BASE = "/api";

export default function RealtimeForecast() {
  const [tickers, setTickers] = useState<string[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<string>("AAPL");
  const [loading, setLoading] = useState(true);
  
  // Custom message interval (seconds)
  const [delay, setDelay] = useState<number>(1.0);
  
  // Real-time status
  const [status, setStatus] = useState<"idle" | "initializing" | "running" | "completed" | "failed">("idle");
  const [currentTick, setCurrentTick] = useState(0);
  const [totalTicks, setTotalTicks] = useState(0);
  const [points, setPoints] = useState<PredictPoint[]>([]);
  
  // Kafka message logging console stream list
  const [kafkaLogs, setKafkaLogs] = useState<string[]>([]);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // SSE EventSource reference
  const eventSourceRef = useRef<EventSource | null>(null);
  const kafkaConsoleRef = useRef<HTMLDivElement>(null);

  // Stats calculation
  const [stats, setStats] = useState({
    correctDirection: 0,
    totalPredictions: 0,
    meanAbsoluteError: 0,
    latestLoss: 0
  });

  // Fetch tickers list on mount
  useEffect(() => {
    async function fetchTickers() {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE}/tickers`);
        if (!res.ok) throw new Error("Không thể kết nối đến máy chủ.");
        const data = await res.json();
        setTickers(data);
        if (data.length > 0) {
          setSelectedTicker(data[0]);
        }
      } catch (err: any) {
        setError(err.message || "Lỗi tải danh sách cổ phiếu.");
      } finally {
        setLoading(false);
      }
    }
    fetchTickers();
  }, []);

  // Scroll Kafka console automatically
  useEffect(() => {
    if (kafkaConsoleRef.current) {
      kafkaConsoleRef.current.scrollTop = kafkaConsoleRef.current.scrollHeight;
    }
  }, [kafkaLogs]);

  // Start background retraining (Kafka Producer) & listen to SSE stream (Kafka Consumer)
  const handleStartSimulation = async () => {
    try {
      setError(null);
      setIsPlaying(true);
      setStatus("initializing");
      setPoints([]);
      setKafkaLogs(["[Hệ thống] Đang kết nối cụm Kafka (KRaft Mode) & Spark..."]);
      setStats({ correctDirection: 0, totalPredictions: 0, meanAbsoluteError: 0, latestLoss: 0 });

      // Close previous connection if exists
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      // Connect directly to Flask port 5000 (SSE) to bypass Next.js server proxy timeout limits
      // Use stock-predictions topic if Spark is not running (no spark-processed-predictions messages)
      const sseUrl = `http://127.0.0.1:5000/api/train/stream?topic=stock-predictions`;
      const eventSource = new EventSource(sseUrl);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setKafkaLogs((prev) => [...prev, "[Kafka Consumer] Đã kết nối đến topic 'spark-processed-predictions' (Đầu ra Spark)!"]);
      };

      eventSource.onmessage = (event) => {
        try {
          const payload: PredictPoint & { type?: string; broker?: string; topic?: string } = JSON.parse(event.data);

          // Handle server-sent control messages
          if (payload.type === "connected") {
            setKafkaLogs((prev) => [...prev, `[Kafka Consumer] ✓ Kết nối thành công tới broker ${payload.broker}, topic: ${payload.topic}`]);
            return;
          }
          if (payload.type === "broker_unavailable" || payload.type === "error") {
            setStatus("failed");
            setIsPlaying(false);
            setError((payload as any).error || "Lỗi kết nối Kafka broker.");
            setKafkaLogs((prev) => [...prev, `[Kafka Consumer] ✗ Lỗi: ${(payload as any).error}`]);
            eventSource.close();
            return;
          }

          if (payload.status === "completed") {
            setStatus("completed");
            setIsPlaying(false);
            setKafkaLogs((prev) => [...prev, `[Kafka Consumer] Nhận gói tin KẾT THÚC từ Spark. Tổng: ${payload.total_ticks} ticks.`]);
            eventSource.close();
            return;
          }

          if (payload.status === "failed") {
            setStatus("failed");
            setIsPlaying(false);
            setKafkaLogs((prev) => [...prev, `[Kafka Consumer] LỖI TIẾN TRÌNH PYTHON.`]);
            eventSource.close();
            return;
          }

          setStatus("running");
          setCurrentTick(payload.tick);
          setTotalTicks(payload.total_ticks || 80);

          setPoints((prev) => {
            const nextPoints = [...prev, payload];
            
            // Recalculate stats dynamically
            let correct = 0;
            let sumAbsoluteError = 0;
            
            nextPoints.forEach((p) => {
              const isPredictedUp = p.predicted_diff >= 0;
              const isActualUp = p.actual_diff >= 0;
              if (isPredictedUp === isActualUp) {
                correct++;
              }
              sumAbsoluteError += Math.abs(p.predicted_price - p.actual_price);
            });

            setStats({
              totalPredictions: nextPoints.length,
              correctDirection: correct,
              meanAbsoluteError: Math.round((sumAbsoluteError / nextPoints.length) * 1000) / 1000,
              latestLoss: Math.round(payload.loss * 100000) / 100000
            });

            return nextPoints;
          });

          // Log message to virtual console proving Spark processed it
          const sparkPrefix = payload.spark_processed ? "[Spark Processed]" : "[Raw Message]";
          const logMsg = `${sparkPrefix} Nhận Tick #${payload.tick} lúc ${payload.datetime} | Price: $${payload.actual_price} | Pred: $${payload.predicted_price} | Loss: ${payload.loss.toFixed(5)}`;
          setKafkaLogs((prev) => [...prev, logMsg]);

        } catch (parseErr) {
          console.error("Lỗi phân tích gói tin Kafka:", parseErr);
        }
      };

      eventSource.onerror = (err) => {
        console.error("SSE Connection Error:", err);
        // ERR_EMPTY_RESPONSE hoặc server crash → thông báo thay vì loop reconnect
        if (eventSource.readyState === EventSource.CLOSED) {
          setKafkaLogs((prev) => [...prev, "[Kafka Consumer] ✗ Kết nối SSE bị đóng. Server Flask có thể đã tắt hoặc Kafka chưa chạy."]);
          setStatus("failed");
          setIsPlaying(false);
        } else {
          setKafkaLogs((prev) => [...prev, "[Kafka Consumer] Lỗi kết nối SSE, đang thử lại..."]);
        }
      };

      // Call API to boot incremental_kafka_producer.py in background on Flask side
      const res = await fetch(`${API_BASE}/train?ticker=${selectedTicker}&action=demo&max_ticks=80&delay=${delay}`, {
        method: "POST"
      });

      if (!res.ok) throw new Error("Không thể kết nối đến máy chủ Flask.");
      
    } catch (err: any) {
      setError(err.message || "Lỗi khi kích hoạt mô phỏng Python.");
      setIsPlaying(false);
      setStatus("idle");
    }
  };

  // Close EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Format currency
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 3
    }).format(val);
  };

  const getStatusBadge = (s: string) => {
    switch (s) {
      case "initializing":
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-semibold animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            Khởi tạo PyTorch & Kafka...
          </span>
        );
      case "running":
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold animate-pulse">
            <Activity className="w-3.5 h-3.5 animate-pulse" />
            Đang bắn Kafka Ticks ({currentTick}/{totalTicks})
          </span>
        );
      case "completed":
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-600/10 text-blue-600 dark:text-blue-400 text-xs font-semibold">
            <CheckCircle className="w-3.5 h-3.5" />
            Đã kết thúc stream Kafka
          </span>
        );
      case "failed":
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-semibold">
            <AlertTriangle className="w-3.5 h-3.5" />
            Lỗi tiến trình Kafka
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-500/10 text-[color:var(--muted)] text-xs font-semibold">
            Chưa bắt đầu
          </span>
        );
    }
  };

  const latestPoint = points.length > 0 ? points[points.length - 1] : null;

  return (
    <div className="flex flex-col gap-8 max-w-[1500px] mx-auto pb-12 animate-fade-in">
      {/* Title */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[color:var(--foreground)] flex items-center gap-2">
            Học gia tăng & Kafka Stream
            <span className="px-2.5 py-1 text-xs rounded-full bg-blue-600/10 text-blue-600 dark:text-blue-400 font-semibold border border-blue-500/20">
              Kafka (KRaft) + Spark + Docker
            </span>
          </h1>
          <p className="text-sm text-[color:var(--muted)] mt-1">
            Quan sát dữ liệu huấn luyện gia tăng (EWC + Replay) được truyền phát thời gian thực thông qua cụm Kafka Broker ảo chạy trên Docker
          </p>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center gap-3 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{error} - Hãy đảm bảo cụm Docker (Kafka & Spark) đã được khởi chạy.</span>
        </div>
      )}

      {/* Control Panel Card */}
      <div className="bg-[color:var(--card)] border border-[color:var(--border)] rounded-2xl p-6 shadow-sm flex flex-col md:flex-row gap-6 items-stretch md:items-center justify-between transition-colors duration-300">
        <div className="flex flex-col sm:flex-row gap-6 flex-1 max-w-2xl">
          {/* Ticker Select */}
          <div className="flex-1 flex flex-col gap-2">
            <label className="text-xs font-bold uppercase tracking-wider text-[color:var(--muted)]">
              Mã chứng khoán
            </label>
            {loading ? (
              <div className="h-11 bg-[color:var(--accent)] border border-[color:var(--border)] rounded-xl animate-pulse" />
            ) : (
              <select
                value={selectedTicker}
                onChange={(e) => setSelectedTicker(e.target.value)}
                disabled={status === "initializing" || status === "running"}
                className="h-11 px-4 rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] text-[color:var(--foreground)] font-semibold text-sm focus:outline-none cursor-pointer disabled:opacity-50"
              >
                {tickers.map((t) => (
                  <option key={t} value={t}>
                    {t} (NASDAQ 2022)
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Time Interval Select Option */}
          <div className="w-48 flex flex-col gap-2">
            <label className="text-xs font-bold uppercase tracking-wider text-[color:var(--muted)]">
              Tần suất gửi tin (giây)
            </label>
            <select
              value={delay}
              onChange={(e) => setDelay(parseFloat(e.target.value))}
              disabled={status === "initializing" || status === "running"}
              className="h-11 px-4 rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] text-[color:var(--foreground)] font-semibold text-sm focus:outline-none cursor-pointer disabled:opacity-50"
            >
              <option value={0.5}>0.5 giây / msg</option>
              <option value={1.0}>1.0 giây / msg (Chuẩn)</option>
              <option value={2.0}>2.0 giây / msg</option>
              <option value={5.0}>5.0 giây / msg (Chậm)</option>
            </select>
          </div>
        </div>

        {/* Buttons Controls */}
        <div className="flex items-center gap-3 self-stretch md:self-auto justify-end">
          {status === "idle" || status === "completed" || status === "failed" ? (
            <button
              onClick={handleStartSimulation}
              disabled={loading}
              className="h-11 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md shadow-blue-600/15 flex items-center gap-2 cursor-pointer transition-all"
            >
              <Play className="w-4 h-4 fill-white" />
              Khởi chạy Kafka Stream
            </button>
          ) : (
            <>
              {/* Reset to stop */}
              <button
                onClick={() => {
                  if (eventSourceRef.current) {
                    eventSourceRef.current.close();
                    eventSourceRef.current = null;
                  }
                  setIsPlaying(false);
                  setStatus("idle");
                  setPoints([]);
                  setKafkaLogs([]);
                  setStats({ correctDirection: 0, totalPredictions: 0, meanAbsoluteError: 0, latestLoss: 0 });
                }}
                className="h-11 px-4 rounded-xl border border-[color:var(--border)] hover:bg-[color:var(--accent)] text-[color:var(--foreground)] font-semibold text-sm transition-all flex items-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                Dừng & Đặt lại
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Content Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side: Charts (Live Prediction + Loss) */}
        <div className="lg:col-span-2 flex flex-col gap-8">
          
          {/* Chart 1: Real-time actual vs predicted Close prices */}
          <div className="bg-[color:var(--card)] border border-[color:var(--border)] rounded-2xl p-6 shadow-sm flex flex-col gap-6 transition-colors duration-300">
            <div className="flex justify-between items-center border-b border-[color:var(--border)] pb-4">
              <div>
                <h3 className="font-bold text-lg text-[color:var(--foreground)] flex items-center gap-2">
                  <ChartIcon className="w-5 h-5 text-blue-600" />
                  Biểu đồ giá Close: Thực tế vs Kafka Dự báo
                </h3>
                <p className="text-xs text-[color:var(--muted)] mt-1">
                  Hiển thị luồng dữ liệu dự đoán nhận được từ Kafka Broker (Thực tế vs LSTM)
                </p>
              </div>
              {getStatusBadge(status)}
            </div>

            <div className="h-[340px] w-full select-none">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis 
                    dataKey="datetime" 
                    tick={{ fontSize: 10, fill: "var(--muted)" }} 
                    axisLine={{ stroke: "var(--border)" }}
                    tickLine={{ stroke: "var(--border)" }}
                    minTickGap={60}
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
                  />
                  <Legend iconType="circle" />
                  <Line 
                    name="Giá thực tế (Actual Target)" 
                    type="monotone" 
                    dataKey="actual_price" 
                    stroke="#10b981" 
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line 
                    name="Giá dự báo (Kafka Prediction)" 
                    type="monotone" 
                    dataKey="predicted_price" 
                    stroke="#3b82f6" 
                    strokeWidth={2.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Retraining loss curve decreasing live */}
          <div className="bg-[color:var(--card)] border border-[color:var(--border)] rounded-2xl p-6 shadow-sm flex flex-col gap-6 transition-colors duration-300">
            <div>
              <h3 className="font-bold text-lg text-[color:var(--foreground)] flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-rose-500" />
                Đường cong mất mát (Incremental Loss)
              </h3>
              <p className="text-xs text-[color:var(--muted)] mt-1">
                Biểu diễn mức MSE Loss hội tụ truyền phát qua message Kafka
              </p>
            </div>

            <div className="h-[200px] w-full select-none">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis 
                    dataKey="tick" 
                    tick={{ fontSize: 9, fill: "var(--muted)" }} 
                    axisLine={{ stroke: "var(--border)" }}
                    tickLine={{ stroke: "var(--border)" }}
                    minTickGap={40}
                  />
                  <YAxis 
                    domain={["auto", "auto"]}
                    tick={{ fontSize: 9, fill: "var(--muted)" }} 
                    axisLine={{ stroke: "var(--border)" }}
                    tickLine={{ stroke: "var(--border)" }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      borderColor: "var(--border)",
                      borderRadius: "12px",
                      color: "var(--foreground)",
                      fontSize: "12px"
                    }}
                  />
                  <Line 
                    name="MSE Loss" 
                    type="monotone" 
                    dataKey="loss" 
                    stroke="#f43f5e" 
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Right Side: Kafka Virtual Terminal Logs & Live metrics */}
        <div className="flex flex-col gap-8">
          
          {/* Card 1: Kafka Virtual Console Monitor */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-3 shadow-md">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
                <MessageSquareShare className="w-4 h-4 text-blue-400" />
                Kafka Console Monitor (Topic: stock-predictions)
              </span>
            </div>
            
            <div 
              ref={kafkaConsoleRef}
              className="h-44 overflow-y-auto font-mono text-[10px] text-slate-300 leading-relaxed flex flex-col gap-1.5 scrollbar-thin scrollbar-thumb-slate-800 bg-slate-950 p-3 rounded-xl border border-slate-800"
            >
              {kafkaLogs.length === 0 ? (
                <div className="text-slate-500 italic py-12 text-center">
                  Cụm Kafka đang chờ sự kiện phát tin...
                </div>
              ) : (
                kafkaLogs.map((log, idx) => (
                  <div key={idx} className="whitespace-pre-wrap break-all border-b border-slate-900/50 pb-1">
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Card 2: Last predicted tick metrics */}
          <div className="bg-[color:var(--card)] border border-[color:var(--border)] rounded-2xl p-6 shadow-sm flex flex-col gap-4 transition-colors duration-300">
            <h3 className="font-bold text-base text-[color:var(--foreground)] border-b border-[color:var(--border)] pb-3">
              Thông số từ Message mới nhất
            </h3>

            {latestPoint ? (
              <div className="flex flex-col gap-3.5 text-xs font-semibold">
                <div className="flex justify-between py-1 border-b border-[color:var(--border)]">
                  <span className="text-[color:var(--muted)]">Mã cổ phiếu</span>
                  <span className="font-mono text-blue-600 dark:text-blue-400 font-bold">{latestPoint.ticker}</span>
                </div>

                <div className="flex justify-between py-1 border-b border-[color:var(--border)]">
                  <span className="text-[color:var(--muted)]">Datetime</span>
                  <span className="font-mono">{latestPoint.datetime}</span>
                </div>

                <div className="flex justify-between py-1 border-b border-[color:var(--border)]">
                  <span className="text-[color:var(--muted)]">Giá Close tham chiếu</span>
                  <span>{formatCurrency(latestPoint.ref_price)}</span>
                </div>

                <div className="flex justify-between py-1 border-b border-[color:var(--border)]">
                  <span className="text-[color:var(--muted)]">Dự báo LSTM</span>
                  <span className="text-blue-600 dark:text-blue-400 font-bold">{formatCurrency(latestPoint.predicted_price)}</span>
                </div>

                <div className="flex justify-between py-1 border-b border-[color:var(--border)]">
                  <span className="text-[color:var(--muted)]">Thực tế sau 26 bars</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">{formatCurrency(latestPoint.actual_price)}</span>
                </div>

                <div className="flex justify-between items-center py-1">
                  <span className="text-[color:var(--muted)]">Xu hướng dự đoán</span>
                  {latestPoint.predicted_diff >= 0 ? (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 text-[10px] font-bold">TĂNG (+)</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-600 text-[10px] font-bold">GIẢM (-)</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-xs text-[color:var(--muted)] italic">
                Bấm &quot;Khởi chạy Kafka Stream&quot; để kết nối.
              </div>
            )}
          </div>

          {/* Card 3: Cumulative simulation statistics */}
          <div className="bg-[color:var(--card)] border border-[color:var(--border)] rounded-2xl p-6 shadow-sm flex flex-col gap-4 transition-colors duration-300">
            <h3 className="font-bold text-base text-[color:var(--foreground)] border-b border-[color:var(--border)] pb-3">
              Chỉ số Mô phỏng Lũy kế
            </h3>

            <div className="flex flex-col gap-3.5 text-xs font-semibold">
              <div className="flex justify-between py-1 border-b border-[color:var(--border)]">
                <span className="text-[color:var(--muted)]">Số ticks đã nhận</span>
                <span>{stats.totalPredictions} / {totalTicks}</span>
              </div>

              <div className="flex justify-between py-1 border-b border-[color:var(--border)]">
                <span className="text-[color:var(--muted)]">MSE Loss mới nhất</span>
                <span className="font-mono text-rose-600 dark:text-rose-400 font-bold">{stats.latestLoss || "--"}</span>
              </div>

              <div className="flex justify-between py-1 border-b border-[color:var(--border)]">
                <span className="text-[color:var(--muted)]">Sai số trung bình (MAE)</span>
                <span className="text-amber-500 font-bold">{stats.totalPredictions > 0 ? formatCurrency(stats.meanAbsoluteError) : "--"}</span>
              </div>

              <div className="flex justify-between items-center py-1">
                <span className="text-[color:var(--muted)]">Độ chính xác xu hướng</span>
                <span className="text-xl font-black text-blue-600 dark:text-blue-400">
                  {stats.totalPredictions > 0 
                    ? `${Math.round((stats.correctDirection / stats.totalPredictions) * 100)}%` 
                    : "--"}
                </span>
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
