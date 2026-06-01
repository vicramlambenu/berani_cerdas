const express = require('express');
const multer = require('multer');

// ==========================================
// MULTER CONFIG (Pindah ke MemoryStorage agar tidak crash di Vercel)
// ==========================================
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

/**
 * Setup Admin Routes (Mendukung Multi-role, Log Sistem, dan Knowledge Base AI)
 */
function setupAdminRoutes(supabase, bot, catatLog) {
    const router = express.Router(); 

    // ==========================================
    // MIDDLEWARE UNTUK CHECK LOGIN & USER DATA
    // ==========================================
    const checkLogin = (req, res, next) => {
        if (req.session && req.session.adminLoggedIn) {
            next();
        } else {
            res.redirect('/admin/login');
        }
    };

    // Middleware khusus untuk membatasi fitur Kepala Admin
    const hanyaKepalaAdmin = (req, res, next) => {
        if (req.session.adminRole === 'kepala admin') {
            next();
        } else {
            res.status(403).send("Akses Ditolak: Hanya Akun Kepala Admin yang memiliki otoritas ini.");
        }
    };

    // ==========================================
    // LOGIN PAGE
    // ==========================================
    router.get('/login', (req, res) => {
        const error = req.query.error ? 'Username atau Password salah!' : '';
        res.render('admin/login', { error });
    });

    // ==========================================
    // DO LOGIN (Menembak ke tabel 'admins' yang valid)
    // ==========================================
    router.post('/do-login', async (req, res) => {
        const { username, password } = req.body;
        
        try {
            // Memastikan pencarian mengarah ke tabel 'admins' sesuai data asli di Supabase
            const { data: admin, error } = await supabase
                .from('admins')
                .select('*')
                .eq('username', username)
                .eq('password', password)
                .maybeSingle();

            if (error) throw error;

            if (admin) {
                // Menyimpan informasi akun admin ke dalam session data
                req.session.adminLoggedIn = true;
                req.session.adminUser = admin.username;
                req.session.adminRole = admin.role; // 'kepala admin' atau 'admin'

                // 📜 CATAT LOG: Merekam riwayat login sukses operator ke database
                if (catatLog) {
                    await catatLog(admin.username, admin.role, 'Melakukan Login Ke Panel Admin');
                }

                res.redirect('/admin');
            } else {
                res.redirect('/admin/login?error=1');
            }
        } catch (err) {
            console.error("Login Error:", err.message);
            res.redirect('/admin/login?error=1');
        }
    });

    // ==========================================
    // DASHBOARD MAIN VIEW
    // ==========================================
    router.get('/', checkLogin, async (req, res) => {
        try {
            const { data: users, error } = await supabase
                .from('subscribers')
                .select('*');

            if (error) throw error;
            
            // Melemparkan data user session agar tampilan menu di dashboard.ejs bisa dinamis
            res.render('admin/dashboard', { 
                users, 
                adminUser: req.session.adminUser, 
                adminRole: req.session.adminRole 
            });
        } catch (err) {
            console.log(err);
            res.send("Gagal mengambil data user: " + err.message);
        }
    });

    // ==========================================
    // BROADCAST TELEGRAM
    // ==========================================
    router.post('/broadcast', checkLogin, upload.single('file'), async (req, res) => {
        const { pesan, target_chat_id } = req.body;
        try {
            let users;
            if (target_chat_id) {
                users = [{ chat_id: target_chat_id }];
            } else {
                const { data, error } = await supabase.from('subscribers').select('chat_id');
                if (error) throw error;
                users = data;
            }

            let success = 0;
            let failed = 0;

            for (const user of users) {
                try {
                    if (bot && bot.telegram) {
                        await bot.telegram.sendMessage(
                            user.chat_id,
                            `📢 *INFO TERBARU*\n\n${pesan}`,
                            { parse_mode: 'Markdown' }
                        );

                        if (req.file) {
                            await bot.telegram.sendDocument(user.chat_id, {
                                source: req.file.buffer,
                                filename: req.file.originalname
                            });
                        }
                        success++;
                    }
                    await new Promise(r => setTimeout(r, 1500));
                } catch (err) {
                    failed++;
                    console.log("Gagal kirim ke:", user.chat_id, err.message);
                }
            }

            // 📜 CATAT LOG AUDIT BROADCAST
            if (catatLog) {
                await catatLog(
                    req.session.adminUser, 
                    req.session.adminRole, 
                    `Mengirim pesan Broadcast ke ${success} pengguna Telegram (Gagal: ${failed})`
                );
            }

            res.render('admin/broadcast-result', {
                success,
                failed,
                users,
                successRate: users.length > 0 ? Math.round((success / users.length) * 100) : 0
            });
        } catch (err) {
            console.log(err);
            res.render('admin/broadcast-error');
        }
    });

    // ==========================================
    // ⚙️ VIEW EDIT KNOWLEDGE BASE AI
    // ==========================================
    router.get('/ai-config', checkLogin, async (req, res) => {
        try {
            const { data: config, error } = await supabase
                .from('ai_config')
                .select('*')
                .eq('id', 1)
                .single();

            if (error) throw error;

            res.render('admin/ai-config', { 
                config, 
                adminUser: req.session.adminUser, 
                adminRole: req.session.adminRole 
            });
        } catch (err) {
            res.status(500).send("Gagal memuat basis pengetahuan AI: " + err.message);
        }
    });

    // ==========================================
    // 💾 PROSES SIMPAN KNOWLEDGE BASE AI
    // ==========================================
    router.post('/ai-config/save', checkLogin, async (req, res) => {
        const { system_instruction, knowledge_base } = req.body;
        
        try {
            const { error } = await supabase
                .from('ai_config')
                .update({ 
                    system_instruction, 
                    knowledge_base,
                    updated_at: new Date()
                })
                .eq('id', 1);

            if (error) throw error;

            // 📜 CATAT LOG MODIFIKASI AI
            if (catatLog) {
                await catatLog(
                    req.session.adminUser, 
                    req.session.adminRole, 
                    `Memperbarui System Instruction & Knowledge Base AI Gemini`
                );
            }

            res.redirect('/admin/ai-config?success=1');
        } catch (err) {
            res.status(500).send("Gagal memperbarui konfigurasi AI: " + err.message);
        }
    });

    // ==========================================
    // 📋 VIEW TABEL LOG SISTEM (Hanya Kepala Admin)
    // ==========================================
    router.get('/logs', checkLogin, hanyaKepalaAdmin, async (req, res) => {
        try {
            const { data: logs, error } = await supabase
                .from('system_logs')
                .select('*')
                .order('waktu', { ascending: false });

            if (error) throw error;

            res.render('admin/logs', { 
                logs, 
                adminUser: req.session.adminUser, 
                adminRole: req.session.adminRole 
            });
        } catch (err) {
            res.status(500).send("Gagal mengambil data log sistem.");
        }
    });

    // ==========================================
    // LOGOUT
    // ==========================================
    router.get('/logout', checkLogin, async (req, res) => {
        try {
            if (catatLog) {
                await catatLog(req.session.adminUser, req.session.adminRole, 'Melakukan Logout dari Sistem');
            }
        } catch (err) {
            console.error(err);
        }
        req.session.destroy(() => res.redirect('/admin/login'));
    });

    return router;
}

module.exports = setupAdminRoutes;