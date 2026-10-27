const config = require('./config');

/**
 * Extracts fields from sales message text
 * @param {string} text 
 * @returns {Object}
 */
function parseSalesMessage(text) {
  const result = {};

  if (!text) return result;

  // 1. Koordinat / Tikor (e.g. "0.504425,101.485352" or "0.415629, 101.452324")
  const tikorMatch = text.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
  if (tikorMatch) {
    result.tikor = `${tikorMatch[1]},${tikorMatch[2]}`;
  }

  // 2. Email (e.g. "ycool898989@gmail.com")
  const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) {
    result.email = emailMatch[1].trim();
    // Auto username: prefix before @
    result.username = result.email.split('@')[0];
  }

  // 3. Phone number: (+62 852-1517-0485 or 089672191983)
  const phoneMatch = text.match(/(?:\+62|62|0)[\s-]*([0-9]{2,4})[\s-]*([0-9]{3,5})[\s-]*([0-9]{3,5})/);
  if (phoneMatch) {
    let cleanPhone = text.match(/(?:\+62|62|0)[0-9\s-]{9,17}/)?.[0] || '';
    cleanPhone = cleanPhone.replace(/\D/g, '');
    if (cleanPhone.startsWith('62')) {
      cleanPhone = '0' + cleanPhone.substring(2);
    }
    result.noHp = cleanPhone;
  }

  // 4. Home ID / Homepass (e.g. "28452H000.3.06424" or "Home ID: 28452H000.3.06424" or "28286-802")
  const homeIdMatch = text.match(/(?:Home\s*ID|Homepass|HP)\s*[:]?\s*([0-9]{5}[A-Za-z0-9\.\-_]+)/i) 
    || text.match(/\b([0-9]{5}[A-Za-z0-9\.\-_]{3,20})\b/);
  if (homeIdMatch) {
    result.homeId = homeIdMatch[1].trim();
    // Extract first 5 digits as Kode Pos!
    const zipMatch = result.homeId.match(/^(\d{5})/);
    if (zipMatch) {
      result.kodePos = zipMatch[1];
    }
  }

  // 5. Alamat Pemasangan, Kelurahan, Kecamatan
  const alamatMatch = text.match(/(?:Alamat\s*(?:Pemasangan)?)\s*[:]?\s*([^\n\r]+)/i);
  if (alamatMatch) {
    result.alamat = alamatMatch[1].trim();
  }

  const kelMatch = text.match(/(?:Kelurahan|Kel)\s*[:]?\s*([^\n\r,]+)/i);
  if (kelMatch) {
    result.kelurahan = kelMatch[1].trim().toUpperCase();
  }

  const kecMatch = text.match(/(?:Kecamatan|Kec)\s*[:]?\s*([^\n\r,]+)/i);
  if (kecMatch) {
    result.kecamatan = kecMatch[1].trim().toUpperCase();
  }

  // 6. Service / Paket (e.g. "Paket 40mbps", "FB 20", "FB 100", "CBN FIBER, FIBER 40")
  const paketMatch = text.match(/(?:Paket|Service|Speed)\s*[:]?\s*([^\n\r]+)/i)
    || text.match(/\b(20\s*mbps|40\s*mbps|50\s*mbps|100\s*mbps|FB\s*20|FB\s*40|FB\s*100|FIBER\s*\d+)\b/i);
  if (paketMatch) {
    const rawPaket = paketMatch[1].trim();
    result.service = normalizeServiceName(rawPaket);
  }

  // 7. AE Name / Sales Name (if mentioned)
  const aeMatch = text.match(/(?:AE\s*Name|Sales|AE)\s*[:]?\s*([A-Za-z\s\.,]{3,30})/i);
  if (aeMatch) {
    result.aeName = aeMatch[1].trim();
  }

  return result;
}

/**
 * Normalizes package name to CBN standard format
 */
function normalizeServiceName(raw) {
  if (!raw) return config.DEFAULT_SERVICE;
  const num = raw.match(/\d+/)?.[0];
  if (num) {
    return `CBN FIBER, FIBER ${num}`;
  }
  return raw.toUpperCase();
}

/**
 * Formats date into DD-MM-YYYY
 */
function getFormattedToday() {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Generates WhatsApp Sales Order Text matching Image 2
 */
function formatSalesOrder(data) {
  const soDate = data.soDate || getFormattedToday();
  const vendor = data.vendor || config.DEFAULT_VENDOR;
  const tlCode = data.tlCode || config.DEFAULT_TL_CODE;
  const tlName = data.tlName || config.DEFAULT_TL_NAME;
  const aeName = data.aeName || config.DEFAULT_AE_NAME;

  const nama = (data.nama || '').toUpperCase();
  const nik = data.nik || '';
  const ttl = `${(data.tempatLahir || '').toUpperCase()}, ${data.tanggalLahir || ''}`;
  const gender = (data.jenisKelamin || '').toLowerCase();
  const noHp = data.noHp || '';
  const alamat = data.alamat || '';
  const kelurahan = (data.kelurahan || '').toUpperCase();
  const kecamatan = (data.kecamatan || '').toUpperCase();
  const kodePos = data.kodePos || (data.homeId ? data.homeId.substring(0, 5) : '');
  const tikor = data.tikor || '';
  const homeId = data.homeId || '';
  const username = data.username || (data.email ? data.email.split('@')[0] : '');
  const service = data.service || config.DEFAULT_SERVICE;
  const email = data.email || '';

  return `Sales Order
Vendor:\t${vendor}
SO Date:\t${soDate}
TL Code:\t${tlCode}
TL Name:\t${tlName}
AE Name:\t${aeName}
 
Nama Pelanggan : ${nama}
Nomor KTP:\t${nik}
TTL: ${ttl}
Jenis Kelamin:\t${gender}
NO HP: ${noHp}
Alamat Pemasangan : ${alamat}
Kelurahan:\t${kelurahan}
Kecamatan:\t${kecamatan}
Kode Pos:\t${kodePos}
Tikor:\t${tikor}
Home ID: ${homeId}
Username:${username}
Service:\t${service}
Email Pelanggan : ${email}`;
}

module.exports = {
  parseSalesMessage,
  normalizeServiceName,
  getFormattedToday,
  formatSalesOrder
};
