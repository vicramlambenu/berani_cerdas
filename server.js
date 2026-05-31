require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
// 🌟 IMPORT LIBRARY GOOGLE GEN AI TERBARU
const { GoogleGenAI } = require('@google/generative-ai');

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
// TELEGRAM BOT (Inisialisasi Aman)
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
// 📜 1. UTILITY: FUNGSI PENCATATAN LOG OTOMATIS (Catatan Hasil Pertemuan 31-05-2026.docx)
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
// 🤖 LOGIKA TANGGAPAN BOT TELEGRAM (LANGSUNG DARI HP)
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
            `Untuk mengecek status berkas pendaftaran beasiswa kamu, silakan ketik langsung *NIM* kamu.\n\n` +
            `Contoh: \`F55122001\``
        );
    });

    bot.help((ctx) => {
        ctx.replyWithMarkdown(`Kirimkan *NIM* kamu (contoh: \`F55122001\`) untuk mengecek status seleksi beasiswa secara real-time.`);
    });

    // Proses membaca pesan teks mahasiswa (Direct Telegram Handling)
    bot.on('text', async (ctx) => {
        const text = ctx.message.text.trim();
        const nimRegex = /^[A-Z][0-9]{3}[0-9]+/i; 

        if (nimRegex.test(text)) {
            // 🚪 PINTU PERTAMA LANGSUNG: JIKA INPUT NIM
            await ctx.reply('🔎 Sedang mengecek data Anda di database Supabase, mohon tunggu...');
            try {
                const { data, error } = await supabase
                    .from('pendaftar')
                    .select('nama, nim, status_berkas, keterangan')
                    .eq('nim', text.toUpperCase())
                    .maybeSingle();

                if (error) throw error;
                if (!data) {
                    return ctx.replyWithMarkdown(`❌ NIM *${text.toUpperCase()}* tidak ditemukan dalam database.`);
                }

                return ctx.replyWithMarkdown(
                    `🎓 *DATA PENDAFTAR BEASISWA*\n\n` +
                    `👤 *Nama:* ${data.nama}\n` +
                    `🆔 *NIM:* ${data.nim}\n` +
                    `📋 *Status Berkas:* _${data.status_berkas}_\n` +
                    `📝 *Keterangan:* ${data.keterangan || 'Tidak ada catatan tambahan.'}`
                );
            } catch (err) {
                return ctx.reply('⚠️ Terjadi kesalahan internal saat mengakses database.');
            }
        } else {
            // 🚪 PINTU KEDUA LANGSUNG: CHAT AI GEMINI MENGGUNAKAN KONFIGURASI SUPABASE
            try {
                if (!process.env.GEMINI_API_KEY) {
                    return ctx.reply('Halo! Silakan masukkan NIM Anda untuk mengecek status beasiswa.');
                }

                // Ambil Knowledgebase terbaru yang disimpan admin dari DB
                const { data: config } = await supabase.from('ai_config').select('*').eq('id', 1).single();

                const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
                const model = ai.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

                const finalPrompt = 
                    `${config?.system_instruction || 'Kamu adalah AI Admin resmi Beasiswa Berani Cerdas.'}\n\n` +
                    `[KNOWLEDGE BASE ATURAN]:\n${config?.knowledge_base || ''}\n\n` +
                    `Pertanyaan mahasiswa: "${text}"`;

                const result = await model.generateContent(finalPrompt);
                return ctx.replyWithMarkdown(result.response.text());
            } catch (aiErr) {
                return ctx.reply('Halo! Silakan kirimkan NIM Anda untuk memeriksa status berkas.');
            }
        }
    });
}

// ==========================================
// ADMIN ROUTES (Mendukung Login Username, Multi-role, dan Log)
// ==========================================
if (supabase) {
    // Memasukkan fungsi catatLog agar rute web admin bisa mencatat log sistem
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
// 🚪 PINTU PERTAMA: OPENCLAW API GATEWAY ENDPOINT (AMBIL NIM)
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
// 🚪 PINTU KEDUA: JALUR API OPENCLAW DENGAN KNOWLEDGE BASE DINAMIS (Catatan 3)
// ==========================================
app.post('/api/ai-chat', async (req, res) => {
    const { pesan } = req.body; 

    if (!pesan) {
        return res.status(400).json({ success: false, message: 'Pesan tidak boleh kosong.' });
    }

    try {
        if (!process.env.GEMINI_API_KEY) {
            return res.json({ success: true, balasan: 'Halo! Silakan masukkan NIM Anda untuk mengecek status berkas.' });
        }

        // 🌟 AMBIL KNOWLEDGE BASE & INSTRUKSI YANG DIEDIT ADMIN SECARA REAL-TIME (Catatan 3)
        const { data: config, error: configError } = await supabase
            .from('ai_config')
            .select('system_instruction, knowledge_base')
            .eq('id', 1)
            .single();

        if (configError) throw configError;

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const model = ai.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

        // Gabungkan Instruksi + Basis Pengetahuan Dinamis dari Database hasil inputan Admin
        const finalPrompt = 
            `${config.system_instruction}\n\n` +
            `[KNOWLEDGE BASE DATA REFERENSI]:\n${config.knowledge_base}\n\n` +
            `Pesan mahasiswa yang masuk lewat OpenClaw Gateway: "${pesan}"`;

        const result = await model.generateContent(finalPrompt);
        const responseText = result.response.text();

        return res.json({
            success: true,
            balasan: responseText
        });

    } catch (err) {
        console.error('Gagal memanggil Gemini via OpenClaw:', err.message);
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada modul Inteligensia AI.' });
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
<p class="mt-4 text-slate-400 max-w-xl mx-auto">Program beasiswa mahasiswa aktif JTI UNTAD. Sistem bot berjalan terintegrasi dengan OpenClaw Gateway.</p>
</header>
<div class="rounded-3xl bg-slate-800/70 border border-slate-700 p-6 text-center">
<h2 class="text-xl font-bold text-emerald-300 mb-3">Admin Panel (Multi-Role Login)</h2>
<p class="text-slate-200 text-sm mb-4">Kepala Admin & Admin dapat mengelola pendaftar, melihat log audit, dan memodifikasi instruksi Knowledge Base AI.</p>
<a href="/admin" class="inline-flex items-center justify-center rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">Masuk Dashboard</a>
</div>
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