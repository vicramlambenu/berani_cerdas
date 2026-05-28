FROM node:22

# Install utilitas dasar untuk OpenClaw
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Install OpenClaw CLI secara global di server
# Kunci instalasi pada versi stabil 2026.5.12 yang memiliki modul Telegram bawaan
RUN npm install -g openclaw@2026.5.12

WORKDIR /app

# Install dependencies proyek Express
COPY package*.json ./
RUN npm install

# Salin seluruh kodingan proyek kamu ke server
COPY . .

# Berikan izin eksekusi penuh untuk script start.sh
RUN chmod +x start.sh

# Buka gerbang port sesuai standar Hugging Face
EXPOSE 7860

CMD ["./start.sh"]