require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

// ==========================================
// IMPORT ADMIN ROUTES (Dengan Melemparkan Fungsi Log)
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
// ENV & SAFETY CHECK (Graceful Handling)
// ==========================================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || process.env.TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!TELEGRAM_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
    console.error("⚠️ [WARNING] Variabel lingkungan (.env) belum terkonfigurasi dengan lengkap!");
}

// ==========================================
// TELEGRAM BOT (Hanya Untuk Start & Help Sederhana)
// ==========================================
let bot;
if (TELEGRAM_TOKEN) {
    bot = new Telegraf(TELEGRAM_TOKEN);
} else {
    bot = new Telegraf('123456789:PlaceholderTokenUntukMencegahErorCrash');
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
// 📜 1. UTILITY: FUNGSI PENCATATAN LOG OTOMATIS
// ==========================================
async function catatLog(operator, role, aksi) {
    if (!supabase) return;
    try {
        await supabase.from('system_logs').insert({
            operator: operator,
            role: role,
            aksi: aksi
        });
    } catch (err) {
        console.error("❌ Gagal menyimpan audit log ke database:", err.message);
    }
}

// ==========================================
// 🤖 BOT COMMANDS (SABUTAN AWAL SAJA)
// ==========================================
if (TELEGRAM_TOKEN && bot && supabase) {
    bot.start(async (ctx) => {
        const chatId = ctx.chat.id;
        const firstName = ctx.from.first_name || 'Mahasiswa';
        
        try {
            await supabase.from('subscribers').upsert({ chat_id: chatId.toString(), username: ctx.from.username || '' });
        } catch (err) {
            console.error("Gagal simpan subscriber:", err.message);
        }

        ctx.replyWithMarkdown(
            `Selamat Datang *${firstName}* di Bot Resmi Beasiswa Berani Cerdas JTI UNTAD! 🎓\n\n` +
            `Silakan ketik NIM Anda untuk cek status berkas, atau tanyakan apa saja. AI OpenClaw akan langsung merespons secara otomatis!`
        );
    });

    bot.help((ctx) => {
        ctx.replyWithMarkdown(`Ketik NIM Anda atau kirim pertanyaan seputar beasiswa secara langsung.`);
    });

    // 🛑 KODE BOT.ON('TEXT') YANG MANUAL DAN BENTROK SUDAH DIHAPUS TOTAL DI SINI!
    // Karena penanganan teks chat sepenuhnya diambil alih oleh engine otomatis OpenClaw Gateway.
}

// ==========================================
// ADMIN ROUTES (Mendukung Login Username, Multi-role, dan Log)
// ==========================================
if (supabase) {
    const adminRouter = setupAdminRoutes(supabase, bot, catatLog);
    app.use('/admin', adminRouter);
} else {
    app.use('/admin', (req, res) => {
        res.status(500).send("Database belum terkonfigurasi.");
    });
}

// ==========================================
// TELEGRAM WEBHOOK ENDPOINT
// ==========================================
app.post('/api/telegram-webhook', async (req, res) => {
    try {
        if (TELEGRAM_TOKEN && bot) {
            await bot.handleUpdate(req.body);
        }
        res.status(200).send('OK');
    } catch (err) {
        res.status(200).send('OK');
    }
});

// ==========================================
// 🚪 PINTU GATEWAY OPENCLAW 1: AMBIL DATA JALUR NIM
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

        if (error) throw error;
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
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
    }
});

// ==========================================
// 🚪 PINTU GATEWAY OPENCLAW 2: CHAT AI UTAMA VIA OPENCLAW ENGINE
// ==========================================
app.post('/api/ai-chat', async (req, res) => {
    const { pesan } = req.body; 
    if (!pesan) return res.status(400).json({ success: false, message: 'Pesan kosong.' });

    try {
        const { data: config } = await supabase.from('ai_config').select('*').eq('id', 1).single();

        // Pintu ini otomatis mendengarkan kiriman dari ekosistem OpenClaw kamu
        return res.json({
            success: true,
            system_instruction: config?.system_instruction,
            knowledge_base: config?.knowledge_base,
            model_target: "gemini-2.0-flash-lite"
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'OpenClaw API Error.' });
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
<title>Beasiswa Berani Cerdas - Kelompok 7</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
<div class="max-w-3xl w-full bg-slate-900/95 border border-slate-800 rounded-3xl shadow-2xl p-8">
<header class="text-center mb-8">
<p class="text-sm uppercase tracking-[0.4em] text-cyan-300">Beasiswa Kelompok 7</p>
<h1 class="mt-3 text-4xl md:text-5xl font-extrabold text-white">🎓 Beasiswa Berani Cerdas</h1>
<p class="mt-4 text-slate-400 max-w-xl mx-auto">Program beasiswa mahasiswa aktif JTI UNTAD terintegrasi OpenClaw Gateway.</p>
</header>
<div class="rounded-3xl bg-slate-800/70 border border-slate-700 p-6 text-center">
<h2 class="text-xl font-bold text-emerald-300 mb-3">Admin Panel (Multi-Role Login)</h2>
<p class="text-slate-200 text-sm mb-4">Kelola pendaftar, lihat log audit, dan modifikasi instruksi Knowledge Base AI.</p>
<a href="/admin" class="inline-flex items-center justify-center rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">Masuk Dashboard</a>
</div>
</div>
</body>
</html>
    `);
});

// RUN SERVER
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 7860;
    app.listen(PORT, () => console.log(`SERVER AKTIF DI PORT ${PORT}`));
}

module.exports = app;