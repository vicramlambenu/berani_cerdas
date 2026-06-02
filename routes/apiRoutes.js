function registerApiRoutes(app, supabase, bot) {
    app.post('/api/telegram-webhook', async (req, res) => {
        try {
            if (bot) await bot.handleUpdate(req.body);
            res.status(200).send('OK');
        } catch (err) {
            console.error('Telegram webhook error:', err.message);
            res.status(200).send('OK');
        }
    });

    app.post('/api/ai-chat', async (req, res) => {
        if (!supabase) {
            return res.status(500).json({ success: false, message: 'Database belum terkonfigurasi.' });
        }

        try {
            const { data: config, error } = await supabase
                .from('ai_config')
                .select('system_instruction, knowledge_base')
                .eq('id', 1)
                .maybeSingle();

            if (error) throw error;

            const defaultInstruction = 'Kamu adalah AI resmi Beasiswa Berani Cerdas. Jawablah dengan ramah, sopan, dan informatif.';
            const defaultKnowledge = 'Beasiswa Berani Cerdas merupakan program bantuan dana pendaftaran bagi pendaftar umum yang memenuhi kriteria.';

            return res.json({
                success: true,
                system_instruction: config?.system_instruction || defaultInstruction,
                knowledge_base: config?.knowledge_base || defaultKnowledge,
                model_target: 'gemini-2.0-flash-lite'
            });
        } catch (err) {
            console.error('Gagal sinkronisasi data ke OpenClaw:', err.message);
            return res.status(500).json({ success: false, message: 'OpenClaw API Error.' });
        }
    });
}

module.exports = registerApiRoutes;
