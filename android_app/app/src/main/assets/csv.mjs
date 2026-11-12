export const FILE_LIMIT = 5 * 1024 * 1024;
export const ROW_LIMIT = 5000;
const columns = ['period', 'date', 'desc', 'amount_cents', 'category', 'tur', 'bank', 'kart'];
const kinds = ['harcama', 'indirim', 'odeme'];

function csvRows(text) {
  const rows = [];
  let row = [], field = '', quoted = false, closed = false;
  function finishField() {
    row.push(field);
    field = '';
    closed = false;
  }
  function finishRow() {
    finishField();
    if (row.length > 1 || row[0] !== '') rows.push(row);
    if (rows.length > ROW_LIMIT + 1) throw new Error('En fazla 5.000 işlem içe aktarılabilir.');
    row = [];
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = false;
        closed = true;
      }
    } else if (char === ',') {
      finishField();
    } else if (char === '\n' || char === '\r') {
      finishRow();
      if (char === '\r' && text[i + 1] === '\n') i++;
    } else if (char === '"' && !field && !closed) {
      quoted = true;
    } else if (closed || char === '"') {
      throw new Error('CSV tırnak biçimi geçersiz.');
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error('CSV içinde kapanmamış tırnak var.');
  if (field || row.length || closed) finishRow();
  return rows;
}

function validDate(value) {
  if (!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseStatementCsv(text) {
  const [header = [], ...rows] = csvRows(text.replace(/^\uFEFF/, ''));
  if (new Set(header).size !== header.length || !columns.every(key => header.includes(key))) {
    throw new Error('Raporlar ekranından indirilen kart işlemleri CSV dosyasını seç.');
  }
  if (!rows.length) throw new Error('Dosyada kart işlemi bulunamadı.');
  const positions = columns.map(key => header.indexOf(key));
  const idPosition = header.indexOf('transaction_id');
  return rows.map((row, index) => {
    const [period, date, desc, amount, category, kind, bank, card] = positions.map(i => row[i]);
    const cents = Number(amount);
    const transactionId = idPosition<0 ? '' : (row[idPosition]??'').trim();
    if (row.length !== header.length || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)
        || !validDate(date) || !desc?.trim() || !/^-?\d+$/.test(amount)
        || !Number.isSafeInteger(cents) || Math.abs(cents) > 1_000_000_000_000
        || transactionId.length>200 || !kinds.includes(kind) || (kind === 'indirim' ? cents > 0 : cents < 0)) {
      throw new Error(`${index + 1}. işlem okunamadı. Liste kaydedilmedi.`);
    }
    return { period, date, desc, cents, category: category.trim() || 'Diğer', kind, bank, card, ...(transactionId ? {transactionId} : {}) };
  });
}

export function summarize(rows) {
  let spent = 0, refunds = 0, payments = 0;
  const categories = new Map();
  for (const { cents, kind, category } of rows) {
    if (kind === 'odeme') {
      payments += cents;
      continue;
    }
    if (kind === 'indirim') refunds -= cents;
    else spent += cents;
    categories.set(category, (categories.get(category) ?? 0) + cents);
  }
  return { spent, refunds, payments, net: spent - refunds,
    categories: [...categories].sort((a, b) => b[1] - a[1]) };
}
