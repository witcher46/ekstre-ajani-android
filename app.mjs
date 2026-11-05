import { FILE_LIMIT, parseStatementCsv, summarize } from './model.mjs';
import { sample } from './sample.mjs';

const $ = id => document.getElementById(id);
const storageKey = 'ekstre-ajani-mobil:v1';
const money = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });
const month = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const types = { harcama: 'Harcama', indirim: 'İade / indirim', odeme: 'Kart ödemesi' };
const pageSize = 40;
let saved = [], pending = null, visibleRows = [], limit = pageSize, reading = 0;

function message(text) {
  $('status').textContent = text;
}
function display(rows, source) {
  const periods = [...new Set(rows.map(row => row.period))].sort().reverse();
  $('period').replaceChildren(...periods.map(period =>
    new Option(month.format(new Date(period + '-01T00:00:00Z')), period)));
  $('report').hidden = !periods.length;
  $('source').textContent = source;
  $('query').value = '';
  visibleRows = rows;
  limit = pageSize;
  render();
}
function showSaved() {
  pending = null;
  $('confirm').hidden = true;
  $('return-saved').hidden = true;
  $('clear').hidden = !saved.length;
  display(saved, 'Telefonda kayıtlı kart işlemleri');
}
function listItem(title, detail, cents) {
  const item = document.createElement('li');
  const label = document.createElement('span');
  label.textContent = title;
  if (detail) {
    const small = document.createElement('small');
    small.textContent = detail;
    label.append(small);
  }
  const amount = document.createElement('strong');
  amount.textContent = money.format(cents / 100);
  item.append(label, amount);
  return item;
}
function render() {
  const rows = visibleRows.filter(row => row.period === $('period').value);
  const summary = summarize(rows);
  for (const key of ['net', 'spent', 'refunds', 'payments']) {
    $(key).textContent = money.format(summary[key] / 100);
  }
  $('categories').replaceChildren(...summary.categories.map(([name, cents]) => listItem(name, '', cents)));
  if (!summary.categories.length) $('categories').textContent = 'Bu dönemde harcama veya iade yok.';
  const query = $('query').value.trim().toLocaleLowerCase('tr');
  const filtered = rows.filter(row => `${row.desc} ${row.category}`.toLocaleLowerCase('tr').includes(query))
    .sort((a, b) => b.date.localeCompare(a.date));
  $('count').textContent = filtered.length ? `${Math.min(limit, filtered.length)} / ${filtered.length} işlem` : 'İşlem bulunamadı.';
  $('transactions').replaceChildren(...filtered.slice(0, limit).map(row => listItem(row.desc,
    [row.date.split('-').reverse().join('.'), row.bank, row.card, types[row.kind], row.category]
      .filter(Boolean).join(' · '), row.cents)));
  $('more').hidden = filtered.length <= limit;
}

$('csv').addEventListener('change', async event => {
  const input = event.currentTarget;
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  const token = ++reading;
  showSaved();
  message('CSV okunuyor…');
  try {
    if (file.size > FILE_LIMIT) throw new Error('CSV dosyası en fazla 5 MB olabilir.');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
    if (token !== reading) return;
    pending = parseStatementCsv(text);
    display(pending, 'CSV önizlemesi');
    $('confirm').hidden = false;
    message(`${pending.length} işlem okundu. ${saved.length ? 'Kaydedersen mevcut kart listesi bu dosyayla değiştirilir.' : 'Kaydetmek için listeyi onayla.'}`);
  } catch (error) {
    if (token === reading) message(error instanceof TypeError ? 'Dosya okunamadı veya UTF-8 biçiminde değil.' : error.message);
  }
});
$('save').addEventListener('click', () => {
  if (!pending) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(pending));
  } catch {
    message('Liste kaydedilemedi. Tarayıcı depolamasını ve boş alanı kontrol et.');
    return;
  }
  saved = pending;
  pending = null;
  $('confirm').hidden = true;
  $('clear').hidden = false;
  $('source').textContent = 'Telefonda kayıtlı kart işlemleri';
  message('Kart listesi bu cihaza kaydedildi.');
});
$('cancel').addEventListener('click', () => {
  showSaved();
  message('Önizleme kapatıldı.');
});
$('sample').addEventListener('click', () => {
  reading++;
  pending = null;
  $('confirm').hidden = true;
  $('return-saved').hidden = !saved.length;
  $('clear').hidden = true;
  display(parseStatementCsv(sample), 'Örnek veri');
  message('Örnek işlemler kaydedilmez.');
});
$('return-saved').addEventListener('click', () => {
  showSaved();
  message('Kayıtlı kart listesi açıldı.');
});
$('clear').addEventListener('click', () => {
  if (!confirm('Telefondaki kayıtlı kart listesi silinsin mi?')) return;
  reading++;
  try {
    localStorage.removeItem(storageKey);
    saved = [];
    showSaved();
    message('Telefondaki liste silindi.');
  } catch {
    message('Liste silinemedi. Tarayıcı depolamasını kontrol et.');
  }
});
for (const [id, event] of [['period', 'change'], ['query', 'input']]) {
  $(id).addEventListener(event, () => { limit = pageSize; render(); });
}
$('more').addEventListener('click', () => { limit += pageSize; render(); });

try {
  saved = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
  if (!Array.isArray(saved)) throw new Error();
  showSaved();
} catch {
  saved = [];
  showSaved();
  message('Telefondaki kayıtlı liste okunamadı.');
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    if (!$('status').textContent) message('Çevrimdışı kullanım hazırlanamadı.');
  });
}
