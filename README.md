# 🤖 Bot Telegram Sales Order & BA Digital CBN Fiber

Bot Telegram otomatis untuk mempermudah Team Leader (TL) dan Account Executive (AE) Sales CBN Fiber dalam memproses data calon pelanggan dari pesan WhatsApp menjadi:
1. **Format Teks WhatsApp Sales Order (SO)** yang siap di-copy & kirim ke grup SO.
2. **Formulir Berita Acara (BA) Digital CBN** beresolusi tinggi yang terisi otomatis (tersedia template FB 20 & FB 100).

---

## ✨ Fitur Utama

- 📸 **AI OCR KTP Otomatis**: Membaca foto KTP (meskipun posisi miring, berbayang, terbalik, atau kualitas foto WhatsApp) menggunakan **Google Gemini 1.5 Flash Vision AI** dengan fallback offline **Tesseract.js**.
  - Otomatis mengekstrak: NIK (16 digit), Nama Lengkap, Tempat Lahir, Tanggal Lahir (DD-MM-YYYY), dan Jenis Kelamin.
- ⚡ **Auto Kode Pos**: Mengambil 5 digit awal dari **Home ID / Homepass** (contoh: `28452H000.3.06424` ➡️ Kode Pos: `28452`).
- ⚡ **Auto Username**: Mengambil nama awalan email pelanggan (contoh: `noviantideri65@gmail.com` ➡️ Username: `noviantideri65`).
- 📍 **Smart Address**: Menggunakan alamat pemasangan sesuai Home ID / survei lapangan (bukan alamat KTP) sesuai SOP.
- 🖼️ **Auto-Generate Formulir BA Digital**:
  - Mengisi langsung kotak-kotak formulir CBN: NIK, Nama, Tempat/Tanggal Lahir, Tanda silang [X] jenis kelamin (Pria/Wanita), No HP, Alamat, Kelurahan, Kecamatan, Kode Pos, Email, dan Username.
  - Mendukung template **FB 20** dan **FB 100** (serta mudah ditambah template lainnya).
- 📋 **Format Teks WA Siap Salin**: Dikirim dalam format *monospaced / code block* di Telegram, cukup 1x tap di HP untuk langsung menyalin seluruh teks format SO.
- ✏️ **Fleksibel & Manual Support**: Bisa kirim foto KTP, kirim teks chat sales, atau edit data lewat perintah manual.

---

## 📸 Contoh Alur Penggunaan

1. **Sales mengirimkan data via WhatsApp**:
   - Foto KTP
   - Koordinat / Tikor (`0.415629,101.452324`)
   - No HP (`089672191983`)
   - Email (`noviantideri65@gmail.com`)
   - Home ID (`28452H000.3.06424`)
   - Alamat Pemasangan (`Jl. Mutiara VI No. S/18`, Kel. `PANDAU JAYA`, Kec. `siak hulu`)
2. **Kirim foto KTP & teruskan teks sales ke Bot Telegram**.
3. **Bot mendeteksi dan menampilkan Card Preview konfirmasi**.
4. **Klik `[✅ Buat SO & BA Digital]`**:
   - Bot mengirimkan teks format SO:
     ```
     Sales Order
     Vendor:	PT. Milfha Mutiara Prima
     SO Date:	27-10-2026
     TL Code:	MMP038
     TL Name:	fito nardian
     AE Name:	Cece novita sari
      
     Nama Pelanggan : DERI NOVIANTI
     Nomor KTP:	1471126011870001
     TTL: PAKAN SILAKAN, 20-11-1987
     Jenis Kelamin:	perempuan
     NO HP: 089672191983
     Alamat Pemasangan : Jl. Mutiara VI No. S/18
     Kelurahan:	PANDAU JAYA
     Kecamatan:	SIAK HULU
     Kode Pos:	28452
     Tikor:	0.415629,101.452324
     Home ID: 28452H000.3.06424
     Username:noviantideri65
     Service:	CBN FIBER, FIBER 40
     Email Pelanggan : noviantideri65@gmail.com
     ```
   - Bot mengirimkan gambar BA Digital yang sudah terisi rapi.

---

## 🚀 Panduan Instalasi & Menjalankan Bot

### 1. Prasyarat
- **Node.js** v18+ atau v20+ (rekomendasi LTS / v24)
- **Token Bot Telegram** (dari [@BotFather](https://t.me/BotFather))
- **Google Gemini API Key** (Gratis dari [Google AI Studio](https://aistudio.google.com/))

### 2. Clone Repository & Install Dependensi
```bash
git clone <URL_REPO_ANDA>
cd cbn-so-telebot
npm install
```

### 3. Konfigurasi Lingkungan (`.env`)
Salin file `.env.example` menjadi `.env`:
```bash
cp .env.example .env
```
Lalu edit isi `.env`:
```env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
GEMINI_API_KEY=AIzaSy...

DEFAULT_VENDOR=PT. Milfha Mutiara Prima
DEFAULT_TL_CODE=MMP038
DEFAULT_TL_NAME=fito nardian
DEFAULT_AE_NAME=Cece novita sari
DEFAULT_SERVICE=CBN FIBER, FIBER 20
```

### 4. Jalankan Bot
Mode standar:
```bash
npm start
```
Mode pengembangan (auto-reload):
```bash
npm run dev
```

Untuk menjalankan di VPS atau server latar belakang 24/7 menggunakan PM2:
```bash
npm install -g pm2
pm2 start index.js --name "cbn-so-bot"
pm2 save
pm2 startup
```

---

## 📂 Struktur Folder

```text
cbn-so-telebot/
├── index.js              # Entry point utama bot
├── package.json          # Dependensi & script
├── .env.example          # Template konfigurasi environment
├── .gitignore            # File yang diabaikan git
├── README.md             # Dokumentasi lengkap
├── test_workflow.js      # Unit test & simulasi alur end-to-end
├── templates/
│   ├── template_fb20.png   # Template formulir BA CBN paket FB 20
│   └── template_fb100.png  # Template formulir BA CBN paket FB 100
└── src/
    ├── config.js         # Pengaturan default & env loader
    ├── ocr.js            # Engine OCR (Gemini Vision + Tesseract offline)
    ├── parser.js         # Parser teks sales & generator format WhatsApp
    ├── renderer.js       # Engine composite SVG & Sharp perender formulir BA
    └── bot.js            # Logika Telegram Bot & inline keyboard menu
```

---

## 💡 Perintah Bot di Telegram

| Perintah | Deskripsi |
|---|---|
| `/start` | Membuka menu awal dan reset sesi order |
| `/new` | Memulai penginputan order baru |
| `/settings` | Menampilkan dan mengatur profil TL, kode TL, vendor |
| `/set_tl <kode> <nama>` | Mengganti sementara kode TL dan nama TL |
| `/set_ae <nama>` | Mengganti nama AE / Sales |
| `/help` | Menampilkan panduan dan format penginputan |

---

## 📄 Lisensi
MIT License - Dibuat untuk otomasi Sales Team Leader PT. Milfha Mutiara Prima (CBN Fiber).
