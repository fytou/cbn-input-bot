const { parseSalesMessage, formatSalesOrder } = require('./src/parser');
const { generateBAImage } = require('./src/renderer');

async function testWorkflow() {
  console.log('--- Testing User Screenshot Case ---');

  const userCaption = `
Nama ae : bambang
Nama tl : fito
Tl code : mmp038
No HP : 081901300522
Email : fuzzakiari@gmail.com
Paket : 300 MBPS
Alamat ; Jl.bata No.~28482-283
Kelurahan : kulim
Kecamatan : kulim
Homepass : 28452H000.3.06424
  `;

  const parsed = parseSalesMessage(userCaption);
  console.log('Parsed Sales Message:', parsed);

  // Verifications
  if (parsed.noHp !== '081901300522') {
    throw new Error(`Expected noHp '081901300522', got '${parsed.noHp}'`);
  }
  if (parsed.homeId !== '28452H000.3.06424') {
    throw new Error(`Expected homeId '28452H000.3.06424', got '${parsed.homeId}'`);
  }
  if (parsed.kodePos !== '28452') {
    throw new Error(`Expected kodePos '28452', got '${parsed.kodePos}'`);
  }
  if (parsed.tlName !== 'fito') {
    throw new Error(`Expected tlName 'fito', got '${parsed.tlName}'`);
  }
  if (parsed.templateType !== 'FB 100') {
    throw new Error(`Expected templateType 'FB 100', got '${parsed.templateType}'`);
  }

  // Simulated KTP data
  const ktpData = {
    nama: 'SARI I FH BEMPATTGLLAHIR',
    nik: '1471044712900001',
    tempatLahir: 'T.NAGODANG',
    tanggalLahir: '07-12-1990',
    jenisKelamin: 'perempuan'
  };

  const combined = {
    ...ktpData,
    ...parsed,
    soDate: '27-10-2026'
  };

  console.log('\n--- Formatted WhatsApp Sales Order Output ---');
  const soText = formatSalesOrder(combined);
  console.log(soText);

  // Check noHp in SO text
  if (!soText.includes('NO HP: 081901300522')) {
    throw new Error('NO HP not formatted correctly in SO text!');
  }
  if (!soText.includes('Home ID: 28452H000.3.06424')) {
    throw new Error('Home ID not formatted correctly in SO text!');
  }
  if (!soText.includes('Kode Pos:\t28452')) {
    throw new Error('Kode Pos not formatted correctly in SO text!');
  }

  console.log('\n--- Rendering BA Digital Image ---');
  const outPath = await generateBAImage(combined, combined.templateType, 'templates/preview_user_fixed.png');
  console.log('BA Digital created at:', outPath);

  const fs = require('fs');
  fs.unlinkSync(outPath);

  console.log('\n✅ ALL TESTS & BUG FIXES PASSED PERFECTLY!');
}

testWorkflow().catch(console.error);
