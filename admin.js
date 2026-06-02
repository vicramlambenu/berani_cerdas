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
                users: users || [], 
                adminUser: req.session.adminUser, 
                adminRole: req.session.adminRole 
            });
        } catch (err) {
            console.error(err);
            res.render('admin/dashboard', { 
                users: [], 
                adminUser: req.session.adminUser, 
                adminRole: req.session.adminRole 
            });
        }
    });

    // ==========================================
    // BROADCAST TELEGRAM (Sinkron dengan tabel broadcast_logs & system_logs)
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

            // 📜 1. CATAT KE TABEL broadcast_logs
            try {
                await supabase.from('broadcast_logs').insert({
                    operator: req.session.adminUser,
                    pesan: pesan,
                    target: target_chat_id || 'Semua Subscriber',
                    status: `Sukses: ${success}, Gagal: ${failed}`,
                    waktu: new Date()
                });
            } catch (logErr) {
                console.error("Gagal mencatat ke tabel broadcast_logs:", logErr.message);
            }

            // 📜 2. CATAT KE TABEL AUDIT UTAMA system_logs
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
    // 💾 PROSES SIMPAN KNOWLEDGE BASE AI (Dinamis ke id: 1)
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

    // ===================================================================
    // 💾 🛠️ FITUR GENERATOR EKSPOR PDF RESMI (Dinamis dari Supabase)
    // ===================================================================
    router.get('/download-log', checkLogin, hanyaKepalaAdmin, async (req, res) => {
        const PDFDocument = require('pdfkit-table');

        try {
            // 1. Ambil riwayat log audit aktual langsung dari database Supabase
            const { data: logs, error } = await supabase
                .from('system_logs')
                .select('*')
                .order('waktu', { ascending: false });

            if (error) throw error;

            // 2. Inisialisasi dokumen kertas A4
            const doc = new PDFDocument({ margin: 30, size: 'A4' });

            // Pengaturan Headers respons transmisi berkas biner PDF
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename=Laporan_Audit_Log_Berani_Cerdas.pdf');
            
            doc.pipe(res);

            // 3. DESAIN DOKUMEN (Kop Surat Formal Kepresidenan / Organisasi)
            doc.fontSize(18).font('Helvetica-Bold').text('PROGRAM BEASISWA BERANI CERDAS', { align: 'center' });
            doc.fontSize(10).font('Helvetica').text('Sekretariat Jenderal Admin Utama - Provinsi Sulawesi Tengah', { align: 'center' });
            doc.moveDown(0.5);
            doc.moveTo(30, doc.y).lineTo(565, doc.y).stroke('#4f46e5'); // Garis pembatas warna indigo
            doc.moveDown(1.5);

            doc.fontSize(13).font('Helvetica-Bold').text('LAPORAN AUDIT TRAIL AKTIVITAS SISTEM', { align: 'left' });
            doc.fontSize(9).font('Helvetica-Oblique').text(`Dieksport Oleh: ${req.session.adminUser} (${req.session.adminRole}) | Tanggal Cetak: ${new Date().toLocaleString('id-ID')}`, { align: 'left' });
            doc.moveDown(1.5);

            // 4. STRUKTUR FORMAT TABEL PDF
            const table = {
                title: "Daftar Aktivitas Log yang Terekam di Database:",
                headers: [
                    { label: "Waktu (WITA)", property: "waktu", width: 110 },
                    { label: "Operator", property: "operator", width: 90 },
                    { label: "Role", property: "role", width: 90 },
                    { label: "Deskripsi Tindakan Sistem", property: "aksi", width: 220 }
                ],
                datas: (logs || []).map(log => ({
                    waktu: new Date(log.waktu).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
                    operator: log.operator || '-',
                    role: (log.role || '-').toUpperCase(),
                    aksi: log.aksi || '-'
                }))
            };

            // Gambar tabel ke kanvas PDF
            await doc.table(table, {
                prepareHeader: () => doc.font("Helvetica-Bold").fontSize(10).fillColor("#1e293b"),
                prepareRow: (row, index, column, rowNumber, rectRow) => doc.font("Helvetica").fontSize(9).fillColor("#334155")
            });

            // 5. KOLOM VALIDASI TANDA TANGAN KEPALA ADMINISTRATOR
            doc.moveDown(3);
            if (doc.y > 700) doc.addPage(); // Buka halaman baru jika area bawah kertas sisa sedikit
            
            doc.fontSize(10).font('Helvetica').text('Mengetahui,', 400);
            doc.moveDown(2.5);
            doc.font('Helvetica-Bold').text(`${req.session.adminUser.toUpperCase()}`, 400);
            doc.font('Helvetica').text(`Kepala Administrator`, 400);

            // Tutup dan kirim aliran PDF ke browser
            doc.end();

            // 📜 Catat log aksi konversi & ekspor PDF ini ke sistem
            if (catatLog) {
                await catatLog(
                    req.session.adminUser, 
                    req.session.adminRole, 
                    'Mengeksport Berkas Dokumen Audit Log Resmi (.pdf)'
                );
            }

        } catch (err) {
            console.error("Gagal memproses ekspor PDF log:", err.message);
            if (!res.headersSent) {
                res.status(500).send("Terjadi kesalahan internal saat menyusun berkas dokumen PDF.");
            }
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