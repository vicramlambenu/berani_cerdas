require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

// IMPORT ADMIN ROUTES
const setupAdminRoutes = require('./admin');

// ----------------------------------
// Express App & Middleware Configuration
// ----------------------------------
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.ADMIN_PASSWORD || 'berani-cerdas-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { 
        // Otomatis secure (HTTPS) jika di Vercel/Production, false jika di localhost
        secure: process.env.NODE_ENV === 'production', 
        maxAge: 24 * 60 * 60 * 1000 // Berlaku selama 24 jam
    }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ----------------------------------
// Environment Variables & Configuration Check
// ----------------------------------
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || process.env.TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!TELEGRAM_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
    console.error('⚠️ [WARNING] Variabel lingkungan (.env) mungkin belum lengkap!');
}

// ----------------------------------
// Supabase Client Initialization
// ----------------------------------
function createSupabaseClient() {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.error('⚠️ Supabase Client gagal diinisialisasi karena URL/KEY kosong.');
        return null;
    }
    return createClient(SUPABASE_URL, SUPABASE_KEY);
}
const supabase = createSupabaseClient();

// ----------------------------------
// Telegram Bot Instance Setup
// ----------------------------------
function initTelegramBot(token) {
    // Gunakan placeholder token agar aplikasi backend tidak crash saat token kosong
    if (!token) return new Telegraf('123456789:PlaceholderTokenUntukMencegahErorCrash');
    return new Telegraf(token);
}
const bot = initTelegramBot(TELEGRAM_TOKEN);

// ----------------------------------
// 📜 CATAT LOG: Audit Trail System Utility
// ----------------------------------
async function catatLog(operator, role, aksi) {
    if (!supabase) return;
    try {
        await supabase.from('system_logs').insert({ operator, role, aksi });
    } catch (err) {
        console.error('❌ Gagal menyimpan audit log ke database:', err.message);
    }
}

// ----------------------------------
// Bot Handler Setup (Ringkas: Sambutan /start & /help awal)
// ----------------------------------
function setupBotHandlers(botInstance, db) {
    if (!botInstance) return;

    botInstance.start(async (ctx) => {
        const chatId = ctx.chat.id;
        const firstName = ctx.from.first_name || 'User';
        try {
            if (db) await db.from('subscribers').upsert({ chat_id: chatId.toString(), username: ctx.from.username || '' });
        } catch (err) {
            console.error('Gagal simpan subscriber:', err.message);
        }
        ctx.replyWithMarkdown(
            `Selamat Datang *${firstName}* di Bot Resmi Beasiswa Berani Cerdas! 🎓\n\n` +
            `Silakan ajukan pertanyaan Anda langsung di sini. AI OpenClaw akan menjawab secara otomatis berdasarkan basis pengetahuan terbaru!`
        );
    });

    botInstance.help((ctx) => ctx.replyWithMarkdown('Kirim pertanyaan seputar informasi pendaftaran beasiswa secara langsung.'));
}
if (bot && supabase) setupBotHandlers(bot, supabase);

// ----------------------------------
// Admin Panel Routing (Inject Supabase, Bot Instance, & Fungsi CatatLog)
// ----------------------------------
if (supabase) {
    const adminRouter = setupAdminRoutes(supabase, bot, catatLog);
    app.use('/admin', adminRouter);
} else {
    app.use('/admin', (req, res) => res.status(500).send('Database belum terkonfigurasi.'));
}

// ----------------------------------
// Telegram Webhook Gateway Endpoint
// ----------------------------------
app.post('/api/telegram-webhook', async (req, res) => {
    try {
        if (TELEGRAM_TOKEN && bot) await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } catch (err) {
        res.status(200).send('OK');
    }
});

// ----------------------------------
// 🚪 GATEWAY: AI CHAT GATEWAY FOR OPENCLAW ENGINE
// (Mengirimkan Knowledge Base hasil input Admin di Dashboard ke OpenClaw secara Dinamis)
// ----------------------------------
async function handlePostAIChat(req, res) {
    if (!supabase) return res.status(500).json({ success: false, message: 'Database belum terkonfigurasi.' });

    try {
        // Mengambil data instruksi & basis pengetahuan ter-update yang diketik admin di halaman web /admin/ai-config
        const { data: config, error } = await supabase
            .from('ai_config')
            .select('system_instruction, knowledge_base')
            .eq('id', 1)
            .maybeSingle();

        if (error) throw error;

        // Data backup otomatis apabila baris tabel di database Supabase kamu masih kosong
        const defaultInstruction = "Kamu adalah AI resmi Beasiswa Berani Cerdas. Jawablah dengan ramah, sopan, dan informatif.";
        const defaultKnowledge = "Beasiswa Berani Cerdas merupakan program bantuan dana pendaftaran bagi pendaftar umum yang memenuhi kriteria.";

        // Mengembalikan konfigurasi ke OpenClaw Engine
        return res.json({ 
            success: true, 
            system_instruction: config?.system_instruction || defaultInstruction, 
            knowledge_base: config?.knowledge_base || defaultKnowledge, 
            model_target: 'gemini-2.0-flash-lite' // Model target utama yang disepakati kelompokmu
        });
    } catch (err) {
        console.error("Gagal sinkronisasi data ke OpenClaw:", err.message);
        return res.status(500).json({ success: false, message: 'OpenClaw API Error.' });
    }
}
app.post('/api/ai-chat', handlePostAIChat);

// ----------------------------------
// Landing Page Landing View (UI)
// ----------------------------------
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Beasiswa Berani Cerdas - Kelompok 7</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto}</style>
</head>
<body class="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
<div class="max-w-3xl w-full bg-slate-900/95 border border-slate-800 rounded-3xl shadow-2xl p-8">
<header class="text-center mb-8">
<p class="text-sm uppercase tracking-[0.4em] text-cyan-300">Beasiswa Kelompok 7</p>
<h1 class="mt-3 text-4xl md:text-5xl font-extrabold text-white">🎓 Beasiswa Berani Cerdas</h1>
<p class="mt-4 text-slate-400 max-w-xl mx-auto">Program beasiswa terintegrasi penuh dengan ekosistem otomatisasi OpenClaw Gateway.</p>
</header>
<div class="rounded-3xl bg-slate-800/70 border border-slate-700 p-6 text-center">
<h2 class="text-xl font-bold text-emerald-300 mb-3">Admin Panel (Multi-Role Login)</h2>
<p class="text-slate-200 text-sm mb-4">Kelola pendaftar, lihat log audit tindakan, dan modifikasi data Knowledge Base AI.</p>
<a href="/admin" class="inline-flex items-center justify-center rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">Masuk Dashboard</a>
</div>
</div>
</body>
</html>
    `);
});

// ----------------------------------
// Run Express Server (Hanya aktif di mode lokal laptop/development)
// ----------------------------------
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 7860;
    app.listen(PORT, () => console.log(`SERVER UTAMA KELOMPOK 7 AKTIF DI PORT ${PORT}`));
}

module.exports = app;