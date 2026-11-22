const config = require('./config');
const { createWorker } = require('tesseract.js');
const sharp = require('sharp');
const { cleanCustomerName } = require('./renderer');

// Candidate models in preference order (put stable full model first, followed by fast lite models)
const GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite'
];

/**
 * Extract KTP details using Google Gemini Vision API
 * @param {Buffer} imageBuffer 
 * @param {string} mimeType 
 * @returns {Promise<Object>}
 */
async function extractKTPWithGemini(imageBuffer, mimeType = 'image/jpeg') {
  if (!config.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY belum disetel di file .env');
  }

  // Compress & optimize image for ultra-fast upload from VPS to Google API
  let uploadBuffer = imageBuffer;
  let uploadMime = 'image/jpeg';
  try {
    uploadBuffer = await sharp(imageBuffer)
      .resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch (e) {
    console.warn('Sharp optimization skipped:', e.message);
  }

  const base64Data = uploadBuffer.toString('base64');

  const prompt = `
Anda adalah AI OCR e-KTP Indonesia berakurasi tingkat tinggi (100% akurat).
Tugas Anda membaca foto e-KTP Republik Indonesia dengan sangat presisi dan tanpa kesalahan.

PERHATIAN SANGAT PENTING:
1. NOMOR IDENTITAS (NIK):
   - NIK terdiri dari tepat 16 DIGIT ANGKA.
   - Perhatikan dengan sangat cermat setiap angka. Jangan tertukar antara:
     * Angka 1 dengan 3 atau 7.
     * Angka 9 dengan 8 atau 5.
     * Angka 0 dengan 8.
   - Contoh e-KTP Riau / Pekanbaru biasanya diawali angka "1471..." (jangan sampai terbaca 3471).
2. NAMA LENGKAP:
   - Ambil HANYA nama lengkap pemilik e-KTP.
   - JANGAN PERNAH menyertakan teks dari label lain seperti "TEMPAT", "TGL LAHIR", atau "BEMPATTGLLAHIR".
3. TEMPAT & TANGGAL LAHIR:
   - Pisahkan antara nama Tempat Lahir dengan Tanggal Lahir.
   - Tanggal lahir harus dalam format DD-MM-YYYY (contoh: 13-10-1989).
4. JENIS KELAMIN:
   - LAKI-LAKI atau PEREMPUAN.

Kembalikan HANYA format JSON valid tanpa tanda kutip markdown, tanpa backticks:
{
  "nik": "16 digit NIK murni angka tanpa spasi",
  "nama": "Nama lengkap kapital",
  "tempatLahir": "Tempat lahir saja",
  "tanggalLahir": "DD-MM-YYYY",
  "jenisKelamin": "PEREMPUAN atau LAKI-LAKI",
  "alamatKtp": "Alamat KTP jika terlihat"
}
`;

  let lastError = null;

  for (const model of GEMINI_MODELS) {
    try {
      const isApiKey = config.GEMINI_API_KEY.startsWith('AIza');
      let url = isApiKey 
        ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.GEMINI_API_KEY}`
        : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      let headers = { 'Content-Type': 'application/json' };
      if (!isApiKey) {
        headers['Authorization'] = `Bearer ${config.GEMINI_API_KEY}`;
      }

      const payload = {
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: uploadMime,
                  data: base64Data
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          response_mime_type: "application/json"
        }
      };

      let response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(45000)
      });

      // Handle temporary 503 high demand spike with auto-retry
      if (response.status === 503) {
        console.warn(`Model ${model} mengalami lonjakan traffic (503). Menunggu 2 detik lalu mencoba lagi...`);
        await new Promise(r => setTimeout(r, 2000));
        response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(45000)
        });
      }

      if (!response.ok && (response.status === 401 || response.status === 400)) {
        const errPeek = await response.clone().text();
        if (errPeek.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED') || errPeek.includes('UNAUTHENTICATED')) {
          const altUrl = !isApiKey
            ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.GEMINI_API_KEY}`
            : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
          const altHeaders = isApiKey
            ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.GEMINI_API_KEY}` }
            : { 'Content-Type': 'application/json' };
          response = await fetch(altUrl, {
            method: 'POST',
            headers: altHeaders,
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(45000)
          });
        }
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      const textOutput = result?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textOutput) {
        throw new Error('Tidak ada respon teks');
      }

      const cleaned = textOutput.replace(/```json/g, '').replace(/```/g, '').trim();
      const data = JSON.parse(cleaned);

      if (data.nama) data.nama = cleanCustomerName(data.nama);
      if (data.tempatLahir) data.tempatLahir = cleanCustomerName(data.tempatLahir);
      if (data.nik) data.nik = data.nik.replace(/\D/g, '');

      console.log(`✅ Sukses membaca KTP dengan model ${model}! NIK: ${data.nik}, Nama: ${data.nama}`);
      return data;
    } catch (err) {
      console.warn(`Model ${model} gagal: ${err.message}. Mencoba model berikutnya...`);
      lastError = err;
    }
  }

  throw lastError || new Error('Semua model Gemini gagal memproses KTP');
}

/**
 * Offline Fallback using Tesseract.js
 * @param {Buffer} imageBuffer 
 * @returns {Promise<Object>}
 */
async function extractKTPWithTesseract(imageBuffer) {
  const worker = await createWorker('ind+eng');
  const ret = await worker.recognize(imageBuffer);
  await worker.terminate();

  const text = ret.data.text;
  return parseRawKTPText(text);
}

/**
 * Regex parser for raw KTP text
 */
function parseRawKTPText(rawText) {
  const data = {
    nik: '',
    nama: '',
    tempatLahir: '',
    tanggalLahir: '',
    jenisKelamin: '',
    alamatKtp: ''
  };

  // NIK: 16 digits (prioritize line with NIK keyword first)
  const nikWithPrefix = rawText.match(/(?:NIK|NOMOR|IDENTITAS)\D*([1-9][0-9\s]{15,25})/i);
  if (nikWithPrefix) {
    const candidate = nikWithPrefix[1].replace(/\D/g, '').substring(0, 16);
    if (candidate.length === 16) data.nik = candidate;
  }
  if (!data.nik) {
    const nikMatch = rawText.match(/\b([1-9][0-9]{15})\b/);
    if (nikMatch) {
      data.nik = nikMatch[1];
    } else {
      const rawDigits = rawText.replace(/[^0-9]/g, '');
      const candidate16 = rawDigits.match(/[1-9][0-9]{15}/);
      if (candidate16) data.nik = candidate16[0];
    }
  }

  // Name: usually follows 'Nama' or 'Nama :'
  const nameMatch = rawText.match(/(?:Nama|Nama\s*:)\s*([A-Z\s\.,]{3,40})/i);
  if (nameMatch) {
    data.nama = cleanCustomerName(nameMatch[1].replace(/[:\-]/g, ''));
  }

  // TTL: e.g. "T.NAGODANG, 07-12-1990" or "PEKANBARU, 13-10-1989"
  const ttlMatch = rawText.match(/(?:Tempat\/Tgl\s*Lahir|TTL|Lahir)\s*[:]?\s*([A-Za-z\s\.,]+)[,]\s*(\d{2}[-\/]\d{2}[-\/]\d{4})/i);
  if (ttlMatch) {
    data.tempatLahir = cleanCustomerName(ttlMatch[1].replace(/[:\-]/g, ''));
    data.tanggalLahir = ttlMatch[2].replace(/\//g, '-');
  }

  // Gender
  if (/PEREMPUAN|WANITA/i.test(rawText)) {
    data.jenisKelamin = 'PEREMPUAN';
  } else if (/LAKI-LAKI|PRIA/i.test(rawText)) {
    data.jenisKelamin = 'LAKI-LAKI';
  }

  return data;
}

/**
 * Main OCR function: tries Gemini first if available, falls back to Tesseract
 */
async function processKTPImage(imageBuffer, mimeType = 'image/jpeg') {
  if (config.GEMINI_API_KEY) {
    try {
      console.log('Menjalankan OCR menggunakan Google Gemini Vision AI...');
      return await extractKTPWithGemini(imageBuffer, mimeType);
    } catch (e) {
      console.warn('Gemini OCR gagal atau error, beralih ke Tesseract offline:', e.message);
    }
  }

  console.log('Menjalankan OCR menggunakan Tesseract offline...');
  return await extractKTPWithTesseract(imageBuffer);
}

module.exports = {
  processKTPImage,
  extractKTPWithGemini,
  extractKTPWithTesseract,
  parseRawKTPText
};
