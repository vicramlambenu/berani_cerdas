const path = require('path');
const express = require('express');
const session = require('express-session');

const setupAdminRoutes = require('./admin');
const registerApiRoutes = require('./routes/apiRoutes');
const { supabase } = require('./supabaseClient');
const { initTelegramBot, setupBotHandlers } = require('./telegramBot');
const catatLog = require('./services/logService');
const {
    TELEGRAM_TOKEN,
    SESSION_SECRET,
    PORT,
    NODE_ENV,
    checkRequiredEnv
} = require('./config');

checkRequiredEnv();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000
    }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const bot = initTelegramBot(TELEGRAM_TOKEN);
if (bot && supabase) setupBotHandlers(bot, supabase);

if (supabase) {
    const adminRouter = setupAdminRoutes(supabase, bot, catatLog);
    app.use('/admin', adminRouter);
} else {
    app.use('/admin', (req, res) => res.status(500).send('Database belum terkonfigurasi.'));
}

registerApiRoutes(app, supabase, bot);

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Beasiswa Berani Cerdas</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto}</style>
</head>
<body class="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
<div class="max-w-3xl w-full bg-slate-900/95 border border-slate-800 rounded-3xl shadow-2xl p-8">
<header class="text-center mb-8">
<p class="text-sm uppercase tracking-[0.4em] text-cyan-300">Beasiswa Berani Cerdas</p>
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

if (NODE_ENV !== 'production') {
    app.listen(PORT, () => console.log(`SERVER UTAMA AKTIF DI PORT ${PORT}`));
}

module.exports = app;
