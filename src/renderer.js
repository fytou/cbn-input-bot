const path = require('path');
const sharp = require('sharp');
const fs = require('fs');
const config = require('./config');

/**
 * Renders customer data onto the CBN BA template
 * @param {Object} data 
 * @param {string} templateType - 'FB 20' or 'FB 100'
 * @param {string} outputPath 
 * @returns {Promise<string>}
 */
async function generateBAImage(data, templateType = 'FB 20', outputPath = null) {
  const templateFile = templateType.includes('100') 
    ? path.resolve(__dirname, '../templates/template_fb100.png')
    : path.resolve(__dirname, '../templates/template_fb20.png');

  if (!fs.existsSync(templateFile)) {
    throw new Error(`Template file tidak ditemukan: ${templateFile}`);
  }

  const out = outputPath || path.resolve(__dirname, `../output_ba_${Date.now()}.png`);

  const nama = (data.nama || '').toUpperCase();
  const tempatLahir = (data.tempatLahir || '').toUpperCase();
  const tanggalLahir = data.tanggalLahir || '';
  const nik = (data.nik || '').replace(/\D/g, '');
  const noHp = data.noHp || '';
  const alamat = data.alamat || '';
  const kelurahan = (data.kelurahan || '').toUpperCase();
  const kecamatan = (data.kecamatan || '').toUpperCase();
  const kodePos = (data.kodePos || (data.homeId ? data.homeId.substring(0, 5) : '')).replace(/\D/g, '');
  const email = data.email || '';
  const username = data.username || (email ? email.split('@')[0] : '');

  // Gender checkbox
  const genderLower = (data.jenisKelamin || '').toLowerCase();
  const isPria = genderLower.includes('pria') || genderLower.includes('laki');
  const checkPria = isPria ? '<text x="558" y="157" class="bold-check">X</text>' : '';
  const checkWanita = !isPria ? '<text x="630" y="157" class="bold-check">X</text>' : '';

  // Box digits for NIK (16 boxes)
  let nikSvg = '';
  const nikStartX = 153;
  const nikStep = 18.2;
  for (let i = 0; i < Math.min(nik.length, 16); i++) {
    const x = nikStartX + i * nikStep;
    nikSvg += `<text x="${x}" y="159" class="bold-digit">${nik[i]}</text>`;
  }

  // Box digits for Kode Pos (5 boxes)
  let posSvg = '';
  const posStartX = 603;
  const posStep = 18.5;
  for (let i = 0; i < Math.min(kodePos.length, 5); i++) {
    const x = posStartX + i * posStep;
    posSvg += `<text x="${x}" y="301" class="bold-digit">${kodePos[i]}</text>`;
  }

  // Handle long address wrapping if needed
  let addressSvg = '';
  if (alamat.length > 45) {
    const part1 = alamat.substring(0, 42);
    const part2 = alamat.substring(42);
    addressSvg = `
      <text x="225" y="254" class="bold-text alamat">${escapeXml(part1)}</text>
      <text x="225" y="268" class="bold-text alamat">${escapeXml(part2)}</text>
    `;
  } else {
    addressSvg = `<text x="225" y="258" class="bold-text alamat">${escapeXml(alamat)}</text>`;
  }

  const svg = `
  <svg width="723" height="1024" xmlns="http://www.w3.org/2000/svg">
    <style>
      .bold-text { font-family: 'Arial', 'Segoe UI', sans-serif; font-weight: 900; fill: #000000; }
      .bold-check { font-family: 'Arial', sans-serif; font-weight: 900; font-size: 16px; fill: #000000; }
      .bold-digit { font-family: 'Arial', sans-serif; font-weight: 900; font-size: 16px; fill: #000000; text-anchor: middle; }
      .nama { font-size: 16px; letter-spacing: 0.5px; }
      .ttl-place { font-size: 15px; }
      .ttl-date { font-size: 15px; letter-spacing: 1px; }
      .phone { font-size: 15px; letter-spacing: 1px; }
      .alamat { font-size: 12.5px; }
      .kelurahan { font-size: 15px; letter-spacing: 0.5px; }
      .kecamatan { font-size: 15px; letter-spacing: 0.5px; }
      .email { font-size: 14px; }
      .username { font-size: 14px; }
    </style>

    <!-- NAMA PELANGGAN -->
    <text x="210" y="106" class="bold-text nama">${escapeXml(nama)}</text>

    <!-- TEMPAT / TANGGAL LAHIR -->
    <text x="155" y="132" class="bold-text ttl-place">${escapeXml(tempatLahir)}</text>
    <text x="415" y="132" class="bold-text ttl-date">${escapeXml(tanggalLahir)}</text>

    <!-- NIK DIGITS -->
    ${nikSvg}

    <!-- JENIS KELAMIN -->
    ${checkPria}
    ${checkWanita}

    <!-- NO HP -->
    <text x="505" y="181" class="bold-text phone">${escapeXml(noHp)}</text>

    <!-- ALAMAT PEMASANGAN -->
    ${addressSvg}

    <!-- KELURAHAN -->
    <text x="210" y="278" class="bold-text kelurahan">${escapeXml(kelurahan)}</text>

    <!-- KECAMATAN -->
    <text x="150" y="297" class="bold-text kecamatan">${escapeXml(kecamatan)}</text>

    <!-- KODE POS DIGITS -->
    ${posSvg}

    <!-- ALAMAT EMAIL -->
    <text x="210" y="342" class="bold-text email">${escapeXml(email)}</text>

    <!-- USERNAME -->
    <text x="70" y="845" class="bold-text username">${escapeXml(username)}</text>
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
  generateBAImage
};
