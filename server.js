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
// 🤖 LOGIKA TANGGAPAN BOT TELEGRAM (FULLY AUTOMATED CLOUD AI)
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
            `Silakan tanyakan apa saja seputar beasiswa, atau ketik langsung *NIM* kamu untuk memeriksa status berkas secara otomatis.`
        );
    });

    bot.help((ctx) => {
        ctx.replyWithMarkdown(`Tanyakan informasi beasiswa atau kirimkan *NIM* kamu langsung di sini. AI akan menjawab secara otomatis.`);
    });

    // 🌟 FULLY AUTOMATED AI JALUR: Menggunakan Gemini Function Calling (Tools)
    bot.on('text', async (ctx) => {
        const text = ctx.message.text.trim();

        try {
            if (!process.env.GEMINI_API_KEY) {
                return ctx.reply('Maaf, modul kecerdasan AI belum dikonfigurasi.');
            }

            // 1. Ambil Knowledge Base dan Aturan dari Database yang diinput Admin
            const { data: config } = await supabase.from('ai_config').select('*').eq('id', 1).single();
            const systemInstruction = config?.system_instruction || 'Kamu adalah AI Admin resmi Beasiswa Berani Cerdas.';
            const knowledgeBase = config?.knowledge_base || '';

            // 2. Deklarasikan Fungsi Alat (Tool) Supabase agar AI bisa memanggil data pendaftar lewat NIM
            const ambilDataPendaftarAlat = {
                name: "ambilDataPendaftar",
                description: "Fungsi otomatis untuk mengambil status berkas pendaftar beasiswa dari database berdasarkan NIM mahasiswa.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        nim: {
                            type: "STRING",
                            description: "Nomor Induk Mahasiswa (NIM) yang dikirim user, contoh: F55122001",
                        },
                    },
                    required: ["nim"],
                },
            };

            // 3. Inisialisasi Model Utama Gemini 2.0 Flash Lite
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            const model = ai.getGenerativeModel({ 
                model: "gemini-2.0-flash-lite", 
                systemInstruction: `${systemInstruction}\n\n[KNOWLEDGE BASE DATA REFERENSI]:\n${knowledgeBase}`
            });

            // Mulai interaksi chat dengan menyertakan tool database
            const chat = model.startChat({
                tools: [{ functionDeclarations: [ambilDataPendaftarAlat] }],
            });

            const result = await chat.sendMessage(text);
            const functionCalls = result.response.functionCalls;

            // 4. JALUR OTOMATIS: Jika AI mendeteksi input NIM, jalankan pencarian ke tabel 'pendaftar'
            if (functionCalls && functionCalls[0].name === "ambilDataPendaftar") {
                const nimTarget = functionCalls[0].args.nim.toUpperCase();
                
                const { data, error } = await supabase
                    .from('pendaftar')
                    .select('nama, nim, status_berkas, keterangan')
                    .eq('nim', nimTarget)
                    .maybeSingle();

                let hasilDatabase = "";
                if (error) {
                    hasilDatabase = "Gagal mengakses database pendaftar.";
                } else if (!data) {
                    hasilDatabase = `NIM ${nimTarget} tidak ditemukan dalam database pendaftar.`;
                } else {
                    hasilDatabase = `Data Ditemukan. Nama: ${data.nama}, NIM: ${data.nim}, Status Berkas: ${data.status_berkas}, Keterangan: ${data.keterangan || 'Tidak ada.'}`;
                }

                // Berikan hasil database kembali ke AI agar dirangkai menjadi jawaban natural
                const tanggapanBalikAI = await chat.sendMessage([{
                    functionResponse: {
                        name: "ambilDataPendaftar",
                        response: { result: hasilDatabase }
                    }
                }]);

                return ctx.replyWithMarkdown(tanggapanBalikAI.response.text());
            }

            // 5. JALUR NORMAL: Jika user bertanya biasa, AI langsung merespons menggunakan Knowledge Base
            return ctx.replyWithMarkdown(result.response.text());

        } catch (err) {
            console.error('Error Otomatisasi AI Telegram:', err.message);
            return ctx.reply('Halo! Silakan masukkan NIM Anda untuk mengecek status berkas pendaftaran.');
        }
    });
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
// TELEGRAM WEBHOOK ENDPOINT (JALUR VERCEL ONLINE)
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
// 🚪 PINTU GATEWAY OPENCLAW 1: (AMBIL NIM)
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
// 🚪 PINTU GATEWAY OPENCLAW 2: CHAT AI KNOWLEDGE BASE DINAMIS
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

        const { data: config, error: configError } = await supabase
            .from('ai_config')
            .select('system_instruction, knowledge_base')
            .eq('id', 1)
            .single();

        if (configError) throw configError;

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const model = ai.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

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