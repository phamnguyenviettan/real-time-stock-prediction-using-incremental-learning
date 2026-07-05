import os
import sys
import json
import time
import argparse
import numpy as np
import pandas as pd
import torch
from torch.utils.data import TensorDataset, DataLoader

# Add project root to path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

from src.config import (
    LOOKBACK_WINDOW, FORECAST_HORIZON, OUTPUT_DIR, DEVICE, BATCH_SIZE,
    INITIAL_TRAIN_MONTHS, INITIAL_TRAIN_YEAR, VALIDATION_MONTH, PHASE2_MONTHS, PHASE2_YEAR,
    TICK_EPOCHS, EWC_REFRESH_EVERY
)
from src.data.loader import load_monthly_featured, load_months_featured
from src.data.features import create_sequences, normalize_data, scale_with_scaler
from src.models.lstm_model import StockLSTM
from src.models.trainer import IncrementalTrainer, BatchTrainer
from src.incremental.incremental_learner import EWC, ReplayBuffer

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ticker", type=str, default="AAPL")
    parser.add_argument("--max-ticks", type=int, default=100)
    parser.add_argument("--delay", type=float, default=0.4) # delay in seconds to simulate real-time
    args = parser.parse_args()

    ticker = args.ticker
    max_ticks = args.max_ticks
    delay = args.delay

    progress_file = os.path.join(OUTPUT_DIR, f"{ticker}_demo_progress.json")
    
    # Initialize progress file with empty state
    with open(progress_file, "w") as f:
        json.dump({"ticker": ticker, "status": "initializing", "data": []}, f)

    try:
        # ── 1. Load data ───────────────────
        train_feat = load_months_featured(ticker, INITIAL_TRAIN_MONTHS, year=INITIAL_TRAIN_YEAR)
        val_feat = load_monthly_featured(ticker, VALIDATION_MONTH, year=INITIAL_TRAIN_YEAR)
        
        # Normalize
        train_scaled, val_scaled, scaler = normalize_data(train_feat, val_feat)
        
        # Sequences
        X_train, y_train, ref_train = create_sequences(train_scaled, LOOKBACK_WINDOW, FORECAST_HORIZON)
        X_val, y_val, ref_val = create_sequences(val_scaled, LOOKBACK_WINDOW, FORECAST_HORIZON)
        
        import joblib
        from sklearn.preprocessing import StandardScaler
        
        y_scaler = StandardScaler()
        y_train_s = y_scaler.fit_transform(y_train.reshape(-1, 1)).ravel().astype(np.float32)
        y_val_s = y_scaler.transform(y_val.reshape(-1, 1)).ravel().astype(np.float32)

        # ── 2. Instantiate base model or load if exists ──────────────────
        n_features = train_feat.shape[1]
        model = StockLSTM(n_features=n_features)
        
        model_path = os.path.join(OUTPUT_DIR, f"{ticker}_incremental_model.pt")
        if os.path.exists(model_path):
            model.load_state_dict(torch.load(model_path, map_location=DEVICE))
            model.to(DEVICE)
        else:
            # Quick base batch train (limited epochs for demo speed)
            batch_trainer = BatchTrainer(model)
            # Run only 5 epochs to quickly seed the model if not trained yet
            batch_trainer.fit(X_train, y_train_s, X_val, y_val_s, epochs=5)
            # Save base model
            torch.save(model.state_dict(), model_path)
            joblib.dump(scaler, os.path.join(OUTPUT_DIR, f"{ticker}_feature_scaler.pkl"))
            joblib.dump(y_scaler, os.path.join(OUTPUT_DIR, f"{ticker}_y_scaler.pkl"))

        # Setup EWC & Replay
        ewc = EWC()
        train_ds = TensorDataset(
            torch.tensor(X_train, device=DEVICE),
            torch.tensor(y_train_s, device=DEVICE),
        )
        ewc.compute_fisher(model, DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=False))
        replay_buffer = ReplayBuffer.from_initial_data(X_train, y_train_s)
        
        inc_trainer = IncrementalTrainer(model, ewc, replay_buffer)

        # Load Phase 2 test stream
        phase2_feat = load_months_featured(ticker, PHASE2_MONTHS, year=PHASE2_YEAR)
        phase2_scaled = scale_with_scaler(scaler, phase2_feat)
        X_ticks, y_ticks, ref_ticks = create_sequences(phase2_scaled, LOOKBACK_WINDOW, FORECAST_HORIZON)
        raw_close = phase2_feat["Close"].values
        timestamps = phase2_feat.index

        n = min(len(X_ticks), max_ticks)

        # Status: running
        progress_data = []
        with open(progress_file, "w") as f:
            json.dump({"ticker": ticker, "status": "running", "data": progress_data}, f)

        # ── 3. Real-time Retraining Loop ──────────────────
        for i in range(n):
            x_i = X_ticks[i : i + 1]
            y_i = y_ticks[i : i + 1] # scaled diff

            ref_idx = LOOKBACK_WINDOW + i - 1
            ref_close_unscaled = float(raw_close[ref_idx])

            # Predict before training (prequential testing)
            model.eval()
            with torch.no_grad():
                x_tensor = torch.tensor(x_i, device=DEVICE).float()
                raw_pred_diff = model(x_tensor).cpu().numpy().ravel()[0]
            
            pred_diff = float(y_scaler.inverse_transform([[raw_pred_diff]])[0, 0])
            pred_price = ref_close_unscaled + pred_diff

            # Actual price at target
            target_idx = LOOKBACK_WINDOW + i + FORECAST_HORIZON - 1
            actual_price = float(raw_close[target_idx])
            actual_diff = actual_price - ref_close_unscaled

            # Train on this tick (1 epoch)
            y_train_tick = y_scaler.transform(y_i.reshape(-1, 1)).ravel().astype(np.float32)
            refresh = (i % EWC_REFRESH_EVERY == 0)
            
            # Run update and capture loss
            loss = inc_trainer.update(
                x_i.astype(np.float32), y_train_tick,
                epochs=TICK_EPOCHS, refresh_ewc=refresh, update_replay=True
            )

            # Context closing prices (last 5 Close values for visualization)
            context_idx_start = max(0, ref_idx - 4)
            context_prices = [float(p) for p in raw_close[context_idx_start:ref_idx+1]]
            context_times = [str(t) for t in timestamps[context_idx_start:ref_idx+1]]

            # Append point
            progress_data.append({
                "tick": i + 1,
                "datetime": str(timestamps[ref_idx]),
                "ref_price": ref_close_unscaled,
                "actual_price": round(actual_price, 4),
                "predicted_price": round(pred_price, 4),
                "actual_diff": round(actual_diff, 4),
                "predicted_diff": round(pred_diff, 4),
                "loss": float(loss["train_loss"][-1]),
                "context_prices": context_prices,
                "context_times": context_times
            })

            # Save state to file
            with open(progress_file, "w") as f:
                json.dump({
                    "ticker": ticker, 
                    "status": "running", 
                    "current_tick": i + 1,
                    "total_ticks": n,
                    "data": progress_data
                }, f)

            # Delay to allow front-end to read smoothly
            time.sleep(delay)

        # Mark completed
        with open(progress_file, "w") as f:
            json.dump({
                "ticker": ticker, 
                "status": "completed", 
                "current_tick": n,
                "total_ticks": n,
                "data": progress_data
            }, f)

    except Exception as e:
        import traceback
        err_msg = f"{str(e)}\n{traceback.format_exc()}"
        with open(progress_file, "w") as f:
            json.dump({"ticker": ticker, "status": "failed", "error": err_msg, "data": []}, f)

if __name__ == "__main__":
    main()
