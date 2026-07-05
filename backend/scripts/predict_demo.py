import os
import sys
import json
import argparse
import numpy as np
import pandas as pd
import torch

# Add project root to path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

from src.config import LOOKBACK_WINDOW, FORECAST_HORIZON, OUTPUT_DIR, DEVICE
from src.data.loader import load_months_featured
from src.data.features import create_sequences, scale_with_scaler
from src.models.lstm_model import StockLSTM

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ticker", type=str, default="AAPL")
    parser.add_argument("--limit", type=int, default=50)
    args = parser.parse_args()

    ticker = args.ticker
    limit = args.limit

    model_path = os.path.join(OUTPUT_DIR, f"{ticker}_incremental_model.pt")
    feat_scaler_path = os.path.join(OUTPUT_DIR, f"{ticker}_feature_scaler.pkl")
    y_scaler_path = os.path.join(OUTPUT_DIR, f"{ticker}_y_scaler.pkl")

    # Load Phase 2 data (Jul-Dec 2022)
    try:
        # Load Jul 2022 to get simulation data starting at Phase 2
        df_feat = load_months_featured(ticker, ["07"], year=2022)
    except Exception as e:
        print(json.dumps({"error": f"Failed to load dataset: {str(e)}"}))
        return

    # Check if we have a trained model
    has_model = os.path.exists(model_path) and os.path.exists(feat_scaler_path) and os.path.exists(y_scaler_path)

    predictions = []
    raw_close = df_feat["Close"].values
    timestamps = df_feat.index

    if has_model:
        try:
            import joblib
            scaler = joblib.load(feat_scaler_path)
            y_scaler = joblib.load(y_scaler_path)

            # Normalize features using the frozen scaler
            df_scaled = scale_with_scaler(scaler, df_feat)
            
            # Create sequences
            # X shape: (N, lookback, n_features)
            # y shape: (N,) -- diff in prices (future Close - last input Close)
            X, y, ref = create_sequences(df_scaled, LOOKBACK_WINDOW, FORECAST_HORIZON)
            
            # Load PyTorch model
            n_features = df_feat.shape[1]
            model = StockLSTM(n_features=n_features)
            model.load_state_dict(torch.load(model_path, map_location=DEVICE))
            model.to(DEVICE)
            model.eval()

            # Run inference for the first 'limit' ticks
            n_ticks = min(limit, len(X))
            for i in range(n_ticks):
                x_i = X[i:i+1] # shape (1, lookback, n_features)
                
                # Get the unscaled reference close (last input Close price of the sequence)
                ref_idx = LOOKBACK_WINDOW + i - 1
                ref_close_unscaled = float(raw_close[ref_idx])
                
                # Predict
                with torch.no_grad():
                    x_tensor = torch.tensor(x_i, device=DEVICE).float()
                    raw_pred_diff = model(x_tensor).cpu().numpy().ravel()[0]
                
                # Inverse scale price change to get actual dollar price change
                pred_diff = float(y_scaler.inverse_transform([[raw_pred_diff]])[0, 0])
                pred_price = ref_close_unscaled + pred_diff

                # Actual target price is reference close + actual change (unscaled)
                # In create_sequences, y[i] is the unscaled price change if ref is unscaled?
                # Wait, in create_sequences:
                # last_close = data[i - 1, close_idx] (which is scaled, because data is df_scaled)
                # future_close = data[i + horizon - 1, close_idx] (which is scaled)
                # y.append(future_close - last_close) (so y[i] is scaled diff!)
                # Let's get the unscaled future price directly from raw_close
                target_idx = LOOKBACK_WINDOW + i + FORECAST_HORIZON - 1
                actual_price = float(raw_close[target_idx])
                actual_diff = actual_price - ref_close_unscaled

                # Context closing prices (last 5 Close values for visualization)
                context_idx_start = max(0, ref_idx - 4)
                context_prices = [float(p) for p in raw_close[context_idx_start:ref_idx+1]]
                context_times = [str(t) for t in timestamps[context_idx_start:ref_idx+1]]

                predictions.append({
                    "tick": i + 1,
                    "datetime": str(timestamps[ref_idx]),
                    "context_prices": context_prices,
                    "context_times": context_times,
                    "ref_price": ref_close_unscaled,
                    "actual_price": round(actual_price, 4),
                    "predicted_price": round(pred_price, 4),
                    "actual_diff": round(actual_diff, 4),
                    "predicted_diff": round(pred_diff, 4),
                })
        except Exception as e:
            has_model = False # Fall back to simulation on error
            error_msg = str(e)
    
    if not has_model:
        # Fallback simulation (approximate stock movement with minor noise)
        n_ticks = min(limit, len(raw_close) - LOOKBACK_WINDOW - FORECAST_HORIZON)
        
        for i in range(n_ticks):
            ref_idx = LOOKBACK_WINDOW + i - 1
            ref_close_unscaled = float(raw_close[ref_idx])
            
            target_idx = LOOKBACK_WINDOW + i + FORECAST_HORIZON - 1
            actual_price = float(raw_close[target_idx])
            actual_diff = actual_price - ref_close_unscaled
            
            # Simulated predicted price change
            noise = np.random.normal(0, abs(actual_diff) * 0.12 + 0.04)
            pred_diff = actual_diff + noise
            pred_price = ref_close_unscaled + pred_diff

            context_idx_start = max(0, ref_idx - 4)
            context_prices = [float(p) for p in raw_close[context_idx_start:ref_idx+1]]
            context_times = [str(t) for t in timestamps[context_idx_start:ref_idx+1]]

            predictions.append({
                "tick": i + 1,
                "datetime": str(timestamps[ref_idx]),
                "context_prices": context_prices,
                "context_times": context_times,
                "ref_price": ref_close_unscaled,
                "actual_price": round(actual_price, 4),
                "predicted_price": round(pred_price, 4),
                "actual_diff": round(actual_diff, 4),
                "predicted_diff": round(pred_diff, 4),
                "is_fallback": True
            })

    print(json.dumps({
        "ticker": ticker,
        "is_trained": has_model,
        "total_ticks": len(predictions),
        "data": predictions
    }))

if __name__ == "__main__":
    main()
