import os
import sys
import json
import time
import argparse
import numpy as np
import pandas as pd
import torch
from torch.utils.data import TensorDataset, DataLoader
from kafka import KafkaProducer

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
    parser.add_argument("--delay", type=float, default=1.0) # delay in seconds per message
    parser.add_argument("--kafka-bootstrap", type=str, default="127.0.0.1:9092")
    args = parser.parse_args()

    ticker = args.ticker
    max_ticks = args.max_ticks
    delay = args.delay
    kafka_server = args.kafka_bootstrap

    print(f"[Kafka Producer] Khởi động gửi tin nhắn cho {ticker} đến {kafka_server}")
    print(f"[Kafka Producer] Tốc độ gửi: {delay}s / 1 tin nhắn")

    # Connect to Kafka
    producer = None
    try:
        producer = KafkaProducer(
            bootstrap_servers=[kafka_server],
            value_serializer=lambda v: json.dumps(v).encode("utf-8")
        )
        print("[Kafka Producer] Kết nối thành công đến Kafka broker!")
    except Exception as e:
        print(f"[Kafka Producer] Lỗi kết nối Kafka: {str(e)}")
        print("[Kafka Producer] Sẽ giả lập ghi ra tệp mà không bắn Kafka.")

    try:
        # Load data
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

        # Instantiate base model
        n_features = train_feat.shape[1]
        model = StockLSTM(n_features=n_features)
        
        model_path = os.path.join(OUTPUT_DIR, f"{ticker}_incremental_model.pt")
        if os.path.exists(model_path):
            model.load_state_dict(torch.load(model_path, map_location=DEVICE))
            model.to(DEVICE)
        else:
            # Quick training if checkpoint not available
            batch_trainer = BatchTrainer(model)
            batch_trainer.fit(X_train, y_train_s, X_val, y_val_s, epochs=5)
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

        for i in range(n):
            x_i = X_ticks[i : i + 1]
            y_i = y_ticks[i : i + 1]

            ref_idx = LOOKBACK_WINDOW + i - 1
            ref_close_unscaled = float(raw_close[ref_idx])

            # Predict before training
            model.eval()
            with torch.no_grad():
                x_tensor = torch.tensor(x_i, device=DEVICE).float()
                raw_pred_diff = model(x_tensor).cpu().numpy().ravel()[0]
            
            pred_diff = float(y_scaler.inverse_transform([[raw_pred_diff]])[0, 0])
            pred_price = ref_close_unscaled + pred_diff

            target_idx = LOOKBACK_WINDOW + i + FORECAST_HORIZON - 1
            actual_price = float(raw_close[target_idx])
            actual_diff = actual_price - ref_close_unscaled

            # Train on this tick
            y_train_tick = y_scaler.transform(y_i.reshape(-1, 1)).ravel().astype(np.float32)
            refresh = (i % EWC_REFRESH_EVERY == 0)
            
            loss = inc_trainer.update(
                x_i.astype(np.float32), y_train_tick,
                epochs=TICK_EPOCHS, refresh_ewc=refresh, update_replay=True
            )

            context_idx_start = max(0, ref_idx - 4)
            context_prices = [float(p) for p in raw_close[context_idx_start:ref_idx+1]]
            context_times = [str(t) for t in timestamps[context_idx_start:ref_idx+1]]

            # Message payload
            message = {
                "tick": i + 1,
                "datetime": str(timestamps[ref_idx]),
                "ticker": ticker,
                "ref_price": ref_close_unscaled,
                "actual_price": round(actual_price, 4),
                "predicted_price": round(pred_price, 4),
                "actual_diff": round(actual_diff, 4),
                "predicted_diff": round(pred_diff, 4),
                "loss": float(loss["train_loss"][-1]),
                "context_prices": context_prices,
                "context_times": context_times,
                "status": "running",
                "total_ticks": n
            }

            # Publish to Kafka
            if producer is not None:
                try:
                    producer.send("stock-predictions", message)
                    producer.flush()
                    print(f"[Kafka Producer] Bắn message tick {i+1}: Price={actual_price}, Pred={pred_price}")
                except Exception as ex:
                    print(f"[Kafka Producer] Gửi tin nhắn thất bại: {str(ex)}")

            # Also fallback log to json file for backup compatibility
            progress_file = os.path.join(OUTPUT_DIR, f"{ticker}_demo_progress.json")
            try:
                # Read old progress or start fresh
                data_list = []
                if i > 0 and os.path.exists(progress_file):
                    with open(progress_file, "r") as pf:
                        old_progress = json.load(pf)
                        data_list = old_progress.get("data", [])
                
                data_list.append(message)
                with open(progress_file, "w") as pf:
                    json.dump({
                        "ticker": ticker,
                        "status": "running",
                        "current_tick": i + 1,
                        "total_ticks": n,
                        "data": data_list
                    }, pf)
            except Exception as e:
                print(f"[Kafka Producer] Lỗi ghi file progress backup: {str(e)}")

            time.sleep(delay)

        # Mark completed in Kafka
        final_message = {
            "status": "completed",
            "ticker": ticker,
            "total_ticks": n
        }
        if producer is not None:
            producer.send("stock-predictions", final_message)
            producer.flush()
            print("[Kafka Producer] Tiến trình mô phỏng học gia tăng KẾT THÚC.")

    except Exception as e:
        import traceback
        err_msg = f"{str(e)}\n{traceback.format_exc()}"
        print(f"[Kafka Producer] Lỗi: {err_msg}")
        if producer is not None:
            producer.send("stock-predictions", {"status": "failed", "ticker": ticker, "error": err_msg})

if __name__ == "__main__":
    main()
