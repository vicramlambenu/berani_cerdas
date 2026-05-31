require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
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
// ENV & SAFETY CHECK
// ==========================================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("⚠️ [WARNING] Variabel lingkungan Supabase belum terkonfigurasi di Vercel!");
}

// ==========================================
// SUPABASE
// ==========================================
let supabase;
if (SUPABASE_URL && SUPABASE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
} else {
    console.error("⚠️ Supabase Client gagal diinisialisasi karena URL/KEY kosong.");
}

// ==========================================
// ADMIN ROUTES (Panel Web Admin & Broadcast)
// ==========================================
if (supabase) {
    // Telegraf dihapus, kirim parameter bot sebagai null agar panel admin tetap jalan aman
    const adminRouter = setupAdminRoutes(supabase, null);
    app.use('/admin', adminRouter);
} else {
    app.use('/admin', (req, res) => {
        res.status(500).send("Database belum terkonfigurasi.");
    });
}

// ==========================================
// 🚪 OPENCLAW API GATEWAY ENDPOINT (PINTU DIALIRKAN KE OPENCLAW)
// ==========================================
app.get('/api/pendaftar/:nim', async (req, res) => {
    const { nim } = req.params;
    if (!supabase) {
        return res.status(500).json({ success: false, message: 'Database belum terkonfigurasi.' });
    }
    try {
        const { data, error } = await supabase
            .from('pendaftar') 
            .select('nama, nim, status_berkas, keterangan')
            .eq('nim', nim.toUpperCase())
            .maybeSingle(); 

        if (error) {
            console.error('Supabase Error:', error);
            return res.status(500).json({ success: false, message: 'Gagal mengambil data database.' });
        }
        if (!data) {
            return res.status(404).json({ success: false, message: 'NIM tidak ditemukan.' });
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
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
    }
});

// ==========================================
// HOME PAGE (TAMPILAN DASHBOARD)
// ==========================================
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Beasiswa Berani Cerdas - Kelompok 7</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
<div class="max-w-3xl w-full bg-slate-900/95 border border-slate-800 rounded-3xl shadow-2xl p-8">
<header class="text-center mb-8">
<p class="text-sm uppercase tracking-[0.4em] text-cyan-300">Beasiswa Kelompok 7</p>
<h1 class="mt-3 text-4xl md:text-5xl font-extrabold text-white">🎓 Beasiswa Berani Cerdas</h1>
<p class="mt-4 text-slate-400 max-w-xl mx-auto">Program beasiswa mahasiswa aktif JTI UNTAD. Berjalan otomatis menggunakan OpenClaw Gateway.</p>
</header>
<section class="grid gap-4 md:grid-cols-2 mb-8">
<div class="rounded-3xl bg-slate-800/70 border border-slate-700 p-6">
<h2 class="text-xl font-bold text-cyan-300 mb-3">Status Sistem</h2>
<p class="text-slate-200">Murni menggunakan OpenClaw Engine untuk menjawab otomatis via AI Gemini.</p>
</div>
<div class="rounded-3xl bg-slate-800/70 border border-slate-700 p-6">
<h2 class="text-xl font-bold text-emerald-300 mb-3">Admin Panel</h2>
<p class="text-slate-200">Akses panel admin manajemen beasiswa.</p>
<a href="/admin" class="inline-flex mt-4 items-center justify-center rounded-full bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">Masuk Admin</a>
</div>
</section>
</div>
</body>
</html>
    `);
});

// ==========================================
// RUN EXPRESS SERVER ONLY
// ==========================================
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 7860;
    app.listen(PORT, () => {
        console.log(`SERVER AKTIF DI PORT ${PORT}`);
    });
}

module.exports = app;