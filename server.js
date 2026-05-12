<<<<<<< HEAD
require("dotenv").config();

const express = require("express");
const session = require("express-session");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

app.use("/", require("./routes/authRoutes"));
app.use("/", require("./routes/dashboardRoutes"));
app.use("/", require("./routes/broadcastRoutes"));

app.listen(process.env.PORT, () => {
  console.log("Running http://localhost:3000");
});
=======
require('dotenv').config();

const express = require('express');
const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

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

// ==========================================
// ENV
// ==========================================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const ADMIN_ID = process.env.ADMIN_ID;

// ==========================================
// TELEGRAM BOT
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
// GEMINI
// ==========================================
const genAI = new GoogleGenerativeAI(
    GEMINI_API_KEY
);

// ==========================================
// ADMIN ROUTES
// ==========================================
const adminRouter =
    setupAdminRoutes(
        supabase,
        bot,
        app
    );

app.use('/admin', adminRouter);

// ==========================================
// SYSTEM PROMPT
// ==========================================
const SYSTEM_INSTRUCTION = `
Kamu adalah AI Assistant resmi Beasiswa Berani Cerdas.

Informasi Beasiswa:
- Nama: Beasiswa Berani Cerdas
- IPK minimal: 3.00
- Mahasiswa aktif
- Upload KTM
- Upload KHS
- Deadline: 30 Mei 2026
- Zona waktu WITA

Aturan:
- Jawab dengan ramah
- Jawab singkat
- Gunakan bahasa Indonesia
- Jika tidak tahu jawaban:
HUBUNGI_ADMIN
`;

// ==========================================
// START BOT
// ==========================================
bot.start(async (ctx) => {

    try {

        const user = ctx.from;

        // ==========================================
        // SAVE USER
        // ==========================================
        const { error } =
            await supabase
                .from('subscribers')
                .upsert({
                    chat_id: user.id.toString(),
                    full_name: user.first_name,
                    username: user.username || "-"
                });

        if (error) {

            console.log(error);

            return ctx.reply(
                "⚠️ Gagal menyimpan data."
            );

        }

        // ==========================================
        // WELCOME MESSAGE
        // ==========================================
        ctx.reply(`
🎓 Selamat datang di Bot Resmi
Beasiswa Berani Cerdas

Menu Cepat:
━━━━━━━━━━━━━━
📌 Deadline
📌 Persyaratan
📌 Cara Daftar
📌 Kontak Admin

Silakan tanyakan sesuatu 😊
        `);

    } catch (err) {

        console.log(err);

        ctx.reply(
            "⚠️ Terjadi kesalahan."
        );

    }

});

// ==========================================
// BOT MESSAGE
// ==========================================
bot.on('text', async (ctx) => {

    try {

        const msg = ctx.message.text;
        const userId = ctx.from.id.toString();

        // ==========================================
        // ABAIKAN COMMAND
        // ==========================================
        if (msg.startsWith('/')) return;

        const lower =
            msg.toLowerCase();

        // ==========================================
        // FAQ DEADLINE
        // ==========================================
        if (
            lower.includes('deadline') ||
            lower.includes('batas')
        ) {

            return ctx.reply(`
📅 Deadline pendaftaran:
30 Mei 2026
            `);

        }

        // ==========================================
        // FAQ SYARAT
        // ==========================================
        if (
            lower.includes('syarat') ||
            lower.includes('persyaratan')
        ) {

            return ctx.reply(`
📄 Persyaratan:
━━━━━━━━━━━━━━
✅ Mahasiswa aktif
✅ IPK minimal 3.00
✅ Upload KTM
✅ Upload KHS
            `);

        }

        // ==========================================
        // FAQ CARA DAFTAR
        // ==========================================
        if (
            lower.includes('cara daftar') ||
            lower.includes('pendaftaran')
        ) {

            return ctx.reply(`
📝 Cara Daftar:
━━━━━━━━━━━━━━
1. Siapkan KTM
2. Siapkan KHS
3. Isi formulir
4. Upload dokumen
5. Tunggu verifikasi
            `);

        }

        // ==========================================
        // FAQ KONTAK
        // ==========================================
        if (
            lower.includes('kontak') ||
            lower.includes('admin')
        ) {

            return ctx.reply(`
📞 Kontak Admin:
0812xxxxxxxx
            `);

        }

        // ==========================================
        // TYPING
        // ==========================================
        await ctx.sendChatAction('typing');

        // ==========================================
        // GEMINI MODEL
        // ==========================================
        const model =
            genAI.getGenerativeModel({
                model: 'gemini-2.5-flash-lite'
            });

        // ==========================================
        // PROMPT
        // ==========================================
        const prompt = `
${SYSTEM_INSTRUCTION}

Pertanyaan user:
${msg}
        `;

        // ==========================================
        // AI GENERATE
        // ==========================================
        const result =
            await model.generateContent(
                prompt
            );

        const response =
            await result.response;

        const aiText =
            response.text();

        // ==========================================
        // FORWARD TO ADMIN
        // ==========================================
        if (
            aiText.includes(
                'HUBUNGI_ADMIN'
            )
        ) {

            await ctx.reply(`
⚠️ Pertanyaan Anda akan diteruskan ke admin.
            `);

            await bot.telegram.sendMessage(
                ADMIN_ID,
                `
📩 BANTUAN MANUAL

👤 Nama:
${ctx.from.first_name}

🆔 User ID:
${userId}

❓ Pertanyaan:
${msg}
                `
            );

            return;

        }

        // ==========================================
        // SEND AI RESPONSE
        // ==========================================
        await ctx.reply(aiText);

    } catch (err) {

        console.log(
            "ERROR GEMINI:"
        );

        console.log(err.message);

        // ==========================================
        // QUOTA ERROR
        // ==========================================
        if (
            err.message.includes('429') ||
            err.message.includes('quota')
        ) {

            return ctx.reply(`
⚠️ AI sedang mencapai batas penggunaan.

Silakan coba beberapa menit lagi.
            `);

        }

        // ==========================================
        // GENERAL ERROR
        // ==========================================
        ctx.reply(`
⚠️ Sistem sedang mengalami gangguan.
        `);

    }

});

// ==========================================
// HOME
// ==========================================
app.get('/', (req, res) => {

    res.send(`
<h1>
🎓 Beasiswa Berani Cerdas
</h1>

<p>
Bot Telegram Aktif
</p>

<p>
Admin:
<a href="/admin">
/admin
</a>
</p>
    `);

});

// ==========================================
// RUN BOT
// ==========================================
bot.launch()
    .then(() => {

        console.log(`
=================================
BOT TELEGRAM ONLINE
=================================
        `);

    });

// ==========================================
// RUN EXPRESS
// ==========================================
const PORT =
    process.env.PORT || 3000;

app.listen(PORT, () => {

    console.log(`
=================================
SERVER AKTIF
http://localhost:${PORT}
=================================
    `);

});

// ==========================================
// STOP BOT
// ==========================================
process.once(
    'SIGINT',
    () => bot.stop('SIGINT')
);

process.once(
    'SIGTERM',
    () => bot.stop('SIGTERM')
);
>>>>>>> af0544c (Initial commit: Bot Beasiswa Berani Cerdas)
