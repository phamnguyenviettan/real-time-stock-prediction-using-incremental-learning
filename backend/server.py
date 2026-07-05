import os
import sys
import json
import time
import socket
import subprocess
import threading
from flask import Flask, jsonify, request, Response
from flask_cors import CORS

# Add current folder to path
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, PROJECT_ROOT)

app = Flask(__name__)
CORS(app)

DATA_DIR = os.path.join(PROJECT_ROOT, "dataset")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "output_results")
LOG_DIR = os.path.join(OUTPUT_DIR, "logs")
os.makedirs(LOG_DIR, exist_ok=True)

TICKERS = ["AAPL", "AMZN", "BRK-B", "GOOGL", "META", "MSFT", "NVDA", "TSLA"]

# In-memory datasets cache
data_cache = {}

# Active training threads reference
active_trainers = {}
trainers_lock = threading.Lock()


def get_kafka_bootstrap() -> str:
    """Đọc địa chỉ Kafka bootstrap từ biến môi trường.
    Ưu tiên: KAFKA_BOOTSTRAP_SERVERS (có thể set theos cơ chế WSL/Docker)
    Mặc định: localhost:9092
    """
    return os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")


def load_ticker_data(ticker):
    """Load and cache ticker dataframe."""
    if ticker not in TICKERS:
        raise ValueError(f"Ticker {ticker} not supported.")
    
    if ticker not in data_cache:
        import pandas as pd
        file_path = os.path.join(DATA_DIR, ticker, f"{ticker}_2022_full_15min.csv")
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")
        
        df = pd.read_csv(file_path)
        if "Datetime" not in df.columns:
            if df.index.name == "Datetime":
                df = df.reset_index()
            else:
                df.rename(columns={df.columns[0]: "Datetime"}, inplace=True)
                
        df["Datetime"] = pd.to_datetime(df["Datetime"])
        df = df.sort_values("Datetime").reset_index(drop=True)
        data_cache[ticker] = df
        
    return data_cache[ticker]

@app.route("/api/tickers", methods=["GET"])
def get_tickers():
    return jsonify(TICKERS)

@app.route("/api/tickers/<ticker>/stats", methods=["GET"])
def get_stats(ticker):
    try:
        df = load_ticker_data(ticker)
        close_stats = df["Close"].describe()
        volume_stats = df["Volume"].describe()
        
        return jsonify({
            "ticker": ticker,
            "total_rows": len(df),
            "start_date": df["Datetime"].min().strftime("%Y-%m-%d %H:%M:%S"),
            "end_date": df["Datetime"].max().strftime("%Y-%m-%d %H:%M:%S"),
            "close": {
                "mean": round(close_stats.get("mean", 0), 2),
                "min": round(close_stats.get("min", 0), 2),
                "max": round(close_stats.get("max", 0), 2),
                "std": round(close_stats.get("std", 0), 2),
            },
            "volume": {
                "mean": round(volume_stats.get("mean", 0), 2),
                "min": int(volume_stats.get("min", 0)),
                "max": int(volume_stats.get("max", 0)),
                "std": round(volume_stats.get("std", 0), 2),
            }
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/tickers/<ticker>/data", methods=["GET"])
def get_data(ticker):
    try:
        df = load_ticker_data(ticker)
        
        page = int(request.args.get("page", 1))
        page_size = int(request.args.get("page_size", 20))
        month = request.args.get("month")
        
        if month:
            filtered_df = df[df["Datetime"].dt.strftime("%m") == month]
        else:
            filtered_df = df
            
        total_records = len(filtered_df)
        total_pages = max(1, (total_records + page_size - 1) // page_size)
        
        page = max(1, min(page, total_pages))
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        
        sliced_df = filtered_df.iloc[start_idx:end_idx].copy()
        sliced_df["Datetime"] = sliced_df["Datetime"].dt.strftime("%Y-%m-%d %H:%M:%S")
        records = sliced_df.to_dict(orient="records")
        
        return jsonify({
            "ticker": ticker,
            "total": total_records,
            "page": page,
            "page_size": page_size,
            "pages": total_pages,
            "data": records
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/tickers/<ticker>/chart", methods=["GET"])
def get_chart_data(ticker):
    try:
        df = load_ticker_data(ticker)
        month = request.args.get("month")
        
        if month:
            filtered_df = df[df["Datetime"].dt.strftime("%m") == month].copy()
            filtered_df["Datetime"] = filtered_df["Datetime"].dt.strftime("%Y-%m-%d %H:%M:%S")
            return jsonify(filtered_df[["Datetime", "Open", "High", "Low", "Close", "Volume"]].to_dict(orient="records"))
        else:
            # Resample daily Close
            df_copy = df.copy().set_index("Datetime")
            daily = df_copy.resample("D").agg({
                "Open": "first",
                "High": "max",
                "Low": "min",
                "Close": "last",
                "Volume": "sum"
            }).dropna().reset_index()
            daily["Datetime"] = daily["Datetime"].dt.strftime("%Y-%m-%d")
            return jsonify(daily[["Datetime", "Open", "High", "Low", "Close", "Volume"]].to_dict(orient="records"))
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/config", methods=["GET"])
def get_config():
    try:
        import src.config as src_config
        return jsonify({
            "initial_epochs": src_config.INITIAL_EPOCHS,
            "batch_size": src_config.BATCH_SIZE,
            "lr": src_config.LR,
            "incremental_epochs": src_config.INCREMENTAL_EPOCHS,
            "incremental_lr": src_config.INCREMENTAL_LR,
            "ewc_lambda": src_config.EWC_LAMBDA,
            "replay_alpha": src_config.REPLAY_ALPHA,
            "replay_ratio": src_config.REPLAY_RATIO,
            "lookback_window": src_config.LOOKBACK_WINDOW,
            "forecast_horizon": src_config.FORECAST_HORIZON,
            "device": str(src_config.DEVICE),
            "hidden_size": src_config.HIDDEN_SIZE,
            "num_layers": src_config.NUM_LAYERS,
            "dropout": src_config.DROPOUT
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def run_python_subprocess(ticker, script_name, max_ticks, log_file_path, delay=1.0):
    """Trigger background python subprocess."""
    cmd = [
        sys.executable, "-u", script_name, 
        "--ticker", ticker, 
        "--max-ticks", str(max_ticks), 
        "--delay", str(delay)
    ]
    
    with open(log_file_path, "w") as log_file:
        log_file.write(f"--- BẮT ĐẦU CHẠY {script_name.upper()} CHO {ticker} ---\n\n")
        log_file.flush()
        
        try:
            process = subprocess.Popen(
                cmd,
                cwd=PROJECT_ROOT,
                stdout=log_file,
                stderr=subprocess.STDOUT,
                text=True
            )
            
            with trainers_lock:
                active_trainers[ticker] = {
                    "process": process,
                    "status": "running",
                    "script": script_name
                }
            
            exit_code = process.wait()
            
            with trainers_lock:
                active_trainers[ticker]["status"] = "completed" if exit_code == 0 else "failed"
        except Exception as e:
            with open(log_file_path, "a") as lf:
                lf.write(f"\nLỗi hệ thống: {str(e)}\n")
            with trainers_lock:
                active_trainers[ticker] = {"status": "failed"}

@app.route("/api/train", methods=["GET"])
def get_train_status():
    ticker = request.args.get("ticker", "AAPL")
    action = request.args.get("action", "status")
    
    if action == "demo-progress":
        # Read progress JSON
        progress_path = os.path.join(OUTPUT_DIR, f"{ticker}_demo_progress.json")
        if os.path.exists(progress_path):
            with open(progress_path, "r") as f:
                return jsonify(json.load(f))
        return jsonify({"ticker": ticker, "status": "idle", "data": []})
        
    # Default action: check status of background process
    state = active_trainers.get(ticker, {"status": "idle"})
    status = state["status"]
    
    log_path = os.path.join(LOG_DIR, f"{ticker}_train.log")
    logs = ""
    
    if os.path.exists(log_path):
        try:
            with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
                lines = f.readlines()
                logs = "".join(lines[-100:])
        except Exception as e:
            logs = f"Lỗi đọc log: {str(e)}"
            
    return jsonify({
        "ticker": ticker,
        "status": status,
        "logs": logs
    })

@app.route("/api/train", methods=["POST"])
def start_train():
    ticker = request.args.get("ticker", "AAPL")
    action = request.args.get("action", "start")
    max_ticks = int(request.args.get("max_ticks", 100))
    delay = float(request.args.get("delay", 1.0))

    if ticker not in TICKERS:
        return jsonify({"error": f"Ticker {ticker} not supported"}), 400

    state = active_trainers.get(ticker, {"status": "idle"})
    if state["status"] == "running":
        return jsonify({"status": "running", "message": "Tiến trình đang chạy."})

    log_path = os.path.join(LOG_DIR, f"{ticker}_train.log")

    # action="start"  → full experiment (offline + incremental)
    # action="demo" or "run-demo" → Kafka incremental producer (stream mode)
    if action in ("demo", "run-demo"):
        script = "scripts/incremental_kafka_producer.py"
    else:
        script = "scripts/run_experiment.py"

    # Start thread
    thread = threading.Thread(
        target=run_python_subprocess,
        args=(ticker, script, max_ticks, log_path, delay)
    )
    thread.daemon = True
    thread.start()

    active_trainers[ticker] = {
        "status": "running",
        "script": script
    }

    return jsonify({
        "status": "started",
        "message": f"Khởi chạy thành công tiến trình {script} cho {ticker}."
    })


@app.route("/api/train/stream", methods=["GET"])
def stream_kafka_messages():
    """Stream consumed messages from Kafka topic via Server-Sent Events.
    
    Listens to 'spark-processed-predictions' first (Spark output).
    Falls back to 'stock-predictions' (raw producer output) if Spark is not running.
    """
    topic = request.args.get("topic", "spark-processed-predictions")

    def event_stream():
        from kafka import KafkaConsumer, TopicPartition
        from kafka.errors import NoBrokersAvailable, KafkaError
        bootstrap = get_kafka_bootstrap()

        # ── CRITICAL: yield a comment/ping IMMEDIATELY before any blocking call ──
        # This forces Flask to send HTTP 200 + headers right away,
        # preventing ERR_EMPTY_RESPONSE if Kafka connection takes time or fails.
        yield ": ping\n\n"

        print(f"[Kafka SSE] Đang kết nối tới {bootstrap}, topic={topic}...")

        consumer = None
        try:
            consumer = KafkaConsumer(
                topic,
                bootstrap_servers=[bootstrap],
                auto_offset_reset="latest",
                enable_auto_commit=True,
                value_deserializer=lambda m: json.loads(m.decode("utf-8")),
                consumer_timeout_ms=120000,  # 2 phút timeout nếu không có message
                request_timeout_ms=10000,
                session_timeout_ms=10000,
            )
            print(f"[Kafka SSE] Kết nối thành công đến topic '{topic}' tại {bootstrap}.")
            yield f"data: {json.dumps({'type': 'connected', 'topic': topic, 'broker': bootstrap})}\n\n"

            # Keep-alive counter: send ping every ~30 iterations if no message
            idle_count = 0
            for message in consumer:
                idle_count = 0
                yield f"data: {json.dumps(message.value)}\n\n"

        except NoBrokersAvailable:
            err = f"Kafka broker không khả dụng tại {bootstrap}. Hãy chắc chắn Docker đang chạy."
            print(f"[Kafka SSE] Lỗi: {err}")
            yield f"data: {json.dumps({'error': err, 'type': 'broker_unavailable'})}\n\n"

        except Exception as e:
            err = str(e)
            print(f"[Kafka SSE] Lỗi: {err}")
            yield f"data: {json.dumps({'error': err, 'type': 'error'})}\n\n"

        finally:
            if consumer is not None:
                try:
                    consumer.close()
                except Exception:
                    pass
            print(f"[Kafka SSE] Kết nối đã đóng.")

    # Proper SSE response with required headers
    response = Response(
        event_stream(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",        # Disable nginx buffering
            "Access-Control-Allow-Origin": "*", # CORS for cross-origin SSE (Next.js -> Flask)
            "Connection": "keep-alive",
        }
    )
    return response


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)

