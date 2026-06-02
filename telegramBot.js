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
            `Silakan ajukan pertanyaan Anda langsung di sini. AI OpenClaw akan menjawab secara otomatis berdasarkan basis pengetahuan terbaru!`
        );
    });

    botInstance.help((ctx) => ctx.replyWithMarkdown('Kirim pertanyaan seputar informasi pendaftaran beasiswa secara langsung.'));
}

module.exports = {
    initTelegramBot,
    setupBotHandlers
};
