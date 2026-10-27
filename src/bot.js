const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { processKTPImage } = require('./ocr');
const { parseSalesMessage, formatSalesOrder, getFormattedToday } = require('./parser');
const { generateBAImage } = require('./renderer');

if (!config.TELEGRAM_BOT_TOKEN) {
  console.warn('PERINGATAN: TELEGRAM_BOT_TOKEN belum disetel di .env.');
}

const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN || 'DUMMY_TOKEN');

// In-memory sessions per user chat
const sessions = new Map();

function getSession(chatId) {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, {
      state: 'IDLE',
      data: {
        vendor: config.DEFAULT_VENDOR,
        soDate: getFormattedToday(),
        tlCode: config.DEFAULT_TL_CODE,
        tlName: config.DEFAULT_TL_NAME,
        aeName: config.DEFAULT_AE_NAME,
        nama: '',
        nik: '',
        tempatLahir: '',
        tanggalLahir: '',
        jenisKelamin: '',
        noHp: '',
        alamat: '',
        kelurahan: '',
        kecamatan: '',
        kodePos: '',
        tikor: '',
        homeId: '',
        username: '',
        service: config.DEFAULT_SERVICE,
        email: '',
        templateType: 'FB 20'
      }
    });
  }
  return sessions.get(chatId);
}

function resetSession(chatId) {
  sessions.delete(chatId);
  return getSession(chatId);
}

// /start command
bot.command('start', async (ctx) => {
  const session = resetSession(ctx.chat.id);
  const welcomeText = `
👋 *Halo Team Leader ${session.data.tlName}!*
Selamat datang di *Bot Sales Order & BA Digital CBN*.

Bot ini otomatis memproses kiriman data sales:
1. 📸 *Kirim Foto KTP* (otomatis OCR NIK, Nama, TTL, Jenis Kelamin).
2. 📝 *Kirim teks chat sales* (Tikor, Alamat, Home ID, No HP, Email, Paket, AE).
3. ⚡ *Auto Kode Pos* (diambil otomatis dari 5 digit awal Home ID).
4. ⚡ *Auto Username* (diambil otomatis dari awalan email).
5. 🖨️ *Auto Generate*:
   - Teks Format Sales Order WhatsApp (1x klik langsung copy).
   - Gambar Formulir BA Digital terisi rapi (Template FB 20 / FB 100).

Silakan *kirim foto KTP pelanggan* untuk memulai!
`;
  await ctx.replyWithMarkdown(welcomeText, Markup.inlineKeyboard([
    [Markup.button.callback('➕ Mulai Input Order Baru', 'action_new_order')],
    [Markup.button.callback('⚙️ Pengaturan TL & Vendor', 'action_settings')],
    [Markup.button.callback('ℹ️ Bantuan & Format Teks', 'action_help')]
  ]));
});

// /new command
bot.command('new', async (ctx) => {
  resetSession(ctx.chat.id);
  await ctx.reply('🆕 Sesi baru dimulai! Silakan kirimkan *foto KTP pelanggan* atau teks data sales.', { parse_mode: 'Markdown' });
});

// /help command
bot.command('help', async (ctx) => {
  const helpText = `
📖 *Panduan Penggunaan Bot SO CBN*

*Cara Cepat:*
1. Kirim foto KTP pelanggan ke bot ini (bisa difoto langsung / miring / berbayang).
2. Kirim teks info dari sales yang berisi:
   - Tikor (misal: \`0.415629,101.452324\`)
   - Home ID (misal: \`28452H000.3.06424\` -> auto kode pos: \`28452\`)
   - Alamat Pemasangan (Jl..., Kelurahan, Kecamatan)
   - Email pelanggan (auto username dari nama email)
   - No HP
   - Nama AE
3. Bot akan menampilkan preview data dan tombol konfirmasi.
4. Klik *[✅ Buat SO & BA Digital]*.
5. Selesai! Bot mengirimkan format WhatsApp dan formulir BA digital beres tinggal diteruskan ke grup.

*Perintah yang tersedia:*
/start - Buka menu utama
/new - Reset dan mulai order baru
/preview - Lihat preview data saat ini
/generate - Buat SO WA dan cetak BA Digital
/settings - Ubah nama TL, kode TL, vendor, nama AE
/help - Buka panduan ini
`;
  await ctx.replyWithMarkdown(helpText);
});

// /settings command
bot.command('settings', async (ctx) => {
  const session = getSession(ctx.chat.id);
  const text = `
⚙️ *Pengaturan Default Saat Ini:*
- Vendor: \`${session.data.vendor}\`
- TL Code: \`${session.data.tlCode}\`
- TL Name: \`${session.data.tlName}\`
- Default AE: \`${session.data.aeName}\`
- Default Paket: \`${session.data.service}\`
- Template BA: \`${session.data.templateType}\`

Untuk mengubahnya sementara, Anda bisa kirim:
\`/set_tl MMP038 fito nardian\`
\`/set_ae Cece novita sari\`
\`/set_vendor PT. Milfha Mutiara Prima\`
`;
  await ctx.replyWithMarkdown(text, Markup.inlineKeyboard([
    [Markup.button.callback('Ganti Template ke FB 20', 'set_tpl_fb20'), Markup.button.callback('Ganti Template ke FB 100', 'set_tpl_fb100')]
  ]));
});

// Setters
bot.command('set_tl', (ctx) => {
  const session = getSession(ctx.chat.id);
  const parts = ctx.message.text.split(' ').slice(1);
  if (parts.length < 2) {
    return ctx.reply('Format salah. Contoh: /set_tl MMP038 fito nardian');
  }
  session.data.tlCode = parts[0];
  session.data.tlName = parts.slice(1).join(' ');
  ctx.reply(`✅ TL diperbarui: ${session.data.tlCode} - ${session.data.tlName}`);
});

bot.command('set_ae', (ctx) => {
  const session = getSession(ctx.chat.id);
  const name = ctx.message.text.substring(7).trim();
  if (!name) return ctx.reply('Format salah. Contoh: /set_ae Cece novita sari');
  session.data.aeName = name;
  ctx.reply(`✅ Nama AE diperbarui: ${session.data.aeName}`);
});

bot.command('set_gemini', (ctx) => {
  const key = ctx.message.text.substring(11).trim();
  if (!key) return ctx.reply('Format salah. Contoh: /set_gemini AIzaSy...');
  config.GEMINI_API_KEY = key;
  // Update .env file
  try {
    const envPath = path.resolve(__dirname, '../.env');
    let envContent = fs.readFileSync(envPath, 'utf8');
    if (envContent.includes('GEMINI_API_KEY=')) {
      envContent = envContent.replace(/GEMINI_API_KEY=.*/, `GEMINI_API_KEY=${key}`);
    } else {
      envContent += `\nGEMINI_API_KEY=${key}\n`;
    }
    fs.writeFileSync(envPath, envContent);
    ctx.reply('✅ Gemini API Key berhasil disimpan! AI Vision OCR sekarang aktif sepenuhnya.');
  } catch (err) {
    ctx.reply(`✅ Gemini API Key aktif untuk sesi ini (${err.message}).`);
  }
});

// Action Handlers
bot.action('action_new_order', (ctx) => {
  resetSession(ctx.chat.id);
  ctx.answerCbQuery();
  ctx.reply('Silakan kirimkan foto KTP atau teks dari sales! 📸');
});

bot.action('action_settings', async (ctx) => {
  ctx.answerCbQuery();
  const session = getSession(ctx.chat.id);
  ctx.reply(`⚙️ *Pengaturan TL*:
TL Code: \`${session.data.tlCode}\`
TL Name: \`${session.data.tlName}\`
Vendor: \`${session.data.vendor}\`
Template: \`${session.data.templateType}\``, { parse_mode: 'Markdown' });
});

bot.action('action_help', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply('Kirimkan foto KTP dan teks info sales (Tikor, Alamat, Home ID, Email, HP). Bot langsung otomatis bekerja!');
});

bot.action('set_tpl_fb20', (ctx) => {
  const session = getSession(ctx.chat.id);
  session.data.templateType = 'FB 20';
  ctx.answerCbQuery('Template disetel ke FB 20');
  showDataPreview(ctx, session);
});

bot.action('set_tpl_fb100', (ctx) => {
  const session = getSession(ctx.chat.id);
  session.data.templateType = 'FB 100';
  ctx.answerCbQuery('Template disetel ke FB 100');
  showDataPreview(ctx, session);
});

bot.action('action_generate', async (ctx) => {
  ctx.answerCbQuery('Memproses BA Digital...');
  const session = getSession(ctx.chat.id);
  await handleGenerate(ctx, session);
});

bot.action('action_edit_manual', (ctx) => {
  ctx.answerCbQuery();
  const help = `
Kirim teks dengan format seperti ini untuk mengupdate data:
\`\`\`
Nama: DERI NOVIANTI
NIK: 1471126011870001
TTL: PAKAN SILAKAN, 20-11-1987
Gender: perempuan
HP: 089672191983
Alamat: Jl. Mutiara VI No. S/18
Kel: PANDAU JAYA
Kec: siak hulu
Home ID: 28452H000.3.06424
Tikor: 0.415629,101.452324
Email: noviantideri65@gmail.com
Paket: CBN FIBER, FIBER 40
AE: Cece novita sari
\`\`\`
`;
  ctx.replyWithMarkdown(help);
});

// Photo handler: handles KTP photo
bot.on('photo', async (ctx) => {
  const session = getSession(ctx.chat.id);
  const waitMsg = await ctx.reply('🔍 *Memproses foto KTP dengan OCR AI...*', { parse_mode: 'Markdown' });

  try {
    const photo = ctx.message.photo[ctx.message.photo.length - 1]; // highest resolution
    const fileLink = await ctx.telegram.getFileLink(photo.file_id);

    // Download image
    const response = await fetch(fileLink.href);
    const arrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    // Run OCR
    const ocrResult = await processKTPImage(imageBuffer, 'image/jpeg');

    if (ocrResult.nama) session.data.nama = ocrResult.nama;
    if (ocrResult.nik) session.data.nik = ocrResult.nik;
    if (ocrResult.tempatLahir) session.data.tempatLahir = ocrResult.tempatLahir;
    if (ocrResult.tanggalLahir) session.data.tanggalLahir = ocrResult.tanggalLahir;
    if (ocrResult.jenisKelamin) session.data.jenisKelamin = ocrResult.jenisKelamin;

    // Check if user also sent caption with text
    if (ctx.message.caption) {
      const parsedText = parseSalesMessage(ctx.message.caption);
      Object.assign(session.data, parsedText);
    }

    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
    await ctx.reply('✅ *KTP berhasil dideteksi!*', { parse_mode: 'Markdown' });
    await showDataPreview(ctx, session);
  } catch (error) {
    console.error('Error saat proses foto KTP:', error);
    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
    await ctx.reply(`⚠️ Terjadi kendala saat membaca KTP: ${error.message}\nAnda tetap bisa menginput data secara manual atau kirim teks sales.`);
  }
});

// Text message handler
bot.on('text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return;

  const session = getSession(ctx.chat.id);
  const text = ctx.message.text;

  // Check if manual KTP format
  const parsed = parseSalesMessage(text);
  
  // Also check if user typed individual key:value pairs
  const lines = text.split('\n');
  for (const line of lines) {
    const parts = line.split(':');
    if (parts.length >= 2) {
      const key = parts[0].trim().toLowerCase();
      const val = parts.slice(1).join(':').trim();

      if (key.includes('nama pelanggan') || key === 'nama') session.data.nama = val.toUpperCase();
      if (key.includes('ktp') || key === 'nik') session.data.nik = val.replace(/\D/g, '');
      if (key === 'ttl') {
        const ttlParts = val.split(',');
        if (ttlParts.length >= 2) {
          session.data.tempatLahir = ttlParts[0].trim().toUpperCase();
          session.data.tanggalLahir = ttlParts[1].trim();
        }
      }
      if (key.includes('kelamin') || key === 'gender') session.data.jenisKelamin = val;
      if (key.includes('hp') || key.includes('telepon')) session.data.noHp = val;
      if (key.includes('alamat')) session.data.alamat = val;
      if (key.includes('kelurahan') || key === 'kel') session.data.kelurahan = val.toUpperCase();
      if (key.includes('kecamatan') || key === 'kec') session.data.kecamatan = val.toUpperCase();
      if (key.includes('home id') || key.includes('homepass')) {
        session.data.homeId = val;
        const zip = val.match(/^(\d{5})/);
        if (zip) session.data.kodePos = zip[1];
      }
      if (key.includes('kode pos') || key === 'pos') session.data.kodePos = val;
      if (key.includes('tikor') || key.includes('koordinat')) session.data.tikor = val;
      if (key.includes('email')) {
        session.data.email = val;
        session.data.username = val.split('@')[0];
      }
      if (key.includes('username')) session.data.username = val;
      if (key.includes('service') || key.includes('paket')) {
        session.data.service = val;
        if (val.includes('100')) session.data.templateType = 'FB 100';
        else session.data.templateType = 'FB 20';
      }
      if (key.includes('ae')) session.data.aeName = val;
    }
  }

  // Merge any parsed elements
  if (parsed.tikor && !session.data.tikor) session.data.tikor = parsed.tikor;
  if (parsed.email && !session.data.email) session.data.email = parsed.email;
  if (parsed.username && !session.data.username) session.data.username = parsed.username;
  if (parsed.noHp && !session.data.noHp) session.data.noHp = parsed.noHp;
  if (parsed.homeId && !session.data.homeId) {
    session.data.homeId = parsed.homeId;
    if (parsed.kodePos) session.data.kodePos = parsed.kodePos;
  }
  if (parsed.alamat && !session.data.alamat) session.data.alamat = parsed.alamat;
  if (parsed.kelurahan && !session.data.kelurahan) session.data.kelurahan = parsed.kelurahan;
  if (parsed.kecamatan && !session.data.kecamatan) session.data.kecamatan = parsed.kecamatan;
  if (parsed.service && !session.data.service) session.data.service = parsed.service;
  if (parsed.aeName && !session.data.aeName) session.data.aeName = parsed.aeName;

  await showDataPreview(ctx, session);
});

// Show data preview card
async function showDataPreview(ctx, session) {
  const d = session.data;
  const kodePos = d.kodePos || (d.homeId ? d.homeId.substring(0, 5) : '-');
  const username = d.username || (d.email ? d.email.split('@')[0] : '-');

  const preview = `
📋 *PREVIEW DATA ORDER SALES CBN*
━━━━━━━━━━━━━━━━━━
👤 *Nama*: ${d.nama || '_(belum terisi)_'}
🆔 *NIK*: \`${d.nik || '_(belum terisi)_'}\`
🎂 *TTL*: ${d.tempatLahir ? d.tempatLahir + ', ' + d.tanggalLahir : '_(belum terisi)_'}
🚻 *Gender*: ${d.jenisKelamin || '_(belum terisi)_'}
📱 *No HP*: \`${d.noHp || '_(belum terisi)_'}\`
📍 *Alamat*: ${d.alamat || '_(belum terisi)_'}
🏘️ *Kelurahan*: ${d.kelurahan || '_(belum terisi)_'}
🗺️ *Kecamatan*: ${d.kecamatan || '_(belum terisi)_'}
📮 *Kode Pos*: \`${kodePos}\` _(Auto dari Home ID)_
🏠 *Home ID*: \`${d.homeId || '_(belum terisi)_'}\`
🌐 *Tikor*: \`${d.tikor || '_(belum terisi)_'}\`
📧 *Email*: ${d.email || '_(belum terisi)_'}
💻 *Username*: \`${username}\` _(Auto dari Email)_
⚡ *Paket*: ${d.service || 'CBN FIBER, FIBER 20'}
👨‍💼 *AE*: ${d.aeName || config.DEFAULT_AE_NAME}
📄 *Template BA*: *${d.templateType}*
━━━━━━━━━━━━━━━━━━
`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('✅ Buat SO & BA Digital', 'action_generate')],
    [
      Markup.button.callback(d.templateType === 'FB 20' ? '🔘 Gunakan FB 100' : '🔘 Gunakan FB 20', 
        d.templateType === 'FB 20' ? 'set_tpl_fb100' : 'set_tpl_fb20')
    ],
    [
      Markup.button.callback('✏️ Edit Manual / Format Text', 'action_edit_manual'),
      Markup.button.callback('🔄 Reset Order', 'action_new_order')
    ]
  ]);

  await ctx.replyWithMarkdown(preview, keyboard);
}

// Handler for generating WhatsApp format & BA digital image
async function handleGenerate(ctx, session) {
  const d = session.data;

  // Validation
  if (!d.nama || !d.nik) {
    return ctx.reply('⚠️ Data Nama atau NIK masih kosong. Silakan kirimkan foto KTP atau teks terlebih dahulu!');
  }

  // Ensure derived fields
  if (!d.kodePos && d.homeId) {
    d.kodePos = d.homeId.substring(0, 5);
  }
  if (!d.username && d.email) {
    d.username = d.email.split('@')[0];
  }

  const generatingMsg = await ctx.reply('⏳ *Sedang merender Formulir BA Digital CBN...*', { parse_mode: 'Markdown' });

  try {
    // 1. Generate BA Digital Image
    const tempOutFile = path.resolve(__dirname, `../output_ba_${Date.now()}.png`);
    await generateBAImage(d, d.templateType, tempOutFile);

    // 2. Generate WhatsApp Text
    const waText = formatSalesOrder(d);

    // Remove loading message
    await ctx.telegram.deleteMessage(ctx.chat.id, generatingMsg.message_id).catch(() => {});

    // Send Formatted SO Text (in pre block so one-tap copy in Telegram!)
    const responseHeader = `✅ *Sales Order CBN Berhasil Dibuat!*
Tekan teks di dalam kotak bawah untuk langsung menyalin ke WhatsApp:`;

    await ctx.replyWithMarkdown(responseHeader);
    await ctx.reply(`\`\`\`\n${waText}\n\`\`\``, { parse_mode: 'Markdown' });

    // Send BA Digital Image
    await ctx.replyWithPhoto(
      { source: tempOutFile },
      { 
        caption: `📄 *BA Digital Layanan CBN* (${d.templateType})\nPelanggan: *${d.nama}*\nNIK: \`${d.nik}\`\nHome ID: \`${d.homeId || '-'}\``,
        parse_mode: 'Markdown'
      }
    );

    // Clean up temporary output file
    setTimeout(() => {
      if (fs.existsSync(tempOutFile)) {
        try { fs.unlinkSync(tempOutFile); } catch (e) {}
      }
    }, 10000);

    // Offer Next Action
    await ctx.reply('Silakan teruskan teks SO dan BA Digital ke grup WhatsApp! 🎉', Markup.inlineKeyboard([
      [Markup.button.callback('➕ Input Order Berikutnya', 'action_new_order')]
    ]));

  } catch (err) {
    console.error('Gagal generate BA / SO:', err);
    await ctx.telegram.deleteMessage(ctx.chat.id, generatingMsg.message_id).catch(() => {});
    await ctx.reply(`❌ Terjadi kesalahan saat membuat BA Digital: ${err.message}`);
  }
}

// Start bot function
function startBot() {
  bot.launch()
    .then(() => {
      console.log('🚀 Bot Sales Order CBN berhasil berjalan!');
    })
    .catch((err) => {
      console.error('Gagal menjalankan Telegram Bot:', err.message);
    });

  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

if (require.main === module) {
  startBot();
}

module.exports = { bot, startBot };
