const config = require('./config');
const { createWorker } = require('tesseract.js');
const fs = require('fs');
const { cleanCustomerName } = require('./renderer');

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

  const base64Data = imageBuffer.toString('base64');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${config.GEMINI_API_KEY}`;

  const prompt = `
Anda adalah sistem OCR KTP Indonesia yang sangat teliti.
Analisis foto KTP berikut (bisa miring, terbalik, berbayang, atau sebagian).
Ekstrak data berikut dan kembalikan HANYA JSON murni tanpa markdown, tanpa backticks:
{
  "nik": "16 digit angka NIK tanpa spasi/strip",
  "nama": "Nama lengkap huruf kapital",
  "tempatLahir": "Tempat lahir saja (contoh: PEKANBARU, PAKAN SILAKAN)",
  "tanggalLahir": "DD-MM-YYYY (contoh: 07-12-1990)",
  "jenisKelamin": "LAKI-LAKI atau PEREMPUAN",
  "alamatKtp": "Alamat lengkap KTP",
  "rtRw": "RT/RW jika ada",
  "kelurahan": "Kelurahan/Desa KTP jika ada",
  "kecamatan": "Kecamatan KTP jika ada",
  "agama": "Agama jika ada"
}
Jika salah satu nilai tidak terbaca atau tidak yakin, beri nilai string kosong "". Pastikan NIK terdiri dari 16 digit.
`;

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: mimeType,
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

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  const textOutput = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textOutput) {
    throw new Error('Tidak ada respon teks dari Gemini Vision');
  }

  try {
    const cleaned = textOutput.replace(/```json/g, '').replace(/```/g, '').trim();
    const data = JSON.parse(cleaned);
    if (data.nama) data.nama = cleanCustomerName(data.nama);
    if (data.tempatLahir) data.tempatLahir = cleanCustomerName(data.tempatLahir);
    return data;
  } catch (err) {
    throw new Error(`Gagal memparsing JSON hasil OCR: ${err.message}`);
  }
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

  // NIK: 16 digits
  const nikMatch = rawText.match(/\b([1-9][0-9]{15})\b/);
  if (nikMatch) data.nik = nikMatch[1];

  // Name: usually follows 'Nama' or 'Nama :'
  const nameMatch = rawText.match(/(?:Nama|Nama\s*:)\s*([A-Z\s\.,]{3,40})/i);
  if (nameMatch) {
    data.nama = cleanCustomerName(nameMatch[1].replace(/[:\-]/g, ''));
  }

  // TTL: e.g. "T.NAGODANG, 07-12-1990" or "PAKAN SILAKAN, 20-11-1987"
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
