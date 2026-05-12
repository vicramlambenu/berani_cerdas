const express = require('express');
const multer = require('multer');
const fs = require('fs');
const router = express.Router();

// ==========================================
// MULTER CONFIG
// ==========================================
const upload = multer({
    dest: 'uploads/'
});

/**
 * Setup Admin Routes
 */
function setupAdminRoutes(supabase, bot, app) {

    // ==========================================
    // VIEW ENGINE
    // ==========================================
    app.set('view engine', 'ejs');
    app.set('views', './views');

    // ==========================================
    // DASHBOARD
    // ==========================================
    router.get('/', async (req, res) => {

        try {

            const { data: users, error } =
                await supabase
                    .from('subscribers')
                    .select('*');

            if (error) {
                console.log(error);
                return res.send("Gagal mengambil data user");
            }

            res.send(`
<!DOCTYPE html>
<html>
<head>

<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<title>Admin Dashboard</title>

<script src="https://cdn.tailwindcss.com"></script>

<link rel="stylesheet"
href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">

</head>

<body class="bg-slate-100 min-h-screen p-6">

<div class="max-w-5xl mx-auto">

<div class="bg-white rounded-2xl shadow-xl p-8">

<h1 class="text-3xl font-black mb-8 text-blue-700">
🎓 Berani Cerdas Admin
</h1>

<!-- FORM BROADCAST -->
<div class="mb-10">

<h2 class="text-xl font-bold mb-4">
📢 Kirim Broadcast
</h2>

<form
action="/admin/broadcast"
method="POST"
enctype="multipart/form-data"
class="space-y-4">

<input
type="password"
name="password"
placeholder="Password Admin"
required
class="w-full border p-3 rounded-lg">

<select
name="target_chat_id"
class="w-full border p-3 rounded-lg"
>
<option value="">Kirim ke semua user</option>
${users.map(u => `
<option value="${u.chat_id}">` +
`${u.full_name || '-'} (@${u.username || '-'}) - ${u.chat_id}` +
`</option>
`).join('')}
</select>

<textarea
name="pesan"
rows="5"
placeholder="Tulis pesan..."
required
class="w-full border p-3 rounded-lg"></textarea>

<input
type="file"
name="file"
class="w-full border p-3 rounded-lg">

<button
class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-bold w-full">

🚀 Kirim Broadcast

</button>

</form>

</div>

<!-- DATA USER -->
<div>

<h2 class="text-xl font-bold mb-4">
👥 Total User: ${users.length}
</h2>

<div class="overflow-x-auto">

<table class="w-full border">

<thead class="bg-blue-100">

<tr>
<th class="p-3 border">No</th>
<th class="p-3 border">Nama</th>
<th class="p-3 border">Username</th>
<th class="p-3 border">Chat ID</th>
</tr>

</thead>

<tbody>

${users.map((u, i) => `

<tr class="hover:bg-slate-50">

<td class="p-3 border">${i + 1}</td>

<td class="p-3 border">
${u.full_name || '-'}
</td>

<td class="p-3 border">
@${u.username || '-'}
</td>

<td class="p-3 border">
${u.chat_id}
</td>

</tr>

`).join('')}

</tbody>

</table>

</div>

</div>

</div>

</div>

</body>
</html>
            `);

        } catch (err) {

            console.log(err);

            res.send("Terjadi error");

        }

    });

    // ==========================================
    // BROADCAST
    // ==========================================
    router.post(
        '/broadcast',
        upload.single('file'),
        async (req, res) => {

            const { password, pesan, target_chat_id } = req.body;

            // ==========================================
            // PASSWORD CHECK
            // ==========================================
            if (password !== process.env.ADMIN_PASSWORD) {

                return res.send(`
<h1>Password Salah</h1>
<a href="/admin">Kembali</a>
                `);

            }

            try {

                let users;

                if (target_chat_id) {

                    users = [
                        { chat_id: target_chat_id }
                    ];

                } else {

                    const { data, error } =
                        await supabase
                            .from('subscribers')
                            .select('chat_id');

                    if (error) {
                        throw error;
                    }

                    users = data;

                }

                let success = 0;
                let failed = 0;

                for (const user of users) {

                    try {

                        // ==========================================
                        // KIRIM PESAN
                        // ==========================================
                        await bot.telegram.sendMessage(
                            user.chat_id,
                            `📢 *INFO TERBARU*\n\n${pesan}`,
                            {
                                parse_mode: 'Markdown'
                            }
                        );

                        // ==========================================
                        // KIRIM FILE PDF
                        // ==========================================
                        if (req.file) {

                            await bot.telegram.sendDocument(
                                user.chat_id,
                                {
                                    source: fs.createReadStream(req.file.path),
                                    filename: req.file.originalname
                                }
                            );

                        }

                        success++;

                        // delay anti spam
                        await new Promise(r =>
                            setTimeout(r, 1500)
                        );

                    } catch (err) {

                        failed++;

                        console.log(
                            "Gagal kirim:",
                            user.chat_id
                        );

                    }

                }

                // hapus file upload
                if (req.file) {

                    fs.unlinkSync(req.file.path);

                }

                // ==========================================
                // SUCCESS PAGE
                // ==========================================
                res.send(`
<!DOCTYPE html>
<html>

<head>

<script src="https://cdn.tailwindcss.com"></script>

</head>

<body class="bg-green-50 flex items-center justify-center h-screen">

<div class="bg-white p-10 rounded-2xl shadow-xl text-center">

<h1 class="text-3xl font-black text-green-600 mb-5">
✅ Broadcast Berhasil
</h1>

<p class="mb-3">
Berhasil: ${success}
</p>

<p class="mb-5">
Gagal: ${failed}
</p>

<a
href="/admin"
class="bg-blue-600 text-white px-6 py-3 rounded-lg">

Kembali

</a>

</div>

</body>
</html>
                `);

            } catch (err) {

                console.log(err);

                res.send("Terjadi kesalahan broadcast");

            }

        }
    );

    return router;
}

module.exports = setupAdminRoutes;