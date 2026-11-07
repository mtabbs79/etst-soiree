// Small CSV reader/writer (handles quotes, commas and newlines inside quotes).
function parse(text) {
  const rows = [];
  let row = [], field = '', i = 0, inQuotes = false;
  text = String(text || '').replace(/^﻿/, '');
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',' || c === '\t') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ''));
}

function cell(v) {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  // Guard against spreadsheet formula injection.
  if (/^[=@]/.test(s) || /^[+\-](?![\d\s(])/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function stringify(header, rows) {
  return '﻿' + [header, ...rows].map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

module.exports = { parse, stringify };
