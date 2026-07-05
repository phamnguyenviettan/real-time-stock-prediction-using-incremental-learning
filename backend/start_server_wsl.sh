#!/usr/bin/env bash
# ============================================================
# start_server_wsl.sh
# Chạy Flask server trong WSL với Kafka chạy trên Windows host
# via Docker Desktop.
#
# Cách dùng (trong WSL terminal):
#   conda activate ivf
#   cd /mnt/c/Users/PhamTan/Desktop/SDH/.../backend
#   bash start_server_wsl.sh
# ============================================================

set -e

# ── 1. Phát hiện IP của Windows host từ WSL ─────────────────
WINDOWS_HOST_IP=$(cat /etc/resolv.conf 2>/dev/null | grep nameserver | awk '{print $2}' | head -1)

# Nếu /etc/resolv.conf không có, thử cách khác
if [ -z "$WINDOWS_HOST_IP" ]; then
    WINDOWS_HOST_IP=$(ip route show 2>/dev/null | grep default | awk '{print $3}' | head -1)
fi

# Fallback về localhost nếu vẫn không tìm được
if [ -z "$WINDOWS_HOST_IP" ]; then
    WINDOWS_HOST_IP="localhost"
fi

echo "=============================================="
echo " [WSL] Windows Host IP: $WINDOWS_HOST_IP"
echo " [WSL] Kafka Bootstrap: $WINDOWS_HOST_IP:9092"
echo "=============================================="

# ── 2. Thêm host.docker.internal vào /etc/hosts nếu chưa có ─
# Kafka advertise địa chỉ "host.docker.internal:9092"
# WSL cần resolve hostname này thành Windows host IP
if ! grep -q "host.docker.internal" /etc/hosts 2>/dev/null; then
    echo "[WSL] Thêm host.docker.internal=$WINDOWS_HOST_IP vào /etc/hosts..."
    echo "$WINDOWS_HOST_IP host.docker.internal" | sudo tee -a /etc/hosts > /dev/null
    echo "[WSL] ✓ Đã thêm host.docker.internal vào /etc/hosts"
else
    # Cập nhật IP nếu đã tồn tại nhưng IP khác
    CURRENT_IP=$(grep "host.docker.internal" /etc/hosts | awk '{print $1}' | head -1)
    if [ "$CURRENT_IP" != "$WINDOWS_HOST_IP" ]; then
        echo "[WSL] Cập nhật host.docker.internal: $CURRENT_IP -> $WINDOWS_HOST_IP"
        sudo sed -i "s/.*host\.docker\.internal/$WINDOWS_HOST_IP host.docker.internal/" /etc/hosts
    fi
    echo "[WSL] ✓ host.docker.internal=$WINDOWS_HOST_IP (đã có trong /etc/hosts)"
fi

# ── 3. Kiểm tra Kafka có đang chạy không ────────────────────
echo ""
echo "[WSL] Kiểm tra kết nối Kafka tại $WINDOWS_HOST_IP:9092 ..."
if nc -zw3 "$WINDOWS_HOST_IP" 9092 2>/dev/null; then
    echo "[WSL] ✓ Kafka đang hoạt động tại $WINDOWS_HOST_IP:9092"
else
    echo "[WSL] ✗ CẢNH BÁO: Không thể kết nối đến Kafka tại $WINDOWS_HOST_IP:9092"
    echo "[WSL]   Hãy chắc chắn Docker Desktop đang chạy và Kafka container đang up:"
    echo "[WSL]   (Trên Windows PowerShell) cd backend && docker compose up -d"
    echo ""
    echo "[WSL] Tiếp tục khởi động server (có thể lỗi khi dùng tính năng Kafka)..."
fi

# ── 4. Export biến môi trường ────────────────────────────────
# Server dùng host.docker.internal vì đó là địa chỉ Kafka advertise
export KAFKA_BOOTSTRAP_SERVERS="host.docker.internal:9092"
export FLASK_ENV=development

echo ""
echo "[WSL] Khởi động Flask server với:"
echo "      KAFKA_BOOTSTRAP_SERVERS=$KAFKA_BOOTSTRAP_SERVERS"
echo ""

# ── 5. Chạy Flask server ─────────────────────────────────────
python server.py

