# Gunakan node versi stabil
FROM node:20-slim

# Set direktori kerja di dalam container
WORKDIR /app

# Salin file package.json dan package-lock.json
COPY package*.json ./

# Install dependensi (Telegraf, Express, Supabase, Gemini, dotenv)
RUN npm install --production

# Salin seluruh kode sumber aplikasi
COPY . .

# Ekspos port sesuai variabel PORT di .env (default 3000)
EXPOSE 3000

# Jalankan aplikasi
CMD ["node", "server.js"]