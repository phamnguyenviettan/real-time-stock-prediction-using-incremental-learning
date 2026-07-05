import { execSync } from "child_process";
import path from "path";

export interface ModelConfig {
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

// Fallback configuration if Python environment is unavailable
const DEFAULT_CONFIG: ModelConfig = {
  initial_epochs: 200,
  batch_size: 64,
  lr: 0.001,
  incremental_epochs: 5,
  incremental_lr: 0.0001,
  ewc_lambda: 0.4,
  replay_alpha: 0.2,
  replay_ratio: 0.1,
  lookback_window: 78,
  forecast_horizon: 26,
  device: "cpu",
  hidden_size: 128,
  num_layers: 2,
  dropout: 0.2
};

export function getProjectConfig(): ModelConfig {
  try {
    const projectRoot = path.resolve(process.cwd(), "..");
    
    // Command to execute in WSL to fetch configurations from src/config.py
    const pythonCmd = `
import json
import src.config as c
data = {
  "initial_epochs": getattr(c, "INITIAL_EPOCHS", 200),
  "batch_size": getattr(c, "BATCH_SIZE", 64),
  "lr": getattr(c, "LR", 0.001),
  "incremental_epochs": getattr(c, "INCREMENTAL_EPOCHS", 5),
  "incremental_lr": getattr(c, "INCREMENTAL_LR", 0.0001),
  "ewc_lambda": getattr(c, "EWC_LAMBDA", 0.4),
  "replay_alpha": getattr(c, "REPLAY_ALPHA", 0.2),
  "replay_ratio": getattr(c, "REPLAY_RATIO", 0.1),
  "lookback_window": getattr(c, "LOOKBACK_WINDOW", 78),
  "forecast_horizon": getattr(c, "FORECAST_HORIZON", 26),
  "device": str(getattr(c, "DEVICE", "cpu")),
  "hidden_size": getattr(c, "HIDDEN_SIZE", 128),
  "num_layers": getattr(c, "NUM_LAYERS", 2),
  "dropout": getattr(c, "DROPOUT", 0.2)
}
print(json.dumps(data))
`.trim().replace(/\n/g, "; ");

    const cmd = `wsl zsh -i -c "conda run -n ivf python -c '${pythonCmd}'"`;
    
    const output = execSync(cmd, { 
      cwd: projectRoot,
      encoding: "utf-8",
      timeout: 8000 // 8 seconds timeout
    });
    
    // Find JSON line in the output (cleaning any warnings)
    const lines = output.trim().split("\n");
    const jsonLine = lines.find((line) => line.trim().startsWith("{") && line.trim().endsWith("}"));
    
    if (jsonLine) {
      return JSON.parse(jsonLine);
    }
    
    throw new Error("Could not parse JSON config output");
  } catch (error) {
    console.warn("Using default config fallback. Python execution failed:", error);
    return DEFAULT_CONFIG;
  }
}
