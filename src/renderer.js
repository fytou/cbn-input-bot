const path = require('path');
const sharp = require('sharp');
const fs = require('fs');

/**
 * Clean customer name from stray KTP labels or OCR artifacts
 */
function cleanCustomerName(rawName) {
  if (!rawName) return '';
  let name = String(rawName).toUpperCase();
  // Strip stray OCR words like BEMPATTGLLAHIR, TEMPAT, TGLLAHIR, etc.
  name = name.replace(/\b[A-Z]*(?:TEMPAT|BEMPAT|TGLLAHIR|LAHIR|GOL|DARAH|AGAMA|STATUS|NIK|WARGA|PROV|KOTA|KAB)[A-Z]*\b/gi, ' ');
  name = name.replace(/[0-9\/\-\:\;\,\.\~]/g, ' ');
  return name.replace(/\s+/g, ' ').trim();
}

/**
 * Clean address from stray leading punctuation
 */
function cleanAddress(raw) {
  if (!raw) return '';
  return String(raw).replace(/^[\s;:\-~]+/, '').trim();
}

/**
 * Box digits for NIK (16 boxes)
 * Box centers start at 159 with step 13.85, baseline at y=159
 */
function formatNIKBoxesSvg(nik) {
  const cleanNik = (nik || '').replace(/\D/g, '').substring(0, 16);
  let svg = '';
  const startX = 159;
  const step = 13.85;
  for (let i = 0; i < cleanNik.length; i++) {
    const x = (startX + i * step).toFixed(1);
    svg += `<text x="${x}" y="159" class="digit-nik">${cleanNik[i]}</text>\n`;
  }
  return svg;
}

/**
 * Box digits for Birth Date in dd / mm / yyyy boxes
 * dd centers: 422, 436
 * mm centers: 462, 476
 * yyyy centers: 503, 517, 531, 545
 * baseline at y=135
 */
function formatDateBoxesSvg(dateStr) {
  if (!dateStr) return '';
  let svg = '';
  const parts = String(dateStr).replace(/[\/\.]/g, '-').split('-');
  if (parts.length >= 3) {
    const dd = parts[0].padStart(2, '0');
    const mm = parts[1].padStart(2, '0');
    const yyyy = parts[2];

    if (dd[0]) svg += `<text x="422" y="135" class="digit-date">${dd[0]}</text>\n`;
    if (dd[1]) svg += `<text x="436" y="135" class="digit-date">${dd[1]}</text>\n`;

    if (mm[0]) svg += `<text x="462" y="135" class="digit-date">${mm[0]}</text>\n`;
    if (mm[1]) svg += `<text x="476" y="135" class="digit-date">${mm[1]}</text>\n`;

    for (let i = 0; i < Math.min(yyyy.length, 4); i++) {
      const x = 503 + i * 14;
      svg += `<text x="${x}" y="135" class="digit-date">${yyyy[i]}</text>\n`;
    }
  } else {
    svg += `<text x="420" y="135" class="digit-date">${escapeXml(dateStr)}</text>\n`;
  }
  return svg;
}

/**
 * Box digits for Kode Pos (5 boxes)
 * Exact box centers: 610, 624, 638, 652, 666
 * baseline at y=311
 */
function formatZipBoxesSvg(zip) {
  const clean = (zip || '').replace(/\D/g, '').substring(0, 5);
  const centers = [610, 624, 638, 652, 666];
  let svg = '';
  for (let i = 0; i < Math.min(clean.length, 5); i++) {
    svg += `<text x="${centers[i]}" y="311" class="digit-zip">${clean[i]}</text>\n`;
  }
  return svg;
}

/**
 * Renders customer data onto the CBN BA template matching the reference layout exactly
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
  const zipSvg = formatZipBoxesSvg(data.kodePos);

  // Phone: single string letter-spaced inside the phone box container
  let cleanPhone = (data.noHp || '').replace(/\D/g, '');
  if (cleanPhone.startsWith('62')) cleanPhone = '0' + cleanPhone.substring(2);

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
  const alamat = cleanAddress(data.alamat);
  let kelurahan = (data.kelurahan || '').replace(/^KEL\.?\s*/i, '').trim().toUpperCase();
  let kecamatan = (data.kecamatan || '').replace(/^KEC\.?\s*/i, '').trim().toUpperCase();

  let line1 = alamat;
  let line2 = kelurahan;
  let line3 = kecamatan;

  if (!line1 && line2) {
    line1 = line2;
    line2 = line3;
    line3 = '';
  }

  const svg = `
  <svg width="723" height="1024" xmlns="http://www.w3.org/2000/svg">
    <style>
      .bold-field { font-family: 'Arial', 'Segoe UI', 'Helvetica', sans-serif; font-weight: 900; fill: #000000; }
      .nama-text { font-size: 15px; letter-spacing: 0.5px; }
      .ttl-text { font-size: 14px; }
      .digit-date { font-family: 'Arial', sans-serif; font-size: 14px; font-weight: 900; fill: #000000; text-anchor: middle; }
      .digit-nik { font-family: 'Arial', sans-serif; font-size: 14px; font-weight: 900; fill: #000000; text-anchor: middle; }
      .phone-text { font-family: 'Arial', sans-serif; font-size: 14.5px; font-weight: 900; fill: #000000; letter-spacing: 2px; }
      .digit-zip { font-family: 'Arial', sans-serif; font-size: 14px; font-weight: 900; fill: #000000; text-anchor: middle; }
      .check-box { font-family: 'Arial', sans-serif; font-size: 15px; font-weight: 900; fill: #000000; text-anchor: middle; }
      .addr-text { font-size: 13px; }
      .kel-text { font-size: 14px; letter-spacing: 0.5px; }
      .kec-text { font-size: 14px; letter-spacing: 0.5px; }
      .email-text { font-size: 13.5px; }
      .user-text { font-size: 14px; }
    </style>

    <!-- 1. NAMA PELANGGAN (Inside boxes at x=209, y=107) -->
    <text x="209" y="107" class="bold-field nama-text">${escapeXml(nama)}</text>

    <!-- 2. TEMPAT LAHIR (x=155, y=135) -->
    <text x="155" y="135" class="bold-field ttl-text">${escapeXml(tempatLahir)}</text>

    <!-- 3. TANGGAL LAHIR (in dd/mm/yyyy individual boxes, y=135) -->
    ${dateSvg}

    <!-- 4. NIK (in 16 individual boxes, y=159) -->
    ${nikSvg}

    <!-- 5. JENIS KELAMIN (in checkboxes, y=157) -->
    ${checkPria}
    ${checkWanita}

    <!-- 6. TELEPON SELULAR (x=506, y=186, inside phone container) -->
    <text x="506" y="186" class="phone-text">${escapeXml(cleanPhone)}</text>

    <!-- 7. ALAMAT PEMASANGAN (Row 1: x=228, y=264) -->
    <text x="228" y="264" class="bold-field addr-text">${escapeXml(line1)}</text>

    <!-- 8. KELURAHAN (Row 2: x=209, y=288) -->
    <text x="209" y="288" class="bold-field kel-text">${escapeXml(line2)}</text>

    <!-- 9. KECAMATAN (Row 3: x=155, y=307) -->
    <text x="155" y="307" class="bold-field kec-text">${escapeXml(line3)}</text>

    <!-- 10. KODE POS (in 5 boxes, centers: 610, 624, 638, 652, 666, y=311) -->
    ${zipSvg}

    <!-- 11. EMAIL PELANGGAN (x=209, y=358) -->
    <text x="209" y="358" class="bold-field email-text">${escapeXml(email)}</text>

    <!-- 12. USERNAME (x=75, y=873, inside the activation box) -->
    <text x="75" y="873" class="bold-field user-text">${escapeXml(username)}</text>
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
  cleanAddress,
  generateBAImage
};
