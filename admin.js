const express = require('express');
const multer = require('multer');
const fs = require('fs');

// ==========================================
// MULTER CONFIG
// ==========================================
const upload = multer({
    dest: 'uploads/'
});

/**
 * Setup Admin Routes
 */
function setupAdminRoutes(supabase, bot) {
    const router = express.Router(); // Pindahkan ke dalam fungsi agar fresh

    // ==========================================
    // MIDDLEWARE UNTUK CHECK LOGIN
    // ==========================================
    const checkLogin = (req, res, next) => {
        if (req.session && req.session.adminLoggedIn) {
            next();
        } else {
            res.redirect('/admin/login');
        }
    };

    // ==========================================
    // LOGIN PAGE
    // ==========================================
    router.get('/login', (req, res) => {
        const error = req.query.error ? 'Password salah!' : '';
        res.render('admin/login', { error });
    });

    // ==========================================
    // DO LOGIN
    // ==========================================
    router.post('/do-login', (req, res) => {
        const { password } = req.body;
        // Pastikan ADMIN_PASSWORD sudah ada di Secrets Hugging Face
        if (password === process.env.ADMIN_PASSWORD) {
            req.session.adminLoggedIn = true;
            res.redirect('/admin');
        } else {
            res.redirect('/admin/login?error=1');
        }
    });

    // ==========================================
    // DASHBOARD
    // ==========================================
    router.get('/', checkLogin, async (req, res) => {
        try {
            const { data: users, error } = await supabase
                .from('subscribers')
                .select('*');

            if (error) throw error;
            res.render('admin/dashboard', { users });
        } catch (err) {
            console.log(err);
            res.send("Gagal mengambil data user: " + err.message);
        }
    });

    // ==========================================
    // BROADCAST
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
                    await bot.telegram.sendMessage(
                        user.chat_id,
                        `📢 *INFO TERBARU*\n\n${pesan}`,
                        { parse_mode: 'Markdown' }
                    );

                    if (req.file) {
                        await bot.telegram.sendDocument(user.chat_id, {
                            source: fs.createReadStream(req.file.path),
                            filename: req.file.originalname
                        });
                    }
                    success++;
                    await new Promise(r => setTimeout(r, 1500)); // Anti-spam
                } catch (err) {
                    failed++;
                    console.log("Gagal kirim ke:", user.chat_id);
                }
            }

            if (req.file) fs.unlinkSync(req.file.path);

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
    // LOGOUT
    // ==========================================
    router.get('/logout', (req, res) => {
        req.session.destroy(() => res.redirect('/admin/login'));
    });

    return router;
}

// EKSPOR FUNGSI
module.exports = setupAdminRoutes;