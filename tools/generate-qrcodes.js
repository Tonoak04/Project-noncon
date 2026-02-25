const fs = require('fs-extra');
const path = require('path');
const QRCode = require('qrcode');
const sharp = require('sharp');

function escapeXml(unsafe) {
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
const { parse } = require('csv-parse/sync');
const mysql = require('mysql2/promise');
const CSV_PATH = path.resolve(__dirname, '..', 'mysql-files', 'machines.csv');
const OUT_DIR = path.resolve(__dirname, 'qrcodes');
const PRINT_HTML = path.join(OUT_DIR, 'print.html');
const BASE_URL = 'http://172.16.3.106:8080/#/machines'; 

const DB_CONFIG = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 9906,
  user: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || 'rootpassword',
  database: process.env.DB_DATABASE || 'project_noncon',
  connectTimeout: 5000,
};

async function main() {
  await fs.ensureDir(OUT_DIR);
  await fs.emptyDir(OUT_DIR);
  const csvText = await fs.readFile(CSV_PATH, 'utf8');
  const rows = parse(csvText, { columns: true, skip_empty_lines: true });

  let db;
  try {
    db = await mysql.createPool(DB_CONFIG);
  } catch (err) {
    console.error('Failed to connect to DB:', err.message || err);
    console.error('Make sure MySQL is running and connection settings are correct.');
    process.exit(1);
  }

  const entries = [];
  for (const r of rows) {
    const equipment = (r.Equipment || r['Equipment'] || '').toString().trim();
    if (!equipment) continue;

    let machineId = null;
    try {
      const [rowsDb] = await db.execute('SELECT Machine_Id FROM Machines WHERE Equipment = ? LIMIT 1', [equipment]);
      if (Array.isArray(rowsDb) && rowsDb.length > 0) {
        machineId = rowsDb[0].Machine_Id;
      }
    } catch (err) {
      console.warn('DB lookup failed for', equipment, err && err.message ? err.message : err);
    }

    if (!machineId) {
      console.warn('No Machine_Id found for Equipment=', equipment, '- skipping QR generation');
      continue;
    }

    const category = (r['Machine_Type'] || r['Machine Type'] || r['Category'] || r['category'] || Object.values(r)[0] || '').toString().trim();
    const cls = (r['Class'] || r['class'] || r['ClassName'] || r['Class_Id'] || r['CLS'] || equipment || machineId || '').toString().trim();
    const payload = `${BASE_URL}/${encodeURIComponent(String(machineId))}?category=${encodeURIComponent(category)}&class=${encodeURIComponent(cls)}`;
    const safeName = equipment.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '').substring(0, 60) || 'unknown';
    const filename = path.join(OUT_DIR, `machine-${safeName}.png`);

    const qrBuffer = await QRCode.toBuffer(payload, {
      type: 'png',
      width: 600,
      margin: 6,
      errorCorrectionLevel: 'H', 
    });

    const overlayLine1 = equipment;
    const overlayLine2 = cls || String(machineId || '');
    const overlaySvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">
  <rect x="190" y="210" width="220" height="180" rx="16" ry="16" fill="#ffffff" fill-opacity="0.85" />
</svg>`;

    const labelHeight = 120;
    const svgText = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="${labelHeight}">
  <rect x="100" y="18" width="400" height="84" rx="14" ry="14" fill="#ffffff" fill-opacity="0.9" />
  <text x="50%" y="50%" font-family="Arial, Helvetica, ans-serif" font-size="64" fill="#000000" font-weight="600" dominant-baseline="middle" text-anchor="middle">${escapeXml(equipment)}</text>
</svg>`;

    await sharp(qrBuffer)
      .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
      .extend({ top: 0, bottom: labelHeight, left: 0, right: 0, background: { r: 255, g: 255, b: 255 } })
      .composite([{ input: Buffer.from(svgText), top: 250, left: 0 }])
      .png()
      .toFile(filename);

    entries.push({ id: machineId, equipment, file: `machine-${safeName}.png`, payload });
    console.log('Wrote', filename, '->', payload, '(equipment:', equipment, ')');
  }

  try { await db.end(); } catch (e) { /* ignore */ }

  const htmlParts = [];
  htmlParts.push('<!doctype html>');
  htmlParts.push('<html><head><meta charset="utf-8"><title>QR Codes</title>');
  htmlParts.push('<style>body{font-family:Arial,Helvetica,sans-serif} .grid{display:flex;flex-wrap:wrap} .tile{width:33%;box-sizing:border-box;padding:8px;text-align:center} img{width:160px;height:160px} .caption{margin-top:6px;font-size:14px}</style>');
  htmlParts.push('</head><body>');
  htmlParts.push('<h1>Machine QR Codes</h1>');
  htmlParts.push('<div class="grid">');
  for (const e of entries) {
    htmlParts.push(`<div class="tile"><img src="${e.file}" alt="QR ${e.id}"><div class="caption">${e.id}</div></div>`);
  }
  htmlParts.push('</div>');
  htmlParts.push('</body></html>');

  await fs.writeFile(PRINT_HTML, htmlParts.join('\n'), 'utf8');
  console.log('Wrote print HTML:', PRINT_HTML);
  console.log(`Open ${PRINT_HTML} in a browser and print to PDF or paper.`);
}

main().catch(err => { console.error(err); process.exit(1); });
