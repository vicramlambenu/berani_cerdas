const express = require('express');
const multer = require('multer');

// ===================================================================
// MULTER CONFIG (Menggunakan MemoryStorage agar aman dari crash di Vercel)
// ===================================================================
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

/**
 * Setup Admin Routes (Mendukung Multi-role, Log Sistem, Knowledge Base AI, Tiket Pengaduan, Tambah Staff, dan Pantauan Kuota API)
 */
function setupAdminRoutes(supabase, bot, catatLog) {
    const router = express.Router(); 

    // ===================================================================
    // MIDDLEWARE UNTUK CHECK LOGIN & USER DATA
    // ===================================================================
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

    // ===================================================================
    // LOGIN PAGE
    // ===================================================================
    router.get('/login', (req, res) => {
        const error = req.query.error ? 'Username atau Password salah!' : '';
        res.render('admin/login', { error });
    });

    // ===================================================================
    // DO LOGIN (Mencocokkan ke tabel 'admins' di database Supabase)
    // ===================================================================
    router.post('/do-login', async (req, res) => {
        const { username, password } = req.body;
        
        try {
            const { data: admin, error } = await supabase
                .from('admins')
                .select('*')
                .eq('username', username)
                .eq('password', password)
                .maybeSingle();

            if (error) throw error;

            if (admin) {
                // Menyimpan data informasi hak akses ke dalam session
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

    // ===================================================================
    // DASHBOARD MAIN VIEW (Menghitung Statistik & Status API Key Rotator)
    // ===================================================================
    router.get('/', checkLogin, async (req, res) => {
        try {
            // 1. Mengambil data subscribers dari Telegram yang terdaftar
            const { data: users, error: userErr } = await supabase
                .from('subscribers')
                .select('*');

            if (userErr) throw userErr;

            // 2. QUERY: Hitung jumlah antrean tiket pending dari pertanyaan luar konteks
            const { count: pendingTicketsCount, error: ticketErr } = await supabase
                .from('admin_tickets')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pending');

            if (ticketErr) {
                console.error("Gagal menghitung statistik tiket:", ticketErr.message);
            }

            // 🔑 3. PARSING DATA ROTASI API KEY UNTUK DIKIRIM KE DASHBOARD VISUAL
            const totalKeys = process.env.GEMINI_API_KEYS ? process.env.GEMINI_API_KEYS.split(',').length : 1;
            
            // Membaca index penunjuk global secara aman, default ke indeks 1 jika belum diinisialisasi
            const activeKeyIndex = global.currentKeyIndex !== undefined ? global.currentKeyIndex + 1 : 1;
            
            // Mengirimkan seluruh variabel pendukung ke file dashboard.ejs
            res.render('admin/dashboard', { 
                users: users || [], 
                pendingTicketsCount: pendingTicketsCount || 0,
                adminUser: req.session.adminUser, 
                adminRole: req.session.adminRole,
                totalApiKeys: totalKeys,
                activeKeyIndex: activeKeyIndex
            });
        } catch (err) {
            console.error(err);
            res.render('admin/dashboard', { 
                users: [], 
                pendingTicketsCount: 0,
                adminUser: req.session.adminUser, 
                adminRole: req.session.adminRole,
                totalApiKeys: 1,
                activeKeyIndex: 1
            });
        }
    });

    // ===================================================================
    // 📌 VIEW TABEL TIKET PENGADUAN (Halaman khusus data Out of Scope)
    // ===================================================================
    router.get('/tickets', checkLogin, async (req, res) => {
        try {
            // Menampilkan riwayat pesan yang gagal dijawab otomatis oleh AI
            const { data: tickets, error } = await supabase
                .from('admin_tickets')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            res.render('admin/tickets', {
                tickets: tickets || [],
                adminUser: req.session.adminUser,
                adminRole: req.session.adminRole
            });
        } catch (err) {
            console.error("Gagal memuat halaman tiket:", err.message);
            res.status(500).send("Gagal mengambil daftar data tiket pengaduan.");
        }
    });

    // ===================================================================
    // 📌 PROSES BALAS TIKET MANUAL VIA TELEGRAM (HANYA KEPALA ADMIN)
    // ===================================================================
    router.post('/tickets/reply', checkLogin, hanyaKepalaAdmin, async (req, res) => {
        const { ticket_id, chat_id, jawaban_admin } = req.body;

        try {
            // 1. Kirim pesan balasan dari admin langsung ke Telegram pendaftar
            if (bot && bot.telegram) {
                await bot.telegram.sendMessage(
                    chat_id,
                    `✉️ *JAWABAN MANUAL DARI ADMIN*\n\n` +
                    `Pertanyaan Anda sebelumnya telah ditinjau oleh tim administrator. Berikut jawaban resmi kami:\n\n` +
                    `_"${jawaban_admin}"_`,
                    { parse_mode: 'Markdown' }
                );
            }

            // 2. Update status tiket pengaduan di Supabase menjadi selesai ('resolved')
            const { error } = await supabase
                .from('admin_tickets')
                .update({ status: 'resolved' })
                .eq('id', ticket_id);

            if (error) throw error;

            // 📜 Catat riwayat penanganan keluhan ke log audit trail
            if (catatLog) {
                await catatLog(
                    req.session.adminUser,
                    req.session.adminRole,
                    `Membalas manual tiket pengaduan ID ${ticket_id} ke Chat ID ${chat_id}`
                );
            }

            res.redirect('/admin/tickets?success=1');
        } catch (err) {
            console.error("Gagal membalas tiket pengaduan:", err.message);
            res.status(500).send("Terjadi kesalahan saat mengirim jawaban manual.");
        }
    });

    // ===================================================================
    // BROADCAST TELEGRAM (Bisa diakses oleh Kepala Admin dan Admin Staff)
    // ===================================================================
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

    // ===================================================================
    // ⚙️ VIEW EDIT KNOWLEDGE BASE AI & MANAJEMEN USER (HANYA KEPALA ADMIN)
    // ===================================================================
    router.get('/ai-config', checkLogin, hanyaKepalaAdmin, async (req, res) => {
        try {
            const { data: config, error } = await supabase
                .from('ai_config')
                .select('*')
                .eq('id', 1)
                .single();

            if (error) throw error;

            // Melemparkan objek data 'req' agar halaman EJS bisa membaca status '?user_added=1' di URL
            res.render('admin/ai-config', { 
                config, 
                req: req,
                adminUser: req.session.adminUser, 
                adminRole: req.session.adminRole 
            });
        } catch (err) {
            res.status(500).send("Gagal memuat basis pengetahuan AI: " + err.message);
        }
    });

    // ===================================================================
    // 💾 PROSES SIMPAN KNOWLEDGE BASE AI (HANYA KEPALA ADMIN)
    // ===================================================================
    router.post('/ai-config/save', checkLogin, hanyaKepalaAdmin, async (req, res) => {
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

    // ===================================================================
    // ➕ PROSES TAMBAH AKUN STAFF/ADMIN BARU (HANYA KEPALA ADMIN)
    // ===================================================================
    router.post('/ai-config/add-admin', checkLogin, hanyaKepalaAdmin, async (req, res) => {
        const { new_username, new_password, new_role } = req.body;

        try {
            // Suntikkan data akun baru ke tabel 'admins' di Supabase
            const { error } = await supabase
                .from('admins')
                .insert({
                    username: new_username.trim(),
                    password: new_password, 
                    role: new_role, 
                    created_at: new Date()
                });

            if (error) {
                if (error.code === '23505') {
                    return res.status(400).send("Gagal: Username tersebut sudah terdaftar di sistem.");
                }
                throw error;
            }

            // 📜 Catat aktivitas penambahan staff ke log audit trail
            if (catatLog) {
                await catatLog(
                    req.session.adminUser,
                    req.session.adminRole,
                    `Menambahkan akun administrator baru: Username [${new_username}] dengan Role [${new_role}]`
                );
            }

            res.redirect('/admin/ai-config?user_added=1');
        } catch (err) {
            console.error("Gagal menambah akun admin baru:", err.message);
            res.status(500).send("Terjadi kesalahan internal saat mendaftarkan akun baru.");
        }
    });

    // ===================================================================
    // 📋 VIEW TABEL LOG SISTEM (HANYA KEPALA ADMIN)
    // ===================================================================
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
    // 💾 FITUR GENERATOR EKSPOR PDF RESMI (HANYA KEPALA ADMIN)
    // ===================================================================
    router.get('/download-log', checkLogin, hanyaKepalaAdmin, async (req, res) => {
        const PDFDocument = require('pdfkit-table');

        try {
            const { data: logs, error } = await supabase
                .from('system_logs')
                .select('*')
                .order('waktu', { ascending: false });

            if (error) throw error;

            const doc = new PDFDocument({ margin: 30, size: 'A4' });

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename=Laporan_Audit_Log_Berani_Cerdas.pdf');
            
            doc.pipe(res);

            doc.fontSize(18).font('Helvetica-Bold').text('PROGRAM BEASISWA BERANI CERDAS', { align: 'center' });
            doc.fontSize(10).font('Helvetica').text('Sekretariat Jenderal Admin Utama - Provinsi Sulawesi Tengah', { align: 'center' });
            doc.moveDown(0.5);
            doc.moveTo(30, doc.y).lineTo(565, doc.y).stroke('#4f46e5'); 
            doc.moveDown(1.5);

            doc.fontSize(13).font('Helvetica-Bold').text('LAPORAN AUDIT TRAIL AKTIVITAS SISTEM', { align: 'left' });
            doc.fontSize(9).font('Helvetica-Oblique').text(`Dieksport Oleh: ${req.session.adminUser} (${req.session.adminRole}) | Tanggal Cetak: ${new Date().toLocaleString('id-ID')}`, { align: 'left' });
            doc.moveDown(1.5);

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

            await doc.table(table, {
                prepareHeader: () => doc.font("Helvetica-Bold").fontSize(10).fillColor("#1e293b"),
                prepareRow: (row, index, column, rowNumber, rectRow) => doc.font("Helvetica").fontSize(9).fillColor("#334155")
            });

            doc.moveDown(3);
            if (doc.y > 700) doc.addPage(); 
            
            doc.fontSize(10).font('Helvetica').text('Mengetahui,', 400);
            doc.moveDown(2.5);
            doc.font('Helvetica-Bold').text(`${req.session.adminUser.toUpperCase()}`, 400);
            doc.font('Helvetica').text(`Kepala Administrator`, 400);

            doc.end();

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

    // ===================================================================
    // 📊 FITUR GENERATOR EKSPOR SPREADSHEET CSV (HANYA KEPALA ADMIN)
    // ===================================================================
    router.get('/download-csv', checkLogin, hanyaKepalaAdmin, async (req, res) => {
        try {
            const { data: logs, error } = await supabase
                .from('system_logs')
                .select('*')
                .order('waktu', { ascending: false });

            if (error) throw error;

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=Laporan_Audit_Log_Berani_Cerdas.csv');

            let csvContent = '\uFEFF'; 
            csvContent += 'Waktu (WITA),Operator,Role,Deskripsi Tindakan Sistem\n';

            if (logs && logs.length > 0) {
                logs.forEach(log => {
                    const waktu = new Date(log.waktu).toLocaleString('id-ID').replace(/,/g, ''); 
                    const operator = log.operator || '-';
                    const role = (log.role || '-').toUpperCase();
                    const aksi = `"${(log.aksi || '-').replace(/"/g, '""')}"`; 

                    csvContent += `${waktu},${operator},${role},${aksi}\n`;
                });
            }

            res.status(200).send(csvContent);

            if (catatLog) {
                await catatLog(
                    req.session.adminUser, 
                    req.session.adminRole, 
                    'Mengeksport Berkas Dokumen Audit Log Format Spreadsheet (.csv)'
                );
            }

        } catch (err) {
            console.error("Gagal memproses ekspor CSV log:", err.message);
            if (!res.headersSent) {
                res.status(500).send("Terjadi kesalahan internal saat menyusun berkas dokumen CSV.");
            }
        }
    });

    // ===================================================================
    // LOGOUT
    // ===================================================================
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