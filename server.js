require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
// 🌟 IMPORT SDK RESMI GEMINI AI
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ==========================================
// IMPORT ADMIN ROUTES
// ==========================================
const setupAdminRoutes = require('./admin');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.ADMIN_PASSWORD || 'berani-cerdas-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || process.env.TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

let bot;
if (TELEGRAM_TOKEN) {
    bot = new Telegraf(TELEGRAM_TOKEN);
} else {
    bot = new Telegraf('123456789:PlaceholderTokenUntukMencegahErorCrash');
}

let supabase;
if (SUPABASE_URL && SUPABASE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
}

async function catatLog(operator, role, aksi) {
    if (!supabase) return;
    try {
        await supabase.from('system_logs').insert({ operator, role, aksi });
    } catch (err) {
        console.error("❌ Gagal menyimpan audit log:", err.message);
    }
}

// ==========================================
// 🤖 AUTOMATED CHAT AI (SINKRONISASI OPENCLAW & TELEGRAM)
// ==========================================
if (TELEGRAM_TOKEN && bot && supabase) {
    
    bot.start(async (ctx) => {
        const chatId = ctx.chat.id;
        try {
            await supabase.from('subscribers').upsert({ chat_id: chatId.toString(), username: ctx.from.username || '' });
        } catch (err) {}
        ctx.replyWithMarkdown(`Selamat Datang di Bot Resmi Beasiswa Berani Cerdas! 🎓\n\nSilakan ketik pertanyaan Anda atau masukkan NIM langsung di sini. AI akan menjawab secara otomatis.`);
    });

    bot.help((ctx) => {
        ctx.replyWithMarkdown(`Ketik informasi apa saja atau masukkan NIM Anda secara langsung.`);
    });

    // 🌟 JALUR OTOMATIS: MENANGKAP CHAT DAN LANGSUNG DIJAWAB AI GEMINI SECARA MANDIRI
    bot.on('text', async (ctx) => {
        const text = ctx.message.text.trim();

        try {
            if (!process.env.GEMINI_API_KEY) {
                return ctx.reply('Maaf, GEMINI_API_KEY belum dikonfigurasi di Environment Variables Vercel.');
            }

            // 1. Ambil Aturan & Knowledge Base Dinamis yang diinput Admin dari Supabase
            const { data: config } = await supabase.from('ai_config').select('*').eq('id', 1).single();
            const systemInstruction = config?.system_instruction || 'Kamu adalah AI Admin resmi Beasiswa Berani Cerdas.';
            const knowledgeBase = config?.knowledge_base || '';

            // 2. Deklarasikan Fungsi Otomatis (Tool) Cek NIM untuk AI Gemini
            const ambilDataPendaftarAlat = {
                name: "ambilDataPendaftar",
                description: "Fungsi otomatis untuk mengambil status berkas pendaftar beasiswa dari database berdasarkan NIM mahasiswa.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        nim: { type: "STRING", description: "NIM mahasiswa, contoh: F55122001" }
                    },
                    required: ["nim"]
                }
            };

            // 3. Panggil Engine Gemini 2.0 Flash Lite secara stabil
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({
                model: "gemini-2.0-flash-lite",
                systemInstruction: `${systemInstruction}\n\n[KNOWLEDGE BASE DATA REFERENSI]:\n${knowledgeBase}`
            });

            const chat = model.startChat({
                tools: [{ functionDeclarations: [ambilDataPendaftarAlat] }]
            });

            const result = await chat.sendMessage(text);
            const functionCalls = result.response.functionCalls;

            // 4. JALUR FUNGSI OTOMATIS: Jika AI mendeteksi ada NIM di dalam chat user
            if (functionCalls && functionCalls[0].name === "ambilDataPendaftar") {
                const nimTarget = functionCalls[0].args.nim.toUpperCase();

                const { data, error } = await supabase
                    .from('pendaftar')
                    .select('nama, nim, status_berkas, keterangan')
                    .eq('nim', nimTarget)
                    .maybeSingle();

                let hasilDatabase = "";
                if (error) {
                    hasilDatabase = "Gagal mengakses database.";
                } else if (!data) {
                    hasilDatabase = `NIM ${nimTarget} tidak ditemukan dalam database pendaftar beasiswa.`;
                } else {
                    hasilDatabase = `Data Ditemukan! Nama: ${data.nama}, NIM: ${data.nim}, Status Berkas: ${data.status_berkas}, Keterangan: ${data.keterangan || 'Tidak ada.'}`;
                }

                // Kembalikan ke AI agar dirangkai jadi bahasa manusia yang natural
                const tanggapanBalikAI = await chat.sendMessage([{
                    functionResponse: { name: "ambilDataPendaftar", response: { result: hasilDatabase } }
                }]);

                return ctx.replyWithMarkdown(tanggapanBalikAI.response.text());
            }

            // 5. JALUR BIASA: Jika user bertanya hal umum, AI langsung menjawab pakai Knowledge Base
            return ctx.replyWithMarkdown(result.response.text());

        } catch (err) {
            console.error('Error AI:', err.message);
            return ctx.reply('Halo! Ada yang bisa saya bantu mengenai informasi berkas pendaftaran beasiswa?');
        }
    });
}

// ==========================================
// ADMIN ROUTES
// ==========================================
if (supabase) {
    const adminRouter = setupAdminRoutes(supabase, bot, catatLog);
    app.use('/admin', adminRouter);
} else {
    app.use('/admin', (req, res) => res.status(500).send("Database belum siap."));
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
// PINTU GATEWAY OPENCLAW 1 & 2 (TETAP AKTIF & AMAN)
// ==========================================
app.get('/api/pendaftar/:nim', async (req, res) => {
    const { nim } = req.params;
    if (!supabase) return res.status(500).json({ success: false });
    try {
        const { data } = await supabase.from('pendaftar').select('nama, nim, status_berkas, keterangan').eq('nim', nim.toUpperCase()).maybeSingle();
        if (!data) return res.status(404).json({ success: false, message: 'NIM tidak ditemukan.' });
        return res.json({ success: true, ...data });
    } catch (err) { return res.status(500).json({ success: false }); }
});

app.post('/api/ai-chat', async (req, res) => {
    const { pesan } = req.body;
    if (!pesan) return res.status(400).json({ success: false });
    try {
        const { data: config } = await supabase.from('ai_config').select('*').eq('id', 1).single();
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
        const result = await model.generateContent(`${config?.system_instruction}\n\n[KNOWLEDGE]:\n${config?.knowledge_base}\n\nUser: ${pesan}`);
        return res.json({ success: true, balasan: result.response.text() });
    } catch (err) { return res.status(500).json({ success: false }); }
});

// HOME PAGE
app.get('/', (req, res) => {
    res.send(`<h1 style="text-align:center; margin-top:20%;">🎓 Beasiswa Berani Cerdas - Kelompok 7 Aktif di Cloud!</h1>`);
});

if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 7860;
    app.listen(PORT, () => console.log(`SERVER PORT ${PORT}`));
}

module.exports = app;