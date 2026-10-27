const path = require('path');
const sharp = require('sharp');
const fs = require('fs');

/**
 * Clean customer name from stray KTP labels
 */
function cleanCustomerName(rawName) {
  if (!rawName) return '';
  let name = String(rawName).toUpperCase();
  // Strip common KTP label words that sometimes stick to name in OCR
  name = name.replace(/\b(TEMPAT|TGL|LAHIR|GOL|DARAH|ALAMAT|AGAMA|STATUS|PERKAWINAN|PEKERJAAN|KEWARGANEGARAAN|BERLAKU|HINGGA|PROVINSI|KOTA|KABUPATEN)\b/gi, ' ');
  return name.replace(/\s+/g, ' ').trim();
}

/**
 * Box digits for NIK (16 boxes)
 * Box centers start at 159 with step 13.85
 */
function formatNIKBoxesSvg(nik) {
  const cleanNik = (nik || '').replace(/\D/g, '').substring(0, 16);
  let svg = '';
  const startX = 159;
  const step = 13.85;
  for (let i = 0; i < cleanNik.length; i++) {
    const x = (startX + i * step).toFixed(1);
    svg += `<text x="${x}" y="158" class="digit-nik">${cleanNik[i]}</text>\n`;
  }
  return svg;
}

/**
 * Box digits for Birth Date in dd / mm / yyyy boxes
 * dd centers: 422, 436
 * mm centers: 462, 476
 * yyyy centers: 503, 517, 531, 545
 */
function formatDateBoxesSvg(dateStr) {
  if (!dateStr) return '';
  let svg = '';
  const parts = String(dateStr).replace(/[\/\.]/g, '-').split('-');
  if (parts.length >= 3) {
    const dd = parts[0].padStart(2, '0');
    const mm = parts[1].padStart(2, '0');
    const yyyy = parts[2];

    if (dd[0]) svg += `<text x="422" y="133" class="digit-date">${dd[0]}</text>\n`;
    if (dd[1]) svg += `<text x="436" y="133" class="digit-date">${dd[1]}</text>\n`;

    if (mm[0]) svg += `<text x="462" y="133" class="digit-date">${mm[0]}</text>\n`;
    if (mm[1]) svg += `<text x="476" y="133" class="digit-date">${mm[1]}</text>\n`;

    for (let i = 0; i < Math.min(yyyy.length, 4); i++) {
      const x = 503 + i * 14;
      svg += `<text x="${x}" y="133" class="digit-date">${yyyy[i]}</text>\n`;
    }
  } else {
    svg += `<text x="420" y="133" class="digit-date">${escapeXml(dateStr)}</text>\n`;
  }
  return svg;
}

/**
 * Box digits for Mobile Phone (14 boxes)
 * Box centers start at 506 with step 13.85
 */
function formatPhoneBoxesSvg(phone) {
  let clean = (phone || '').replace(/\D/g, '');
  if (clean.startsWith('62')) clean = '0' + clean.substring(2);
  let svg = '';
  const startX = 506;
  const step = 13.85;
  for (let i = 0; i < Math.min(clean.length, 14); i++) {
    const x = (startX + i * step).toFixed(1);
    svg += `<text x="${x}" y="181" class="digit-phone">${clean[i]}</text>\n`;
  }
  return svg;
}

/**
 * Box digits for Kode Pos (5 boxes)
 * Box centers: 617, 631, 645, 658, 672
 */
function formatZipBoxesSvg(zip) {
  const clean = (zip || '').replace(/\D/g, '').substring(0, 5);
  const centers = [617, 631, 645, 658, 672];
  let svg = '';
  for (let i = 0; i < Math.min(clean.length, 5); i++) {
    svg += `<text x="${centers[i]}" y="301" class="digit-zip">${clean[i]}</text>\n`;
  }
  return svg;
}

/**
 * Renders customer data onto the CBN BA template with pixel precision
 * @param {Object} data 
 * @param {string} templateType - 'FB 20' or 'FB 100'
 * @param {string} outputPath 
 * @returns {Promise<string>}
 */
async function generateBAImage(data, templateType = 'FB 20', outputPath = null) {
  const is100 = templateType.includes('100') || templateType.includes('200');
  const templateFile = is100
    ? path.resolve(__dirname, '../templates/template_fb100.png')
    : path.resolve(__dirname, '../templates/template_fb20.png');

  if (!fs.existsSync(templateFile)) {
    throw new Error(`Template file tidak ditemukan: ${templateFile}`);
  }

  const out = outputPath || path.resolve(__dirname, `../output_ba_${Date.now()}.png`);

  const nama = cleanCustomerName(data.nama);
  const tempatLahir = cleanCustomerName(data.tempatLahir);
  const tanggalLahir = data.tanggalLahir || '';
  const nikSvg = formatNIKBoxesSvg(data.nik);
  const dateSvg = formatDateBoxesSvg(tanggalLahir);
  const phoneSvg = formatPhoneBoxesSvg(data.noHp);
  const zipSvg = formatZipBoxesSvg(data.kodePos);

  // Gender checkbox
  const genderLower = (data.jenisKelamin || '').toLowerCase();
  const isPria = genderLower.includes('pria') || genderLower.includes('laki');
  const checkPria = isPria ? '<text x="551" y="157" class="check-box">X</text>' : '';
  const checkWanita = !isPria ? '<text x="617" y="157" class="check-box">X</text>' : '';

  // Email and Username
  const email = (data.email || '').trim();
  const username = (data.username || (email ? email.split('@')[0] : '')).trim();

  // Installation Address lines:
  // Row 1: Street address (Jl...)
  // Row 2: Kelurahan
  // Row 3: Kecamatan
  const alamat = (data.alamat || '').trim();
  const kelurahan = (data.kelurahan || '').trim().toUpperCase();
  const kecamatan = (data.kecamatan || '').trim().toUpperCase();

  let line1 = alamat;
  let line2 = kelurahan ? `KEL. ${kelurahan}` : '';
  let line3 = kecamatan ? `KEC. ${kecamatan}` : '';

  // If street address is omitted, cascade kelurahan & kecamatan cleanly
  if (!line1 && line2) {
    line1 = line2;
    line2 = line3;
    line3 = '';
  }

  const svg = `
  <svg width="723" height="1024" xmlns="http://www.w3.org/2000/svg">
    <style>
      .bold-field { font-family: 'Arial', 'Segoe UI', 'Helvetica', sans-serif; font-weight: 900; fill: #000000; }
      .nama-text { font-size: 14px; letter-spacing: 0.5px; }
      .ttl-text { font-size: 13.5px; }
      .digit-date { font-family: 'Arial', sans-serif; font-size: 13.5px; font-weight: 900; fill: #000000; text-anchor: middle; }
      .digit-nik { font-family: 'Arial', sans-serif; font-size: 13.5px; font-weight: 900; fill: #000000; text-anchor: middle; }
      .digit-phone { font-family: 'Arial', sans-serif; font-size: 13px; font-weight: 900; fill: #000000; text-anchor: middle; }
      .digit-zip { font-family: 'Arial', sans-serif; font-size: 13px; font-weight: 900; fill: #000000; text-anchor: middle; }
      .check-box { font-family: 'Arial', sans-serif; font-size: 15px; font-weight: 900; fill: #000000; text-anchor: middle; }
      .addr-text { font-size: 12.5px; }
      .email-text { font-size: 13px; }
      .user-text { font-size: 13px; }
    </style>

    <!-- 1. NAMA PELANGGAN -->
    <text x="158" y="106" class="bold-field nama-text">${escapeXml(nama)}</text>

    <!-- 2. TEMPAT LAHIR -->
    <text x="158" y="133" class="bold-field ttl-text">${escapeXml(tempatLahir)}</text>

    <!-- 3. TANGGAL LAHIR (in dd/mm/yyyy individual boxes) -->
    ${dateSvg}

    <!-- 4. NIK (in 16 individual boxes) -->
    ${nikSvg}

    <!-- 5. JENIS KELAMIN (in checkboxes) -->
    ${checkPria}
    ${checkWanita}

    <!-- 6. TELEPON SELULAR (in individual phone boxes) -->
    ${phoneSvg}

    <!-- 7. ALAMAT PEMASANGAN (Row 1) -->
    <text x="210" y="258" class="bold-field addr-text">${escapeXml(line1)}</text>

    <!-- 8. KELURAHAN (Row 2) -->
    <text x="210" y="278" class="bold-field addr-text">${escapeXml(line2)}</text>

    <!-- 9. KECAMATAN (Row 3, left of RT/RW) -->
    <text x="210" y="298" class="bold-field addr-text">${escapeXml(line3)}</text>

    <!-- 10. KODE POS (in 5 individual boxes on Row 3) -->
    ${zipSvg}

    <!-- 11. EMAIL PELANGGAN -->
    <text x="158" y="348" class="bold-field email-text">${escapeXml(email)}</text>

    <!-- 12. USERNAME (in clean activation box) -->
    <text x="35" y="848" class="bold-field user-text">${escapeXml(username)}</text>
  </svg>
  `;

  await sharp(templateFile)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toFile(out);

  return out;
}

function escapeXml(unsafe) {
  return String(unsafe || '').replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

module.exports = {
  cleanCustomerName,
  generateBAImage
};
