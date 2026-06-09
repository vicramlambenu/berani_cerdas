const { Telegraf } = require('telegraf');
const axios = require('axios'); 

function initTelegramBot(token) {
    if (!token) {
        console.warn('⚠️ Telegram token kosong, bot Telegram tidak diinisialisasi dengan token asli.');
        return new Telegraf('123456789:PlaceholderTokenUntukMencegahErorCrash');
    }
    return new Telegraf(token);
}

function setupBotHandlers(botInstance, db) {
    if (!botInstance) return;

    // ====================================================================
    // 1. HANDLER PERINTAH /START (DENGAN INLINE KEYBOARD FAQ INSTAN)
    // ====================================================================
    botInstance.start(async (ctx) => {
        const chatId = ctx.chat.id;
        const firstName = ctx.from.first_name || 'User';

        try {
            if (db) {
                await db.from('subscribers').upsert({ chat_id: chatId.toString(), username: ctx.from.username || '' });
            }
        } catch (err) {
            console.error('Gagal simpan subscriber:', err.message);
        }

        return ctx.replyWithMarkdown(
            `Selamat Datang *${firstName}* di Bot Resmi Beasiswa Berani Cerdas! 🎓\n\n` +
            `Silakan ajukan pertanyaan Anda langsung di sini. AI akan menjawab secara otomatis berdasarkan basis pengetahuan resmi.\n\n` +
            `Atau, Anda bisa klik salah satu *Pertanyaan Umum (FAQ)* di bawah ini untuk mendapatkan jawaban instan langsung dari sistem:`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📋 Apa saja syarat pendaftaran?', callback_data: 'faq_syarat' }],
                        [{ text: '⏳ Kapan batas akhir pendaftaran?', callback_data: 'faq_deadline' }],
                        [{ text: '💰 Berapa total dana beasiswanya?', callback_data: 'faq_dana' }],
                        [{ text: '📞 Hubungi Admin Utama', callback_data: 'faq_admin' }]
                    ]
                }
            }
        );
    });

    // ====================================================================
    // 2. HANDLER PERINTAH /HELP
    // ====================================================================
    botInstance.help((ctx) => ctx.replyWithMarkdown('Kirim pertanyaan seputar informasi pendaftaran beasiswa secara langsung.'));

    // ====================================================================
    // 3. HANDLER UNTUK MERESPONS KLIK TOMBOL FAQ (BYPASS AI - 100% GRATIS TOKEN)
    // ====================================================================
    botInstance.action('faq_syarat', async (ctx) => {
        await ctx.answerCbQuery();
        return ctx.replyWithMarkdown(
            `📌 *SYARAT UTAMA PENDAFTARAN BEASISWA BERANI CERDAS:*\n\n` +
            `1. Mahasiswa aktif D3/D4/S1 (Minimal sedang menempuh semester 2, maksimal semester 8).\n` +
            `2. Memiliki Kartu Tanda Penduduk (KTP) asli Provinsi *Sulawesi Tengah*.\n` +
            `3. IPK minimal 3.00 dibuktikan dengan Lembar Transkrip Nilai resmi.\n` +
            `4. Tidak sedang menerima bantuan beasiswa aktif dari instansi atau lembaga lain.`
        );
    });

    botInstance.action('faq_deadline', async (ctx) => {
        await ctx.answerCbQuery();
        return ctx.replyWithMarkdown(
            `⏳ *BATAS WAKTU PROGRAM BEASISWA:*\n\n` +
            `Pendaftaran berkas digital gelombang saat ini dibuka hingga tanggal *31 Juli 2026*.\n` +
            `Sangat disarankan untuk mengunggah dokumen sebelum batas akhir demi menghindari kepadatan server.`
        );
    });

    botInstance.action('faq_dana', async (ctx) => {
        await ctx.answerCbQuery();
        return ctx.replyWithMarkdown(
            `💰 *ALOKASI DANA BANTUAN BIAYA PENDIDIKAN:*\n\n` +
            `Pendaftar yang dinyatakan lulus seleksi akhir akan menerima dana stimulan pendidikan sebesar *Rp 6.000.000,- per semester* yang disalurkan langsung ke rekening virtual mahasiswa.`
        );
    });

    botInstance.action('faq_admin', async (ctx) => {
        await ctx.answerCbQuery();
        return ctx.replyWithMarkdown(
            `📞 *LAYANAN BANTUAN MANUAL (HELP-DESK):*\n\n` +
            `Jika memiliki kendala teknis sistem di luar kemampuan AI, silakan hubungi kesekretariatan resmi kami di:\n\n` +
            `• 📨 Alamat Email: admin@beranicerdas.id\n` +
            `• 📱 Telegram Utama Admin: @kepala_admin\n` +
            `• 🏢 Kantor: Gedung Dinas Pendidikan dan Kebudayaan Daerah Sulteng, Kota Palu.`
        );
    });

    // ====================================================================
    // 3B. BYPASS SAPAAN RAMAH (ANTI MASUK TIKET OUT-OF-SCOPE ADMIN)
    // ====================================================================
    botInstance.hears(/^(halo|hai|selamat pagi|selamat siang|selamat sore|selamat malam|p|assalamualaikum|permisi)/i, (ctx) => {
        const firstName = ctx.from.first_name || 'User';
        return ctx.replyWithMarkdown(
            `Halo juga *${firstName}*! 👋 Ada yang bisa saya bantu terkait informasi resmi Beasiswa Berani Cerdas Provinsi Sulawesi Tengah?\n\n` +
            `Silakan ketik pertanyaan spesifik Anda atau langsung klik salah satu menu tombol FAQ di atas ya!`
        );
    });

    // ====================================================================
    // 4. HANDLER UTAMA PESAN TEKS (JIKA USER MENGETIK MANUAL -> DIJAWAB OLEH AI)
    // ====================================================================
    botInstance.on('text', async (ctx) => {
        const userMessage = ctx.message.text;
        const chatId = ctx.chat.id;
        const username = ctx.from.username || 'Tanpa Username';
        const firstName = ctx.from.first_name || 'User';

        // 🚨 PROTEKSI ANTI-LEAKAGE: Mencegah pembacaan berkas identitas sistem
        if (userMessage.toLowerCase().includes('profile') || userMessage.toLowerCase().includes('profil')) {
            return ctx.reply("Maaf, informasi profil personal tidak tersedia di sistem ini. Silakan ajukan pertanyaan seputar informasi resmi Beasiswa Berani Cerdas.");
        }

        await ctx.sendChatAction('typing');

        try {
            let systemInstructionText = '';
            let knowledgeBaseText = '';

            // 1. Ambil Data Aturan Sistem & Basis Pengetahuan Terupdate dari Supabase
            if (db) {
                const { data, error } = await db
                    .from('ai_config')
                    .select('system_instruction, knowledge_base')
                    .eq('id', 1)
                    .maybeSingle();
                
                if (!error && data) {
                    systemInstructionText = data.system_instruction;
                    knowledgeBaseText = data.knowledge_base;
                }
            }

            // 2. PROSES KONEKSI KE ENGINE OPENCLAW / GOOGLE GEMINI API
            let replyText = '';
            
            try {
                const aiResponse = await axios.post('http://localhost:3000/api/ai-chat', {
                    message: userMessage,
                    system_instruction: systemInstructionText,
                    knowledge_base: knowledgeBaseText,
                    history: []
                });
                
                if (aiResponse.data && aiResponse.data.success) {
                    replyText = aiResponse.data.reply || aiResponse.data.message || aiResponse.data.text || "";
                }
            } catch (aiErr) {
                if (aiErr.response && aiErr.response.status === 429) {
                    throw aiErr.response; 
                }

                console.warn("⚠️ Gagal kontak OpenClaw API, menjalankan sistem pertahanan filter teks lokal.");
                
                const keywords = ['beasiswa', 'berani', 'cerdas', 'daftar', 'syarat', 'dana', 'biaya', 'sulawesi', 'tengah', 'sulteng', 'kuliah', 'pendaftaran', 'halo', 'hai', 'admin'];
                const isMatch = keywords.some(keyword => userMessage.toLowerCase().includes(keyword));
                
                if (!isMatch) {
                    replyText = "[OUT_OF_SCOPE]";
                } else {
                    replyText = "Terima kasih atas pertanyaan Anda mengenai Beasiswa Berani Cerdas. Saat ini server sinkronisasi memori utama kami sedang sibuk, mohon hubungi admin melalui menu bantuan.";
                }
            }

            // 3. VALIDASI FILTER CONTEXT & PENGALIHAN LOG OTOMATIS
            if (replyText.includes("[OUT_OF_SCOPE]") || replyText.trim() === "") {
                
                const cleanReply = replyText.replace("[OUT_OF_SCOPE]", "").trim() || 
                    "Maaf, pertanyaan Anda berada di luar ruang lingkup informasi resmi Beasiswa Berani Cerdas. Pertanyaan ini telah otomatis kami teruskan ke tim admin untuk ditinjau lebih lanjut.";
                
                await ctx.reply(cleanReply);

                if (db) {
                    try {
                        // 👥 3A. LOGIKA OTOMATIS PEMBAGIAN KUOTA TIKET (LOAD-BALANCER)
                        // Ambil daftar admin yang memiliki role 'admin' (Staff biasa)
                        const { data: daftarStaff } = await db
                            .from('admins')
                            .select('username')
                            .eq('role', 'admin');

                        let staffDitugaskan = null;

                        if (daftarStaff && daftarStaff.length > 0) {
                            // Pilih satu staff secara acak (Round-Robin Randomization)
                            const indexAcak = Math.floor(Math.random() * daftarStaff.length);
                            staffDitugaskan = daftarStaff[indexAcak].username;
                        }

                        // 3B. Memasukkan data tiket baru lengkap dengan penanggung jawab staff
                        await db.from('admin_tickets').insert({
                            chat_id: chatId.toString(),
                            sender_name: `${firstName} (@${username})`,
                            user_question: userMessage,
                            status: 'pending',
                            assigned_to: staffDitugaskan, // ──► SUNTIKKAN USERNAME STAFF OTOMATIS KE DATABASE
                            created_at: new Date()
                        });
                        
                        console.log("\n--------------------------------------------------------");
                        console.log(`💡 [LOG FILTER AI] User [${firstName}] bertanya di luar konteks!`);
                        console.log(`💬 Isi Pertanyaan : "${userMessage}"`);
                        console.log(`🎯 Ditugaskan ke  : Admin Staff [${staffDitugaskan || 'Belum Ada Staff'}]`);
                        console.log(`➡️  Tindakan Sistem: Otomatis mengisolasi data dan meneruskan ke Supabase.`);
                        console.log("--------------------------------------------------------\n");

                    } catch (dbErr) {
                        console.error('⚠️ Gagal memasukkan data tiket ke Supabase:', dbErr.message);
                    }
                }

            } else {
                await ctx.reply(replyText);
            }

        } catch (error) {
            // DETEKSI KUOTA HABIS (429) & ROTASI API KEY AUTOMATIC
            if (error.status === 429 || (error.message && error.message.includes("RESOURCE_EXHAUSTED"))) {
                
                console.error("\n========================================================");
                console.error("🚨 [PERINGATAN SISTEM] API GEMINI SUDAH MENCAPAI LIMIT! (429)");
                console.error("👉 Menembak sinyal rotasi otomatis ke sistem failover backend...");
                console.error("========================================================\n");

                try {
                    await axios.post('http://localhost:3000/api/ai-chat', { trigger_rotation: true });
                } catch (rotErr) {
                    console.error("⚠️ Gagal mengirim sinyal rotasi ke rotator:", rotErr.message);
                }

                await ctx.reply(
                    `⚠️ Sistem Beasiswa Berani Cerdas baru saja melakukan optimalisasi dan pengalihan jalur server otomatis.\n\n` +
                    `Silakan kirim ulang pesan Anda barusan, AI siap melayani Anda kembali tanpa gangguan! 🔄✨`
                );

            } else {
                console.error('Error pada pemrosesan bot Telegram:', error.message);
                await ctx.reply("⚠️ Terjadi kendala teknis internal saat memproses jawaban Anda. Mohon coba beberapa saat lagi.");
            }
        }
    });
}

module.exports = {
    initTelegramBot,
    setupBotHandlers
};