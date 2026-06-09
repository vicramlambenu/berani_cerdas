const path = require('path');
const express = require('express');
const session = require('express-session');

const setupAdminRoutes = require('./admin');
const registerApiRoutes = require('./routes/apiRoutes');
const { supabase } = require('./supabaseClient');
const catatLog = require('./services/logService');
const {
    SESSION_SECRET,
    PORT,
    NODE_ENV,
    checkRequiredEnv
} = require('./config');

// Validasi variabel environment dasar di .env
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

// ====================================================================
// 🤖 STATUS BOT TELEGRAM DI EXPRESS (DINONAKTIFKAN SECARA BERSIH)
// ====================================================================
// Kita setel ke null agar jembatan router admin di bawah tidak mengalami crash/break.
// Urusan Telegram kini dihandle 100% secara mandiri dan langsung oleh OpenClaw Engine.
const bot = null; 

// ====================================================================
// ⚙️ ROUTING MANAGEMENT
// ====================================================================
if (supabase) {
    const adminRouter = setupAdminRoutes(supabase, bot, catatLog);
    app.use('/admin', adminRouter);
} else {
    app.use('/admin', (req, res) => res.status(500).send('Database belum terkonfigurasi.'));
}

// Daftarkan API rute internal dan rotator API Key cadangan
registerApiRoutes(app, supabase, bot);

// ====================================================================
// 🌐 NEW LUXURY LANDING PAGE (PREMIUM & EYE-FRIENDLY UI)
// ====================================================================
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Berani Cerdas — Intelligent Agent Platform</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
      background: #0b0f19;
    }
    .glow-effect {
      box-shadow: 0 0 50px -10px rgba(99, 102, 241, 0.15);
    }
    .text-gradient {
      background: linear-gradient(135deg, #67e8f9 0%, #6366f1 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
  </style>
</head>
<body class="min-h-screen text-slate-300 flex flex-col justify-between relative overflow-x-hidden selection:bg-indigo-500/30 selection:text-indigo-200">

  <div class="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-900/10 blur-[120px] pointer-events-none"></div>
  <div class="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] rounded-full bg-cyan-900/10 blur-[150px] pointer-events-none"></div>

  <div class="container mx-auto px-4 py-12 flex-grow flex items-center justify-center z-10">
    <div class="max-w-4xl w-full bg-slate-900/40 border border-slate-800/80 backdrop-blur-xl rounded-[2.5rem] p-8 md:p-12 glow-effect transition-all duration-300 hover:border-slate-700/50">
      
      <header class="text-center mb-12">
        <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-6">
          <i class="fa-solid fa-bolt animate-pulse"></i> Next-Gen AI Integration
        </div>
        <h1 class="text-4xl md:text-6xl font-extrabold text-white tracking-tight leading-tight">
          Platform Sistem <span class="text-gradient">Berani Cerdas</span>
        </h1>
        <p class="mt-4 text-base md:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Infrastruktur Otomatisasi Jembatan Omni-Channel Terintegrasi Penuh dengan Supabase Cloud Database & OpenClaw Gateway Engine.
        </p>
      </header>

      <div class="w-24 h-[2px] bg-gradient-to-r from-cyan-400 to-indigo-500 mx-auto mb-12 rounded-full"></div>

      <div class="grid gap-6 md:grid-cols-3 mb-12">
        <div class="p-6 bg-slate-900/60 border border-slate-800 rounded-3xl transition hover:border-slate-700/60">
          <div class="w-12 h-12 rounded-2xl bg-cyan-500/10 flex items-center justify-center text-cyan-400 text-xl mb-4">
            <i class="fa-solid fa-robot"></i>
          </div>
          <h3 class="text-lg font-bold text-white mb-2">Gemini 2.0 Engine</h3>
          <p class="text-xs text-slate-400 leading-relaxed">Penalaran Natural Language Processing super cepat menggunakan sub-model Flash Lite resmi Google AI.</p>
        </div>

        <div class="p-6 bg-slate-900/60 border border-slate-800 rounded-3xl transition hover:border-slate-700/60">
          <div class="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 text-xl mb-4">
            <i class="fa-solid fa-shield-halved"></i>
          </div>
          <h3 class="text-lg font-bold text-white mb-2">Context Guard</h3>
          <p class="text-xs text-slate-400 leading-relaxed">Teknik pemotongan Strict Guarding untuk mengisolasi pertanyaan di luar ruang lingkup secara otomatis.</p>
        </div>

        <div class="p-6 bg-slate-900/60 border border-slate-800 rounded-3xl transition hover:border-slate-700/60">
          <div class="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-400 text-xl mb-4">
            <i class="fa-solid fa-key"></i>
          </div>
          <h3 class="text-lg font-bold text-white mb-2">Key Failover</h3>
          <p class="text-xs text-slate-400 leading-relaxed">Rotasi Multi-API token cerdas yang otomatis berputar saat mendeteksi limitasi kuota harian (Rate Limit).</p>
        </div>
      </div>

      <div class="rounded-3xl bg-gradient-to-br from-slate-900/90 to-slate-900/40 border border-slate-800 p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div class="text-center md:text-left">
          <h2 class="text-xl font-bold text-white flex items-center justify-center md:justify-start gap-2">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
            Management Console
          </h2>
          <p class="text-slate-400 text-sm mt-1">Gunakan otoritas hak akses Anda untuk masuk ke ruang kendali sistem pusat.</p>
        </div>
        <a href="/admin" class="w-full md:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-indigo-600 px-8 py-4 text-sm font-bold text-white shadow-xl shadow-indigo-600/10 transition-all duration-300 hover:from-cyan-400 hover:to-indigo-500 hover:scale-[1.03] active:scale-[0.98]">
          <i class="fa-solid fa-right-to-bracket text-xs"></i> Masuk Dashboard Admin
        </a>
      </div>

    </div>
  </div>

  <footer class="w-full text-center py-6 border-t border-slate-900 text-xs text-slate-600 z-10">
    &copy; 2026 Core Infrastructure Group • Berani Cerdas Project. All rights reserved.
  </footer>

</body>
</html>
    `);
});

// ====================================================================
// 🚀 EKSEKUSI RUNTIME BACKEND SERVER
// ====================================================================
if (NODE_ENV !== 'production') {
    app.listen(PORT, async () => {
        console.log(`========================================================`);
        console.log(`🚀 SERVER UTAMA AKTIF DI PORT: http://localhost:${PORT}`);
        console.log(`========================================================`);
        console.log("🔒 Telegram Polling di Express dinonaktifkan demi stabilitas.");
        console.log("👉 Manajemen obrolan Telegram sepenuhnya dijalankan oleh OpenClaw.");
        console.log(`========================================================\n`);
    });
}

module.exports = app;