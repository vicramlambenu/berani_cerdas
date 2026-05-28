require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

// ==========================================
// IMPORT ADMIN ROUTES
// ==========================================
const setupAdminRoutes = require('./admin');

// ==========================================
// EXPRESS APP
// ==========================================
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.ADMIN_PASSWORD || 'berani-cerdas-secret',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ==========================================
// ENV
// ==========================================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || process.env.TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!TELEGRAM_TOKEN) {
    throw new Error('Missing Telegram bot token: set TELEGRAM_TOKEN or TOKEN in .env');
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Missing Supabase config: set SUPABASE_URL and SUPABASE_KEY in .env');
}

// ==========================================
// TELEGRAM BOT (Tetap diinstansiasi untuk keperluan Broadcast Admin)
// ==========================================
const bot = new Telegraf(TELEGRAM_TOKEN);

// ==========================================
// SUPABASE
// ==========================================
const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

// ==========================================
// ADMIN ROUTES (Panel Web Admin & Broadcast)
// ==========================================
const adminRouter = setupAdminRoutes(supabase, bot);
app.use('/admin', adminRouter);

// ==========================================
// OPENCLAW API GATEWAY ENDPOINT
// ==========================================
app.get('/api/pendaftar/:nim', async (req, res) => {
    const { nim } = req.params;

    try {
        const { data, error } = await supabase
            .from('pendaftar') 
            .select('nama, nim, status_berkas, keterangan')
            .eq('nim', nim)
            .maybeSingle(); 

        if (error) {
            console.error('Supabase Error:', error);
            return res.status(500).json({ success: false, message: 'Gagal mengambil data database.' });
        }

        if (!data) {
            return res.status(404).json({ 
                success: false, 
                message: 'NIM tidak terdaftar dalam sistem Beasiswa Berani Cerdas.' 
            });
        }

        return res.json({
            success: true,
            nama: data.nama,
            nim: data.nim,
            status_berkas: data.status_berkas,
            keterangan: data.keterangan || 'Tidak ada catatan tambahan.'
        });

    } catch (err) {
        console.error('Server Internal Error:', err);
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server lokal.' });
    }
});

// ==========================================
// HOME PAGE
// ==========================================
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Beasiswa Berani Cerdas</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
<div class="max-w-3xl w-full bg-slate-900/95 border border-slate-800 rounded-3xl shadow-2xl p-8">
<header class="text-center mb-8">
<p class="text-sm uppercase tracking-[0.4em] text-cyan-300">Beasiswa Resmi</p>
<h1 class="mt-3 text-4xl md:text-5xl font-extrabold text-white">🎓 Beasiswa Berani Cerdas</h1>
<p class="mt-4 text-slate-400 max-w-xl mx-auto">Program beasiswa untuk mahasiswa aktif dengan IPK minimal 3.00. Dapatkan informasi lengkap melalui bot Telegram resmi kami.</p>
</header>

<section class="grid gap-4 md:grid-cols-2 mb-8">
<div class="rounded-3xl bg-slate-800/70 border border-slate-700 p-6">
<h2 class="text-xl font-bold text-cyan-300 mb-3">Status Bot</h2>
<p class="text-slate-200">Bot Telegram aktif dan dihandle secara cerdas oleh OpenClaw Gateway.</p>
</div>

<div class="rounded-3xl bg-slate-800/70 border border-slate-700 p-6">
<h2 class="text-xl font-bold text-emerald-300 mb-3">Admin Panel</h2>
<p class="text-slate-200">Akses panel admin jika Anda adalah pengelola.</p>
<a href="/admin" class="inline-flex mt-4 items-center justify-center rounded-full bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">Masuk Admin</a>
</div>
</section>

<footer class="mt-10 text-center text-slate-500 text-sm">
<p>Gunakan bot Telegram untuk menanyakan status pendaftaran beasiswa Anda secara real-time.</p>
</footer>
</div>
</body>
</html>
    `);
});

// ==========================================
// RUN EXPRESS SERVER ONLY
// ==========================================
// Kondisional listen: Hanya menyala jika berjalan lokal di laptop, bukan di Vercel serverless
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 7860;
    app.listen(PORT, () => {
        console.log(`SERVER API & ADMIN PANEL AKTIF DI PORT ${PORT}`);
    });
}

// WAJIB EKSPOR: Baris ini adalah kunci agar Serverless Vercel tidak crash 500
module.exports = app;