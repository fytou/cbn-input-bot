const config = require('./config');
const { findTeamByAE } = require('./team');
const { cleanCustomerName, cleanAddress } = require('./renderer');

/**
 * Extracts fields from sales message text
 * @param {string} text 
 * @returns {Object}
 */
function parseSalesMessage(text) {
  const result = {};

  if (!text) return result;

  // 1. Line-by-line key:value or key;value parser
  const lines = text.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Support both ':' and ';' as delimiter
    let sepIdx = line.indexOf(':');
    const semiIdx = line.indexOf(';');
    if (sepIdx === -1 || (semiIdx !== -1 && semiIdx < sepIdx)) {
      sepIdx = semiIdx;
    }

    if (sepIdx !== -1) {
      const key = line.substring(0, sepIdx).trim().toLowerCase();
      const val = line.substring(sepIdx + 1).trim();

      if (!val) continue;

      if (key.includes('nama pelanggan') || key === 'nama' || key === 'nama lengkap') {
        result.nama = cleanCustomerName(val);
      } else if (key.includes('ktp') || key === 'nik' || key.includes('nomor identitas')) {
        result.nik = val.replace(/\D/g, '');
      } else if (key === 'ttl' || key.includes('tempat tanggal lahir')) {
        const ttlParts = val.split(',');
        if (ttlParts.length >= 2) {
          result.tempatLahir = cleanCustomerName(ttlParts[0]);
          result.tanggalLahir = ttlParts[1].trim();
        }
      } else if (key.includes('kelamin') || key === 'gender' || key === 'jenis kelamin') {
        result.jenisKelamin = val;
      } else if (key.includes('hp') || key.includes('telepon') || key.includes('wa') || key.includes('no hp')) {
        let clean = val.replace(/\D/g, '');
        if (clean.startsWith('62')) clean = '0' + clean.substring(2);
        result.noHp = clean;
      } else if (key.includes('homepass') || key.includes('home id') || key.includes('home_id') || key.includes('id home')) {
        result.homeId = val.trim();
        const zip = result.homeId.match(/^([1-9][0-9]{4})/);
        if (zip) result.kodePos = zip[1];
      } else if (key.includes('alamat') || key.includes('pemasangan')) {
        result.alamat = cleanAddress(val);
      } else if (key.includes('kelurahan') || key === 'kel') {
        result.kelurahan = val.toUpperCase().replace(/^KEL\.?\s*/i, '').trim();
      } else if (key.includes('kecamatan') || key === 'kec') {
        result.kecamatan = val.toUpperCase().replace(/^KEC\.?\s*/i, '').trim();
      } else if (key.includes('kode pos') || key === 'pos') {
        result.kodePos = val.replace(/\D/g, '').substring(0, 5);
      } else if (key.includes('tikor') || key.includes('koordinat')) {
        result.tikor = val.trim();
      } else if (key.includes('email')) {
        const em = val.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (em) {
          result.email = em[1].trim();
          result.username = result.email.split('@')[0];
        } else {
          result.email = val.trim();
        }
      } else if (key.includes('username')) {
        result.username = val.trim();
      } else if (key.includes('paket') || key.includes('service') || key.includes('speed')) {
        result.service = normalizeServiceName(val);
        const speedNum = parseInt(val.match(/\d+/)?.[0] || '20', 10);
        if (speedNum >= 100) {
          result.templateType = 'FB 100';
        } else {
          result.templateType = 'FB 20';
        }
      } else if (key.includes('ae') || key.includes('sales')) {
        result.aeName = val.trim();
        const matched = findTeamByAE(val);
        if (matched) {
          result.aeName = matched.aeName;
          result.tlCode = matched.tlCode;
          result.tlName = matched.tlName;
          result.vendor = matched.vendor;
        }
      } else if (key.includes('tl code') || key.includes('kode tl')) {
        result.tlCode = val.trim();
      } else if (key.includes('tl name') || key.includes('nama tl')) {
        result.tlName = val.trim();
      } else if (key.includes('vendor')) {
        result.vendor = val.trim();
      }
    }
  }

  // 2. Fallback regex parsers for unformatted / free-text pasted blocks
  // Tikor (lat,lng)
  if (!result.tikor) {
    const tikorMatch = text.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
    if (tikorMatch) result.tikor = `${tikorMatch[1]},${tikorMatch[2]}`;
  }

  // Email
  if (!result.email) {
    const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) {
      result.email = emailMatch[1].trim();
      result.username = result.email.split('@')[0];
    }
  }

  // Phone (only matches 08... or +628... or 628...)
  if (!result.noHp) {
    const phoneMatch = text.match(/(?:\+62|62|0)8[0-9\s-]{8,14}/);
    if (phoneMatch) {
      let clean = phoneMatch[0].replace(/\D/g, '');
      if (clean.startsWith('62')) clean = '0' + clean.substring(2);
      result.noHp = clean;
    }
  }

  // Homepass / Home ID (Strict: requires Homepass or Home ID keyword, or format 28xxxH...)
  if (!result.homeId) {
    const hpMatch = text.match(/(?:Home\s*pass|Homepass|Home\s*ID|ID\s*Home)[ \t]*[:;]?[ \t]*([A-Za-z0-9\.\-_]+)/i)
      || text.match(/\b([1-9][0-9]{4}[A-Za-z][A-Za-z0-9\.\-_]{3,25})\b/);
    if (hpMatch) {
      result.homeId = hpMatch[1].trim();
      const zipMatch = result.homeId.match(/^([1-9][0-9]{4})/);
      if (zipMatch && !result.kodePos) {
        result.kodePos = zipMatch[1];
      }
    }
  }

  // Auto Kode Pos from Home ID if not set
  if (!result.kodePos && result.homeId) {
    const zip = result.homeId.match(/^([1-9][0-9]{4})/);
    if (zip) result.kodePos = zip[1];
  }

  // Auto Username from Email if not set
  if (!result.username && result.email) {
    result.username = result.email.split('@')[0];
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

  const nama = cleanCustomerName(data.nama);
  const nik = (data.nik || '').replace(/\D/g, '');
  const ttlPlace = cleanCustomerName(data.tempatLahir);
  const ttl = `${ttlPlace}, ${data.tanggalLahir || ''}`;
  const gender = (data.jenisKelamin || '').toLowerCase();
  const noHp = data.noHp || '';
  const alamat = cleanAddress(data.alamat);
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
