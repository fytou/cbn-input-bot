const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { processKTPImage } = require('./ocr');
const { parseSalesMessage, formatSalesOrder, getFormattedToday } = require('./parser');
const { generateBAImage, cleanCustomerName } = require('./renderer');
const { 
  loadTeam, 
  findTeamByAE, 
  registerTeamMember, 
  getUserProfile, 
  setUserProfile 
} = require('./team');

if (!config.TELEGRAM_BOT_TOKEN) {
  console.warn('PERINGATAN: TELEGRAM_BOT_TOKEN belum disetel di .env.');
}

const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN || 'DUMMY_TOKEN');

// In-memory sessions per user chat
const sessions = new Map();

function getSession(chatId) {
  if (!sessions.has(chatId)) {
    const userProf = getUserProfile(String(chatId)) || {};
    sessions.set(chatId, {
      state: 'IDLE',
      data: {
        vendor: userProf.vendor || config.DEFAULT_VENDOR,
        soDate: getFormattedToday(),
        tlCode: userProf.tlCode || config.DEFAULT_TL_CODE,
        tlName: userProf.tlName || config.DEFAULT_TL_NAME,
        aeName: userProf.aeName || config.DEFAULT_AE_NAME,
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
👋 *Halo ${session.data.tlName || 'Team'}!*
Selamat datang di *Bot Sales Order & BA Digital CBN*.

Bot ini otomatis memproses data sales & cetak BA digital:
1. 📸 *Kirim Foto KTP* (otomatis OCR NIK 16 digit, Nama, TTL, Gender).
2. 📝 *Kirim teks chat sales* (Tikor, Alamat, Home ID, No HP, Email, Paket, AE).
3. ⚡ *Auto Kode Pos* (diambil otomatis dari 5 digit awal Home ID).
4. ⚡ *Auto Username* (diambil otomatis dari awalan email).
5. 👥 *Auto TL & AE Mapping*:
   Ketik \`nama AE: cece\`, bot otomatis mendeteksi TL CODE & TL NAME!
6. 🖨️ *Auto Generate*:
   - Teks Format Sales Order WhatsApp (1x tap langsung copy).
   - Gambar Formulir BA Digital terisi presisi & simetris (FB 20 / FB 100/200).

Silakan *kirim foto KTP pelanggan* atau teks data sales untuk memulai!
`;
  await ctx.replyWithMarkdown(welcomeText, Markup.inlineKeyboard([
    [Markup.button.callback('➕ Mulai Input Order Baru', 'action_new_order')],
    [Markup.button.callback('👥 Daftar Tim & AE', 'action_list_team')],
    [Markup.button.callback('⚙️ Pengaturan Profil Saya', 'action_settings')],
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
📖 *Panduan Penggunaan Bot SO & BA Digital CBN*

*Cara Cepat:*
1. Kirim foto KTP pelanggan ke bot ini.
2. Kirim teks info dari sales yang berisi:
   - Tikor (misal: \`0.415629,101.452324\`)
   - Home ID (misal: \`28452H000.3.06424\` -> auto kode pos: \`28452\`)
   - Alamat Pemasangan (Jl..., Kelurahan, Kecamatan)
   - Email pelanggan (auto username dari nama email)
   - No HP
   - Nama AE (misal: \`nama AE: cece\`)
3. Bot akan menampilkan preview data dan tombol konfirmasi.
4. Klik *[✅ Buat SO & BA Digital]*.
5. Selesai! Bot mengirimkan format WhatsApp dan formulir BA digital presisi.

*Format Multi-TL & Multi-AE:*
Anda bisa langsung kirim format:
\`\`\`
nama AE : cece
TL CODE : MMP038
TL NAME : fito nardian
\`\`\`
*(Jika TL CODE & TL NAME dikosongkan, bot otomatis mengambil data TL dari daftar tim!)*

*Perintah Tambahan:*
/list_team - Lihat daftar seluruh AE dan TL yang terdaftar
/add_team <Nama AE> | <TL Code> | <TL Name> - Daftarkan AE baru ke TL
/set_profile <TL Code> | <TL Name> | <Nama AE> - Simpan profil default akun Telegram Anda
/set_gemini <API_KEY> - Pasang Gemini API Key untuk OCR
`;
  await ctx.replyWithMarkdown(helpText);
});

// /list_team command
bot.command('list_team', async (ctx) => {
  const team = loadTeam();
  if (team.length === 0) {
    return ctx.reply('Belum ada data tim yang tersimpan.');
  }
  let msg = `👥 *Daftar Tim Sales & Team Leader:*\n━━━━━━━━━━━━━━━━━━\n`;
  team.forEach((t, i) => {
    msg += `${i + 1}. *AE*: ${t.aeName}\n   *TL*: ${t.tlName} (\`${t.tlCode}\`)\n   *Vendor*: ${t.vendor || config.DEFAULT_VENDOR}\n\n`;
  });
  msg += `💡 *Tambah AE baru*: \`/add_team Nama AE | Kode TL | Nama TL\``;
  await ctx.replyWithMarkdown(msg);
});

// /add_team command: /add_team Cece | MMP038 | fito nardian
bot.command('add_team', (ctx) => {
  const input = ctx.message.text.substring(9).trim();
  const parts = input.split('|').map(s => s.trim());
  if (parts.length < 3) {
    return ctx.reply('Format salah.\nContoh: `/add_team Cece novita sari | MMP038 | fito nardian`', { parse_mode: 'Markdown' });
  }
  const [ae, tlCode, tlName] = parts;
  const entry = registerTeamMember(ae, tlCode, tlName);
  ctx.reply(`✅ *Berhasil mendaftarkan tim!*\nAE: *${entry.aeName}*\nTL Code: \`${entry.tlCode}\`\nTL Name: *${entry.tlName}*`, { parse_mode: 'Markdown' });
});

// /set_profile command: /set_profile MMP038 | fito nardian | Cece
bot.command('set_profile', (ctx) => {
  const input = ctx.message.text.substring(12).trim();
  const parts = input.split('|').map(s => s.trim());
  if (parts.length < 2) {
    return ctx.reply('Format salah.\nContoh: `/set_profile MMP038 | fito nardian | Cece novita sari`', { parse_mode: 'Markdown' });
  }
  const profile = {
    tlCode: parts[0],
    tlName: parts[1],
    aeName: parts[2] || config.DEFAULT_AE_NAME,
    vendor: config.DEFAULT_VENDOR
  };
  setUserProfile(String(ctx.chat.id), profile);
  const session = getSession(ctx.chat.id);
  Object.assign(session.data, profile);
  ctx.reply(`✅ *Profil Telegram Anda berhasil disimpan!*\nTL Code: \`${profile.tlCode}\`\nTL Name: *${profile.tlName}*\nDefault AE: *${profile.aeName}*`, { parse_mode: 'Markdown' });
});

// /settings command
bot.command('settings', async (ctx) => {
  const session = getSession(ctx.chat.id);
  const text = `
⚙️ *Profil Sesi Anda Saat Ini:*
- Vendor: \`${session.data.vendor}\`
- TL Code: \`${session.data.tlCode}\`
- TL Name: \`${session.data.tlName}\`
- Default AE: \`${session.data.aeName}\`
- Default Paket: \`${session.data.service}\`
- Template BA: \`${session.data.templateType}\`

*Perintah Cepat:*
\`/set_tl MMP038 fito nardian\`
\`/set_ae Cece novita sari\`
\`/set_profile <TL Code> | <TL Name> | <Nama AE>\`
`;
  await ctx.replyWithMarkdown(text, Markup.inlineKeyboard([
    [Markup.button.callback('Ganti Template ke FB 20', 'set_tpl_fb20'), Markup.button.callback('Ganti Template ke FB 100/200', 'set_tpl_fb100')]
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
  ctx.reply(`✅ TL diperbarui: \`${session.data.tlCode}\` - *${session.data.tlName}*`, { parse_mode: 'Markdown' });
});

bot.command('set_ae', (ctx) => {
  const session = getSession(ctx.chat.id);
  const name = ctx.message.text.substring(7).trim();
  if (!name) return ctx.reply('Format salah. Contoh: /set_ae Cece novita sari');
  session.data.aeName = name;
  const match = findTeamByAE(name);
  if (match) {
    session.data.aeName = match.aeName;
    session.data.tlCode = match.tlCode;
    session.data.tlName = match.tlName;
    session.data.vendor = match.vendor;
  }
  ctx.reply(`✅ Nama AE diperbarui: *${session.data.aeName}* (TL: ${session.data.tlName})`, { parse_mode: 'Markdown' });
});

bot.command('set_gemini', (ctx) => {
  const key = ctx.message.text.substring(11).trim();
  if (!key) return ctx.reply('Format salah. Contoh: /set_gemini AIzaSy...');
  config.GEMINI_API_KEY = key;
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

bot.action('action_list_team', async (ctx) => {
  ctx.answerCbQuery();
  const team = loadTeam();
  let msg = `👥 *Daftar Tim Sales & Team Leader:*\n━━━━━━━━━━━━━━━━━━\n`;
  team.forEach((t, i) => {
    msg += `${i + 1}. *AE*: ${t.aeName}\n   *TL*: ${t.tlName} (\`${t.tlCode}\`)\n\n`;
  });
  ctx.replyWithMarkdown(msg);
});

bot.action('action_settings', async (ctx) => {
  ctx.answerCbQuery();
  const session = getSession(ctx.chat.id);
  ctx.reply(`⚙️ *Pengaturan TL*:
TL Code: \`${session.data.tlCode}\`
TL Name: \`${session.data.tlName}\`
AE Name: \`${session.data.aeName}\`
Vendor: \`${session.data.vendor}\`
Template: \`${session.data.templateType}\``, { parse_mode: 'Markdown' });
});

bot.action('action_help', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply('Kirimkan foto KTP dan teks info sales (Tikor, Alamat, Home ID, Email, HP, AE). Bot langsung otomatis bekerja!');
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
  ctx.answerCbQuery('Template disetel ke FB 100 / 200');
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
Paket: 40mbps
nama AE: cece
TL CODE: MMP038
TL NAME: fito nardian
\`\`\`
`;
  ctx.replyWithMarkdown(help);
});

function applyParsedData(session, parsed) {
  if (!parsed) return;
  for (const [k, v] of Object.entries(parsed)) {
    if (v !== undefined && v !== null && v !== '') {
      session.data[k] = v;
    }
  }
}

// Photo handler: handles KTP photo
bot.on('photo', async (ctx) => {
  const session = getSession(ctx.chat.id);
  const waitMsg = await ctx.reply('🔍 *Memproses foto KTP dengan OCR AI...*', { parse_mode: 'Markdown' });

  try {
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileLink = await ctx.telegram.getFileLink(photo.file_id);

    const response = await fetch(fileLink.href);
    const arrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    const ocrResult = await processKTPImage(imageBuffer, 'image/jpeg');

    if (ocrResult.nama) session.data.nama = cleanCustomerName(ocrResult.nama);
    if (ocrResult.nik) session.data.nik = ocrResult.nik.replace(/\D/g, '');
    if (ocrResult.tempatLahir) session.data.tempatLahir = cleanCustomerName(ocrResult.tempatLahir);
    if (ocrResult.tanggalLahir) session.data.tanggalLahir = ocrResult.tanggalLahir;
    if (ocrResult.jenisKelamin) session.data.jenisKelamin = ocrResult.jenisKelamin;

    if (ctx.message.caption) {
      const parsedText = parseSalesMessage(ctx.message.caption);
      applyParsedData(session, parsedText);
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

  // Smart unified parser
  const parsed = parseSalesMessage(text);
  applyParsedData(session, parsed);

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
━━━━━━━━━━━━━━━━━━
🏢 *Vendor*: ${d.vendor || config.DEFAULT_VENDOR}
👨‍💼 *AE*: *${d.aeName || config.DEFAULT_AE_NAME}*
👔 *TL*: *${d.tlName || config.DEFAULT_TL_NAME}* (\`${d.tlCode || config.DEFAULT_TL_CODE}\`)
📄 *Template Form*: *${d.templateType}*
━━━━━━━━━━━━━━━━━━
`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('✅ Buat SO & BA Digital', 'action_generate')],
    [
      Markup.button.callback(d.templateType === 'FB 20' ? '🔘 Gunakan FB 100/200' : '🔘 Gunakan FB 20', 
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

  const generatingMsg = await ctx.reply('⏳ *Sedang merender Formulir BA Digital CBN Presisi...*', { parse_mode: 'Markdown' });

  try {
    // 1. Generate BA Digital Image
    const tempOutFile = path.resolve(__dirname, `../output_ba_${Date.now()}.png`);
    await generateBAImage(d, d.templateType, tempOutFile);

    // 2. Generate WhatsApp Text
    const waText = formatSalesOrder(d);

    // Remove loading message
    await ctx.telegram.deleteMessage(ctx.chat.id, generatingMsg.message_id).catch(() => {});

    // Send Formatted SO Text
    const responseHeader = `✅ *Sales Order CBN Berhasil Dibuat!*
Tekan teks di dalam kotak bawah untuk langsung menyalin ke WhatsApp:`;

    await ctx.replyWithMarkdown(responseHeader);
    await ctx.reply(`\`\`\`\n${waText}\n\`\`\``, { parse_mode: 'Markdown' });

    // Send BA Digital Image
    await ctx.replyWithPhoto(
      { source: tempOutFile },
      { 
        caption: `📄 *BA Digital Layanan CBN* (${d.templateType})\nPelanggan: *${d.nama}*\nNIK: \`${d.nik}\`\nHome ID: \`${d.homeId || '-'}\`\nAE: *${d.aeName}* | TL: *${d.tlName}*`,
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

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

if (require.main === module) {
  startBot();
}

module.exports = { bot, startBot };
