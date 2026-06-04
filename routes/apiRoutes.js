/**
 * registerApiRoutes - Mengatur endpoint API internal untuk sinkronisasi webhook Telegram 
 * dan konfigurasi jembatan instruksi/basis pengetahuan kecerdasan buatan (OpenClaw)
 */
function registerApiRoutes(app, supabase, bot) {
    
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
    // 2. ENDPOINT CONFIGURATION SYNC (DIPANGGIL OLEH ENGINE AI)
    // ===================================================================
    app.post('/api/ai-chat', async (req, res) => {
        if (!supabase) {
            return res.status(500).json({ success: false, message: 'Database belum terkonfigurasi.' });
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
                '================================================================================\n' +
                '=== PROFIL PROGRAM BEASISWA BERANI CERDAS ===\n' +
                '================================================================================\n' +
                'Beasiswa Berani Cerdas merupakan program bantuan dana biaya pendidikan strategis bagi mahasiswa aktif yang berasal dari Provinsi Sulawesi Tengah.';

            // Mengembalikan respons JSON terstruktur ke sistem gateway pembaca
            return res.json({
                success: true,
                system_instruction: config?.system_instruction || defaultInstruction,
                knowledge_base: config?.knowledge_base || defaultKnowledge,
                model_target: 'gemini-2.0-flash-lite' // Memastikan target terkunci mantap di versi 2.0
            });
        } catch (err) {
            console.error('Gagal sinkronisasi data ke OpenClaw:', err.message);
            return res.status(500).json({ success: false, message: 'OpenClaw API Error.' });
        }
    });
}

module.exports = registerApiRoutes;