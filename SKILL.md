---
name: cek-pendaftar
description: Mengambil dan memeriksa status pendaftaran beasiswa mahasiswa berdasarkan NIM atau NPM dari database lokal.
---

# Skill: Cek Pendaftar Beasiswa

Ketika pengguna (mahasiswa) di Telegram menanyakan status pendaftaran mereka, atau mengirimkan nomor identitas seperti NIM / NPM, jalankan instruksi berikut secara berurutan:

1. **Ekstrak NIM/NPM**: Ambil string nomor induk/NIM yang dikirimkan oleh pengguna.
2. **Panggil API Express**: Gunakan perintah internal shell `curl` untuk menembak endpoint API dari server Express lokal kamu yang berjalan di port 3000 (atau port server Express kamu):
   ```bash
   curl -s http://127.0.0.1:7860/api/pendaftar/{{nim}}