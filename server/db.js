// لایه‌ی ذخیره‌سازی: پایگاه‌داده‌ی سبک مبتنی بر فایل JSON با نوشتن اتمیک
'use strict';
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = process.env.NOBAN_DB || path.join(DATA_DIR, 'db.json');

const COLLECTIONS = [
  'users', 'doctors', 'specialties', 'centers', 'schedules', 'leaves',
  'appointments', 'waitlist', 'notifications', 'reviews', 'sessions',
  'sms', 'logs', 'tickets'
];

let state = null;
let saveTimer = null;
let version = 0;

function empty() {
  const s = { meta: { createdAt: new Date().toISOString(), seq: {} }, settings: {} };
  COLLECTIONS.forEach(c => (s[c] = []));
  return s;
}

function load() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    try {
      state = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      COLLECTIONS.forEach(c => { if (!Array.isArray(state[c])) state[c] = []; });
      return false;
    } catch (e) {
      console.error('⚠️  فایل پایگاه‌داده خراب است؛ نسخه‌ی پشتیبان ساخته و دیتابیس از نو ساخته می‌شود.');
      fs.renameSync(DB_FILE, DB_FILE + '.broken-' + Date.now());
    }
  }
  state = empty();
  return true; // نیاز به seed
}

function reset() { state = empty(); version++; }

function flush() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, DB_FILE);
}

function save() {
  version++;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 150);
}

function nextId(col) {
  const seq = state.meta.seq;
  seq[col] = (seq[col] || state[col].reduce((m, r) => Math.max(m, r.id || 0), 0)) + 1;
  return seq[col];
}

function insert(col, obj) {
  const row = { id: nextId(col), ...obj };
  state[col].push(row);
  save();
  return row;
}

function update(col, id, patch) {
  const row = state[col].find(r => r.id === id);
  if (!row) return null;
  Object.assign(row, patch);
  save();
  return row;
}

function remove(col, id) {
  const i = state[col].findIndex(r => r.id === id);
  if (i < 0) return false;
  state[col].splice(i, 1);
  save();
  return true;
}

module.exports = {
  load, reset, save, flush, insert, update, remove,
  get data() { return state; },
  get version() { return version; },
  find: (col, id) => state[col].find(r => r.id === id),
  all: col => state[col],
  DB_FILE
};
