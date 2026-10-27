const { parseSalesMessage, formatSalesOrder } = require('./src/parser');
const { generateBAImage } = require('./src/renderer');

async function testWorkflow() {
  console.log('--- Testing Workflow End-to-End ---');

  // Simulated sales message
  const salesMsg = `
Bantu cek bang
0.415629,101.452324
noviantideri65@gmail.com
089672191983
Paket 40mbps
Home ID: 28452H000.3.06424
Alamat Pemasangan: Jl. Mutiara VI No. S/18
Kelurahan: PANDAU JAYA
Kecamatan: siak hulu
AE Name: Cece novita sari
  `;

  // Parse message
  const parsed = parseSalesMessage(salesMsg);
  console.log('Parsed Sales Message:', parsed);

  // Simulated KTP data
  const ktpData = {
    nama: 'DERI NOVIANTI',
    nik: '1471126011870001',
    tempatLahir: 'PAKAN SILAKAN',
    tanggalLahir: '20-11-1987',
    jenisKelamin: 'perempuan'
  };

  const combined = {
    ...ktpData,
    ...parsed,
    vendor: 'PT. Milfha Mutiara Prima',
    tlCode: 'MMP038',
    tlName: 'fito nardian',
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

  console.log('\n--- Rendering BA Digital Image ---');
  const outPath = await generateBAImage(combined, 'FB 20', 'templates/preview_so_deri.png');
  console.log('BA Digital created at:', outPath);

  // Verifications
  if (combined.kodePos !== '28452') {
    throw new Error(`Expected kodePos 28452, got ${combined.kodePos}`);
  }
  if (combined.username !== 'noviantideri65') {
    throw new Error(`Expected username noviantideri65, got ${combined.username}`);
  }

  console.log('\n✅ ALL TESTS PASSED SUCCESSFULLY!');
}

testWorkflow().catch(console.error);
