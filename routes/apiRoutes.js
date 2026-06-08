/**
 * registerApiRoutes - Mengatur endpoint API internal untuk sinkronisasi webhook Telegram 
 * dengan fitur Rotasi Otomatis Multi-API Key (Failover anti-429) dan Teknik Injeksi Paksa
 */
function registerApiRoutes(app, supabase, bot) {
    
    // 🔑 KUMPULKAN DAFTAR API KEY DARI .ENV KEDALAM BENTUK ARRAY
    // Memisahkan string berdasarkan tanda koma. Jika kosong, gunakan default string kosong agar tidak crash.
    const apiKeys = process.env.GEMINI_API_KEYS 
        ? process.env.GEMINI_API_KEYS.split(',') 
        : [process.env.GEMINI_API_KEY || ''];
    
    // Inisialisasi indeks global jika belum ada di memori runtime server
    if (global.currentKeyIndex === undefined) {
        global.currentKeyIndex = 0;
    }

    console.log(`[ROTATOR INIT] Berhasil memuat ${apiKeys.length} API Key cadangan ke dalam memory server.`);

    // ===================================================================
    // 1. ENDPOINT TELEGRAM WEBHOOK
    // ===================================================================
    app.post('/api/telegram-webhook', async (req, res) => {
        try {
            if (bot) await bot.handleUpdate(req.body);
            res.status(200).send('OK');
        } catch (err) {
            console.error('Telegram webhook error:', err.message);
            res.status(200).send('OK');
        }
    });

    // ===================================================================
    // 2. ENDPOINT CONFIGURATION SYNC (DIPANGGIL OLEH ENGINE AI / TELEGRAM BOT)
    // ===================================================================
    app.post('/api/ai-chat', async (req, res) => {
        if (!supabase) {
            return res.status(500).json({ success: false, message: 'Database belum terkonfigurasi.' });
        }

        // 🔄 CHECK: Apakah request ini dikirim oleh bot Telegram untuk memicu rotasi kunci?
        const isLimitDetected = req.body.trigger_rotation || false;

        if (isLimitDetected) {
            const oldKeyPreview = apiKeys[global.currentKeyIndex] ? apiKeys[global.currentKeyIndex].substring(0, 8) : 'UNKNOWN';
            
            // GESER INDEKS KE API KEY CADANGAN BERIKUTNYA
            // Menggunakan modulus (%) agar ketika indeks berada di akhir array, otomatis kembali ke 0
            global.currentKeyIndex = (global.currentKeyIndex + 1) % apiKeys.length;
            
            const newKeyPreview = apiKeys[global.currentKeyIndex] ? apiKeys[global.currentKeyIndex].substring(0, 8) : 'UNKNOWN';

            console.error("\n🔄 ========================================================");
            console.error(`🚨 [ROTATOR ACTIVE] Deteksi Limit Kuota pada Key [${oldKeyPreview}...]`);
            console.error(`👉 Sistem otomatis mengalihkan jalur ke Key cadangan: [${newKeyPreview}...]`);
            console.error("========================================================\n");
            
            return res.json({ success: true, message: 'API Key berhasil dirotasi di sisi backend.' });
        }

        try {
            // Mengambil baris data instruksi dan basis pengetahuan aktual dari database Supabase
            const { data: config, error } = await supabase
                .from('ai_config')
                .select('system_instruction, knowledge_base')
                .eq('id', 1)
                .maybeSingle();

            if (error) throw error;

            // ===================================================================
            // SINKRONISASI INSTRUKSI DEFAULT (BENTENG UTAMA JIKA DB ERROR/KOSONG)
            // ===================================================================
            const defaultInstruction = 
                'Anda adalah agen AI resmi Beasiswa Berani Cerdas. Tugas Anda HANYA menjawab berdasarkan basis pengetahuan yang disuntikkan.\n\n' +
                'ATURAN MUTLAK:\n' +
                'Jika pertanyaan pengguna sama sekali tidak berhubungan dengan Beasiswa Berani Cerdas (seperti resep masakan, pemrograman, kuliah umum, politik, dll.), Anda WAJIB membalas dengan format persis seperti ini:\n' +
                '"[OUT_OF_SCOPE] Maaf, pertanyaan Anda berada di luar ruang lingkup informasi resmi Beasiswa Berani Cerdas. Pertanyaan ini telah otomatis kami teruskan ke tim admin untuk ditinjau lebih lanjut."';

            const defaultKnowledge = 
                'Beasiswa Berani Cerdas merupakan program bantuan dana biaya pendidikan strategis bagi mahasiswa aktif yang berasal dari Provinsi Sulawesi Tengah.';

            // ===================================================================
            // TEKNIK INJEKSI PAKSA: KUNCI ATURAN KONTEKS KE DALAM MEMORI PENGETAHUAN
            // ===================================================================
            const finalInstruction = config?.system_instruction || defaultInstruction;
            
            const finalKnowledge = 
                `[ATURAN UTAMA PERILAKU ASSISTANT AI]:\n` +
                `${finalInstruction}\n\n` +
                `================================================================================\n` +
                `=== DOKUMEN PENGETAHUAN RESMI (KNOWLEDGE BASE) ===\n` +
                `================================================================================\n` +
                `${config?.knowledge_base || defaultKnowledge}`;

            // Mengembalikan respons JSON terstruktur ke sistem gateway pembaca OpenClaw
            // Sekarang membawa properti active_api_key hasil rotasi dinamis!
            return res.json({
                success: true,
                system_instruction: finalInstruction,
                knowledge_base: finalKnowledge,
                model_target: 'gemini-2.0-flash-lite', // Memastikan target terkunci mantap di versi 2.0
                active_api_key: apiKeys[global.currentKeyIndex] // Mengirim token aktif ke sistem OpenClaw
            });
        } catch (err) {
            console.error('Gagal sinkronisasi data ke OpenClaw:', err.message);
            return res.status(500).json({ success: false, message: 'OpenClaw API Error.' });
        }
    });
}

module.exports = registerApiRoutes;