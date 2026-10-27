const { parseSalesMessage, formatSalesOrder } = require('./src/parser');
const { generateBAImage } = require('./src/renderer');

async function testWorkflow() {
  console.log('--- Testing Workflow End-to-End & Team Auto-Resolution ---');

  // Simulated sales message with AE: cece and blank TL fields
  const salesMsg = `
nama AE : cece
TL CODE : 
TL NAME : 
0.415629,101.452324
noviantideri65@gmail.com
089672191983
Paket 40mbps
Home ID: 28452H000.3.06424
Alamat Pemasangan: Jl. Mutiara VI No. S/18
Kelurahan: PANDAU JAYA
Kecamatan: siak hulu
  `;

  // Parse message
  const parsed = parseSalesMessage(salesMsg);
  console.log('Parsed Sales Message:', parsed);

  // Verification 1: AE auto mapping
  if (parsed.aeName !== 'Cece novita sari') {
    throw new Error(`Expected AE Name 'Cece novita sari', got '${parsed.aeName}'`);
  }
  if (parsed.tlCode !== 'MMP038') {
    throw new Error(`Expected TL Code 'MMP038', got '${parsed.tlCode}'`);
  }
  if (parsed.tlName !== 'fito nardian') {
    throw new Error(`Expected TL Name 'fito nardian', got '${parsed.tlName}'`);
  }

  // Simulated KTP data with deliberate stray label word 'TEMPAT'
  const ktpData = {
    nama: 'NURMAINI TEMPAT',
    nik: '3471105310858023',
    tempatLahir: 'PEKANBARU',
    tanggalLahir: '13-10-1989',
    jenisKelamin: 'perempuan'
  };

  const combined = {
    ...ktpData,
    ...parsed,
    soDate: '27-10-2026'
  };

  // Check derived fields
  if (!combined.kodePos && combined.homeId) {
    combined.kodePos = combined.homeId.substring(0, 5);
  }
  if (!combined.username && combined.email) {
    combined.username = combined.email.split('@')[0];
  }

  console.log('\n--- Formatted WhatsApp Sales Order Output ---');
  const soText = formatSalesOrder(combined);
  console.log(soText);

  // Verification 2: Clean Name
  if (soText.includes('NURMAINITEMPAT') || soText.includes('NURMAINI TEMPAT')) {
    throw new Error('Name still contains stray TEMPAT word!');
  }

  console.log('\n--- Rendering High-Precision BA Digital Image (FB 20) ---');
  const outPath20 = await generateBAImage(combined, 'FB 20', 'templates/preview_so_precision_fb20.png');
  console.log('BA Digital FB20 created at:', outPath20);

  console.log('\n--- Rendering High-Precision BA Digital Image (FB 100/200) ---');
  const outPath100 = await generateBAImage(combined, 'FB 100', 'templates/preview_so_precision_fb100.png');
  console.log('BA Digital FB100 created at:', outPath100);

  // Clean up
  const fs = require('fs');
  fs.unlinkSync(outPath20);
  fs.unlinkSync(outPath100);

  console.log('\n✅ ALL TESTS & TEAM AUTO-RESOLUTIONS PASSED PERFECTLY!');
}

testWorkflow().catch(console.error);
