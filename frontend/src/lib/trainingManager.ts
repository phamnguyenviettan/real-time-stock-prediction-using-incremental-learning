import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import path from "path";

interface TrainerState {
  status: "idle" | "running" | "completed" | "failed";
  process: ChildProcess | null;
}

export class TrainingManager {
  private static trainers: Record<string, TrainerState> = {};

  private static getLogPath(ticker: string): string {
    const projectRoot = path.resolve(process.cwd(), "..");
    const logDir = path.join(projectRoot, "outputs", "logs");
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    return path.join(logDir, `${ticker}_train.log`);
  }

  public static start(ticker: string, maxTicks: number = 100): string {
    if (this.trainers[ticker]?.status === "running") {
      return "Tiến trình huấn luyện đang chạy.";
    }

    const logPath = this.getLogPath(ticker);
    
    // Clear old logs and write header
    fs.writeFileSync(logPath, `--- BẮT ĐẦU HUẤN LUYỆN CHO ${ticker} ---\nSố ticks tối đa: ${maxTicks}\n\n`, "utf-8");

    const projectRoot = path.resolve(process.cwd(), "..");
    
    // Launch python script in WSL conda
    // We execute: conda run -n ivf python -m experiments.run_experiment --ticker TICKER --max-ticks MAX_TICKS
    const command = "wsl";
    const args = [
      "zsh", "-i", "-c", 
      `conda run -n ivf python -m experiments.run_experiment --ticker ${ticker} --max-ticks ${maxTicks}`
    ];

    const proc = spawn(command, args, {
      cwd: projectRoot,
      env: { ...process.env, PAGER: "cat" }
    });

    this.trainers[ticker] = {
      status: "running",
      process: proc
    };

    // Pipe stdout/stderr to log file
    proc.stdout?.on("data", (data) => {
      fs.appendFileSync(logPath, data.toString(), "utf-8");
    });

    proc.stderr?.on("data", (data) => {
      fs.appendFileSync(logPath, data.toString(), "utf-8");
    });

    proc.on("close", (code) => {
      this.trainers[ticker].status = code === 0 ? "completed" : "failed";
      this.trainers[ticker].process = null;
      fs.appendFileSync(logPath, `\n--- TIẾN TRÌNH KẾT THÚC VỚI MÃ: ${code} ---\n`, "utf-8");
    });

    proc.on("error", (err) => {
      this.trainers[ticker].status = "failed";
      this.trainers[ticker].process = null;
      fs.appendFileSync(logPath, `\n--- LỖI HỆ THỐNG: ${err.message} ---\n`, "utf-8");
    });

    return "Đã khởi chạy huấn luyện gia tăng thành công.";
  }

  public static getStatus(ticker: string) {
    const state = this.trainers[ticker] || { status: "idle", process: null };
    const logPath = this.getLogPath(ticker);
    let logs = "";

    // Double check status of process
    if (state.status === "running" && state.process) {
      if (state.process.exitCode !== null) {
        state.status = state.process.exitCode === 0 ? "completed" : "failed";
        state.process = null;
      }
    }

    if (fs.existsSync(logPath)) {
      try {
        const fileContent = fs.readFileSync(logPath, "utf-8");
        // Get last 100 lines to send to frontend
        const lines = fileContent.split("\n");
        logs = lines.slice(-100).join("\n");
      } catch (err: any) {
        logs = `Lỗi đọc log file: ${err.message}`;
      }
    }

    return {
      ticker,
      status: state.status,
      logs
    };
  }
}
