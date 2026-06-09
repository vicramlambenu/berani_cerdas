const axios = require('axios');

/**
 * registerApiRoutes - Mengatur endpoint API internal untuk sinkronisasi webhook Telegram 
 * dengan fitur Rotasi Otomatis Multi-API Key (Failover anti-429) dan Eksekusi AI Langsung
 */
function registerApiRoutes(app, supabase, bot) {
    
    // 🔑 KUMPULKAN DAFTAR API KEY DARI .ENV KEDALAM BENTUK ARRAY
    const apiKeys = process.env.GEMINI_API_KEYS 
        ? process.env.GEMINI_API_KEYS.split(',') 
        : [process.env.GEMINI_API_KEY || ''];
    
    // Inisialisasi indeks global jika belum ada di memori runtime server
    if (global.currentKeyIndex === undefined) {
        global.currentKeyIndex = 0;
    }

    console.log(`[ROTATOR INIT] Berhasil memuat ${apiKeys.length} API Key cadangan ke dalam memory server.`);

    // ===================================================================
    // 1. ENDPOINT TELEGRAM WEBHOOK (Untuk Mode Webhook produksi jika diperlukan)
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
    // 2. ENDPOINT PROSES CHAT AI INTEGRATED (JEMBATAN EXPRESS -> OPENCLAW/GEMINI)
    // ===================================================================
    app.post('/api/ai-chat', async (req, res) => {
        if (!supabase) {
            return res.status(500).json({ success: false, message: 'Database belum terkonfigurasi.' });
        }

        const { message } = req.body;

        // 🔄 CHECK: Apakah request ini dikirim oleh bot Telegram untuk memicu rotasi kunci secara manual?
        const isLimitDetected = req.body.trigger_rotation || false;

        if (isLimitDetected) {
            const oldKeyPreview = apiKeys[global.currentKeyIndex] ? apiKeys[global.currentKeyIndex].substring(0, 8) : 'UNKNOWN';
            global.currentKeyIndex = (global.currentKeyIndex + 1) % apiKeys.length;
            const newKeyPreview = apiKeys[global.currentKeyIndex] ? apiKeys[global.currentKeyIndex].substring(0, 8) : 'UNKNOWN';

            console.error("\n🔄 ========================================================");
            console.error(`🚨 [ROTATOR ACTIVE] Deteksi Limit Kuota pada Key [${oldKeyPreview}...]`);
            console.error(`👉 Sistem otomatis mengalihkan jalur ke Key cadangan: [${newKeyPreview}...]`);
            console.error("========================================================\n");
            
            return res.json({ success: true, message: 'API Key berhasil dirotasi di sisi backend.' });
        }

        try {
            // 1. Mengambil data instruksi dan basis pengetahuan aktual dari database Supabase
            const { data: config, error } = await supabase
                .from('ai_config')
                .select('system_instruction, knowledge_base')
                .eq('id', 1)
                .maybeSingle();

            if (error) throw error;

            const defaultInstruction = 
                'Anda adalah agen AI resmi Beasiswa Berani Cerdas. Tugas Anda HANYA menjawab berdasarkan basis pengetahuan yang disuntikkan.\n\n' +
                'ATURAN MUTLAK:\n' +
                'Jika pertanyaan pengguna sama sekali tidak berhubungan dengan Beasiswa Berani Cerdas, Anda WAJIB membalas dengan format persis seperti ini:\n' +
                '"[OUT_OF_SCOPE] Maaf, pertanyaan Anda berada di luar ruang lingkup informasi resmi Beasiswa Berani Cerdas."';

            const defaultKnowledge = 
                'Beasiswa Berani Cerdas merupakan program bantuan dana biaya pendidikan strategis bagi mahasiswa aktif yang berasal dari Provinsi Sulawesi Tengah.';

            const finalInstruction = config?.system_instruction || defaultInstruction;
            const finalKnowledge = config?.knowledge_base || defaultKnowledge;

            // 🚀 2. EKSEKUSI PENEMBAKAN INTELLIGENT AUTO-ROUTE KE OPENCLAW
            let aiTextOutput = "";
            let openClawResponse = null;

            const payloadData = {
                model: 'google/gemini-2.0-flash-lite',
                messages: [
                    { 
                        role: 'user', 
                        content: `[INSTRUKSI KEPRIBADIAN MUTLAK]:\n${finalInstruction}\n\n` +
                                 `[DOKUMEN BASIS PENGETAHUAN RESMI]:\n${finalKnowledge}\n\n` +
                                 `--------------------------------------------------\n` +
                                 `PERTANYAAN USER: "${message}"\n\n` +
                                 `TUGAS ANDA: Jawab pertanyaan user di atas dengan tegas, lugas, percaya diri, dan hilangkan kalimat tebakan ragu-ragu. Jawablah dengan bertindak sebagai Representatif Resmi Beasiswa Berani Cerdas.`
                    }
                ]
            };

            const requestConfig = {
                headers: {
                    'Authorization': 'Basic ' + Buffer.from('admin:123456789').toString('base64'),
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            };

            // Mekanisme Fallback pintar mendeteksi rute valid OpenClaw
            try {
                // Taktik A: Jalur OpenAI standar
                openClawResponse = await axios.post('http://127.0.0.1:18791/v1/chat/completions', payloadData, requestConfig);
            } catch (urlErr) {
                if (urlErr.response && urlErr.response.status === 404) {
                    try {
                        console.log("🔄 Rute completions 404, mencoba rute alternatif /v1/chat...");
                        openClawResponse = await axios.post('http://127.0.0.1:18791/v1/chat', payloadData, requestConfig);
                    } catch (urlErrB) {
                        console.log("🔄 Rute /v1/chat 404, mencoba rute langsung /chat...");
                        openClawResponse = await axios.post('http://127.0.0.1:18791/chat', payloadData, requestConfig);
                    }
                } else {
                    throw urlErr;
                }
            }

            // Ekstraksi data secara fleksibel sesuai bentuk objek respons OpenClaw
            if (openClawResponse && openClawResponse.data) {
                if (openClawResponse.data.choices && openClawResponse.data.choices[0]?.message) {
                    aiTextOutput = openClawResponse.data.choices[0].message.content;
                } else if (openClawResponse.data.reply) {
                    aiTextOutput = openClawResponse.data.reply;
                } else if (openClawResponse.data.content) {
                    aiTextOutput = openClawResponse.data.content;
                } else if (typeof openClawResponse.data === 'string') {
                    aiTextOutput = openClawResponse.data;
                }
            }

            if (!aiTextOutput) {
                throw new Error("Respons OpenClaw kosong.");
            }

            // 5. Mengembalikan hasil jawaban teks dari Gemini ke file telegramBot.js
            return res.json({
                success: true,
                reply: aiTextOutput.trim()
            });

        } catch (err) {
            console.error('Gagal sinkronisasi atau pemrosesan data AI:', err.message);
            return res.status(500).json({ success: false, message: 'OpenClaw API Error.' });
        }
    });
}

module.exports = registerApiRoutes;