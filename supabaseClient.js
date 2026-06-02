const { createClient } = require('@supabase/supabase-js');
const { SUPABASE_URL, SUPABASE_KEY } = require('./config');

function createSupabaseClient() {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.error('⚠️ Supabase Client gagal diinisialisasi karena URL/KEY kosong.');
        return null;
    }
    return createClient(SUPABASE_URL, SUPABASE_KEY);
}

const supabase = createSupabaseClient();

module.exports = {
    supabase,
    createSupabaseClient
};
