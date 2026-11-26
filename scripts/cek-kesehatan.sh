#!/usr/bin/env bash
set -u

set -a; . "$HOME/.urusyn-alarm.env"; set +a

URL_HEALTH="${URL_HEALTH:-http://127.0.0.1:3100/health}"
BATAS_DISK="${BATAS_DISK:-80}"
BATAS_RAM_MB="${BATAS_RAM_MB:-200}"
STATUS_FILE="/tmp/cek-kesehatan.status"

kirim() {
  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d chat_id="$TELEGRAM_CHAT_ID" --data-urlencode text="$1" > /dev/null
}

masalah=""

# 1. App hidup?
if ! curl -fsS --max-time 5 "$URL_HEALTH" > /dev/null 2>&1; then
  masalah+="App mati atau tidak merespons (/health)"$'\n'
fi

# 2. Disk
disk=$(df / | awk 'NR==2 {gsub("%","",$5); print $5}')
if [ "$disk" -gt "$BATAS_DISK" ]; then
  masalah+="Disk ${disk}% (batas ${BATAS_DISK}%)"$'\n'
fi

# 3. RAM (kolom available, bukan used)
ram=$(free -m | awk '/^Mem:/ {print $7}')
if [ "$ram" -lt "$BATAS_RAM_MB" ]; then
  masalah+="RAM tersedia ${ram} MB (batas ${BATAS_RAM_MB} MB)"$'\n'
fi

# 4. Anti-spam: kirim hanya saat status berubah
lama=$(cat "$STATUS_FILE" 2>/dev/null || true)

if [ -n "$masalah" ]; then
  if [ "$masalah" != "$lama" ]; then
    kirim "ALARM urusyn-absen"$'\n'"$masalah"
  fi
  printf '%s' "$masalah" > "$STATUS_FILE"
else
  if [ -n "$lama" ]; then
    kirim "PULIH: urusyn-absen kembali normal"
  fi
  : > "$STATUS_FILE"
fi
