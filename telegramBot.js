const { Telegraf } = require('telegraf');

function initTelegramBot(token) {
    if (!token) {
        console.warn('⚠️ Telegram token kosong, bot Telegram tidak diinisialisasi dengan token asli.');
        return new Telegraf('123456789:PlaceholderTokenUntukMencegahErorCrash');
    }
    return new Telegraf(token);
}

function setupBotHandlers(botInstance, db) {
    if (!botInstance) return;

    // 1. Handler Perintah /start
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

        ctx.replyWithMarkdown(
            `Selamat Datang *${firstName}* di Bot Resmi Beasiswa Berani Cerdas! 🎓\n\n` +
            `Silakan ajukan pertanyaan Anda langsung di sini. AI akan menjawab secara otomatis berdasarkan basis pengetahuan resmi.`
        );
    });

    // 2. Handler Perintah /help
    botInstance.help((ctx) => ctx.replyWithMarkdown('Kirim pertanyaan seputar informasi pendaftaran beasiswa secara langsung.'));

    // ====================================================================
    // 3. HANDLER UTAMA PESAN TEKS (INTEGRASI GEMINI + STRICT CONTEXT + ERROR 429)
    // ====================================================================
    botInstance.on('text', async (ctx) => {
        const userMessage = ctx.message.text;
        const chatId = ctx.chat.id;
        const username = ctx.from.username || 'Tanpa Username';
        const firstName = ctx.from.first_name || 'User';

        try {
            let knowledgeBaseText = '';

            // Ambil data Knowledge Base yang terstruktur dari Supabase
            if (db) {
                const { data, error } = await db.from('ai_config').select('knowledge_base').single();
                if (!error && data) {
                    knowledgeBaseText = data.knowledge_base;
                }
            }

            // ----------------------------------------------------------------
            // TEMPAT PEMANGGILAN SDK GEMINI ASLI KAMU (Simulasi & Injeksi Prompt)
            // ----------------------------------------------------------------
            // Di dalam pemanggilan asli kalian nanti, pastikan system instruction
            // atau prompt mewajibkan AI menyertakan teks "[OUT_OF_SCOPE]" jika 
            // pertanyaan mendeteksi topik di luar Beasiswa Berani Cerdas[cite: 2].
            //
            // Contoh implementasi respon teks dari model google/gemini-2.0-flash-lite:
            let replyText = "Fitur AI berhasil merespons pesan."; 
            
            // Catatan: Jika kalian mengetes pertanyaan di luar konteks (misal: "cara masak mi"),
            // pastikan backend/AI kalian mengembalikan string seperti di bawah ini:[cite: 2]
            // replyText = "[OUT_OF_SCOPE] Maaf, pertanyaan Anda berada di luar ruang lingkup informasi resmi Beasiswa Berani Cerdas. Pertanyaan ini telah otomatis kami teruskan ke tim admin untuk ditinjau lebih lanjut.";

            // 🔍 VALIDASI CEK PAKAI INDEKS KONTEKS[cite: 2]
            if (replyText.includes("[OUT_OF_SCOPE]")) {
                // Hapus tag rahasia [OUT_OF_SCOPE] sebelum dikirim ke pendaftar di Telegram agar rapi
                const cleanReply = replyText.replace("[OUT_OF_SCOPE]", "").trim();
                await ctx.reply(cleanReply);

                // Jalankan Aksi Otomatis: Forward data pertanyaan ke tabel admin_tickets di Supabase[cite: 2]
                if (db) {
                    try {
                        await db.from('admin_tickets').insert({
                            chat_id: chatId.toString(),
                            sender_name: `${firstName} (@${username})`,
                            user_question: userMessage,
                            status: 'pending',
                            created_at: new Date()
                        });
                        console.log(`📌 [FORWARD SUCCESS] Pertanyaan luar konteks dari ${firstName} berhasil diteruskan ke Supabase![cite: 2]`);
                    } catch (dbErr) {
                        console.error('⚠️ Gagal memasukkan data tiket ke Supabase:', dbErr.message);
                    }
                }

            } else {
                // Jika pertanyaan seputar beasiswa, kirim balasan normal dari AI ke user Telegram
                await ctx.reply(replyText);
            }

        } catch (error) {
            // ================================================================
            // DETEKSI OTOMATIS: JIKA API GEMINI HABIS KUOTA / LIMIT (429)[cite: 1]
            // ================================================================
            if (error.status === 429 || (error.message && error.message.includes("RESOURCE_EXHAUSTED"))) {
                
                // Menggunakan string biasa yang lurus tanpa terputus barisnya
                console.error("\n========================================================");
                console.error("🚨 [PERINGATAN SISTEM] API GEMINI SUDAH MENCAPAI LIMIT!");
                console.error("👉 Kuota harian gratis pada akun Google AI Studio ini telah habis.");
                console.error("👉 MODEL TERDAMPAK: google/gemini-2.5-flash-lite");
                console.error("👉 TINDAKAN: Buka file .env / OpenClaw untuk mengganti API Key baru.");
                console.error("========================================================\n");

                // Menggunakan Template Literals (tanda backtick ` `) agar aman saat menulis teks panjang berbaris
                await ctx.reply(
                    `⚠️ Sistem Beasiswa Berani Cerdas saat ini sedang menerima antrean yang sangat padat (Limit Kuota Terbaca). \n\n` +
                    `Mohon mencoba kembali beberapa saat lagi atau hubungi pihak administrator teknis kami.`
                );

            } else {
                // Menangani kendala teknis non-limit lainnya (misal kegagalan koneksi database)
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