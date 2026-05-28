#!/bin/bash

echo "=========================================="
echo "    🚀 INJECTING FLAT SCHEME CONFIG       "
echo "=========================================="

# 1. Pastikan folder profil OpenClaw siap
mkdir -p $HOME/.openclaw
mkdir -p $HOME/.openclaw/workspace-dev
mkdir -p $HOME/.openclaw/agents/main/sessions

# 2. Tulis langsung file openclaw.json dengan format STRUKTUR DATAR (Lolos Uji Doctor)
cat << EOF > $HOME/.openclaw/openclaw.json
{
  "gateway": {
    "mode": "local",
    "bind": "loopback"
  },
  "model": "google/gemini-2.5-flash-lite",
  "thinking": "medium",
  "telegram": {
    "enabled": true,
    "token": "$TELEGRAM_TOKEN"
  }
}
EOF

echo "✅ File konfigurasi skema murni berhasil disuntikkan!"
echo "=========================================="

# 3. Jalankan OpenClaw Gateway secara resmi di background
openclaw gateway run --dev --allow-unconfigured --force &

# 4. Jalankan Server Express.js kamu di port 7860
PORT=7860 node server.js