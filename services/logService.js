// 🛠️ LANGSUNG IMPORT SUPABASE DARI SOURCE UTAMA
const { supabase } = require('../supabaseClient'); 

// 🛠️ PARAMETER DIUBAH MENJADI 3 (db dihapus dari parameter karena sudah di-import di atas)
async function catatLog(operator, role, aksi) {
    // Validasi jika instance supabase gagal ter-load
    if (!supabase) {
        console.error('❌ Gagal mencatat log: Instance Supabase tidak aktif.');
        return;
    }
    
    try {
        // 🛠️ MENGGUNAKAN TABLE 'system_logs' SESUAI BAWAAN KODINGANMU
        await supabase
            .from('system_logs')
            .insert({ 
                operator, 
                role, 
                aksi,
                waktu: new Date().toISOString() // Bagus untuk timestamp audit dosen
            });
            
        console.log(`✅ [System Log] ${operator} (${role}) -> ${aksi}`);
    } catch (err) {
        console.error('❌ Gagal menyimpan audit log ke database:', err.message);
    }
}

module.exports = catatLog;