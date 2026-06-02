require('dotenv').config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || process.env.TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SESSION_SECRET = process.env.ADMIN_PASSWORD || 'berani-cerdas-secret';
const PORT = process.env.PORT || 7860;
const NODE_ENV = process.env.NODE_ENV || 'development';

function checkRequiredEnv() {
    if (!TELEGRAM_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
        console.error('⚠️ [WARNING] Variabel lingkungan (.env) mungkin belum lengkap!');
    }
}

module.exports = {
    TELEGRAM_TOKEN,
    SUPABASE_URL,
    SUPABASE_KEY,
    SESSION_SECRET,
    PORT,
    NODE_ENV,
    checkRequiredEnv
};
