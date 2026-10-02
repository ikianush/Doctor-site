// لایه‌ی ذخیره‌سازی: پایگاه‌داده‌ی سبک مبتنی بر سند JSON
//  • حالت محلی (npm start): فایل data/db.json با نوشتن اتمیک
//  • حالت ابری (Vercel و…): Redis (Upstash) از طریق REST API — بدون هیچ پکیج اضافه
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SERVERLESS = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
// روی سرورلس فقط /tmp قابل نوشتن است (موقت)
const DATA_DIR = SERVERLESS ? '/tmp' : path.join(__dirname, '..', 'data');
const DB_FILE = process.env.NOBAN_DB || path.join(DATA_DIR, SERVERLESS ? 'noban-db.json' : 'db.json');

/* ---------------- Redis (Upstash REST) ---------------- */
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const REMOTE = !!(REDIS_URL && REDIS_TOKEN);
const KEY = process.env.NOBAN_REDIS_KEY || 'noban:db';
let remoteRev = null;   // آخرین نسخه‌ی دیده‌شده از Redis
let savedVersion = 0;   // آخرین نسخه‌ی محلی که در Redis ذخیره شد

async function redis(cmds) {
  const pipeline = Array.isArray(cmds[0]);
  const r = await fetch(REDIS_URL.replace(/\/$/, '') + (pipeline ? '/pipeline' : ''), {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds)
  });
  if (!r.ok) throw new Error('Redis HTTP ' + r.status + ': ' + (await r.text()).slice(0, 200));
  const j = await r.json();
  return pipeline ? j.map(x => x.result) : j.result;
}
// داده فشرده (gzip+base64) ذخیره می‌شود: ~۲ مگابایت ← ~۲۰۰ کیلوبایت
const pack = obj => zlib.gzipSync(JSON.stringify(obj)).toString('base64');
const unpack = str => JSON.parse(zlib.gunzipSync(Buffer.from(str, 'base64')).toString('utf8'));

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

function normalize() { COLLECTIONS.forEach(c => { if (!Array.isArray(state[c])) state[c] = []; }); }

/** بارگذاری اولیه از Redis؛ اگر خالی بود true برمی‌گرداند (نیاز به seed) */
async function loadRemote() {
  const [rev, blob] = await redis([['GET', KEY + ':rev'], ['GET', KEY]]);
  if (!blob) { state = empty(); return true; }
  state = unpack(blob); normalize();
  remoteRev = rev; version++; savedVersion = version;
  return false;
}
/** پیش از هر درخواست: اگر نمونه‌ی دیگری از سرور داده را تغییر داده، نسخه‌ی تازه بارگذاری شود */
async function sync() {
  if (!REMOTE) return;
  const rev = await redis(['GET', KEY + ':rev']);
  if (rev === remoteRev) return;
  const blob = await redis(['GET', KEY]);
  if (!blob) return;
  state = unpack(blob); normalize();
  remoteRev = rev; version++; savedVersion = version;
}
/** اولین ذخیره پس از seed: فقط اگر نمونه‌ی دیگری زودتر seed نکرده باشد (SET NX) */
async function commitInitial() {
  if (!REMOTE) return commit();
  const ok = await redis(['SET', KEY, pack(state), 'NX']);
  if (ok === 'OK') { remoteRev = String(await redis(['INCR', KEY + ':rev'])); savedVersion = version; }
  else { remoteRev = null; await sync(); } // دیگری زودتر ساخته؛ همان را بارگذاری کن
}
/** پس از هر درخواست: اگر داده تغییر کرده، ذخیره شود (قبل از ارسال پاسخ) */
async function commit() {
  if (version === savedVersion) return;
  const v = version;
  if (REMOTE) {
    const [, rev] = await redis([['SET', KEY, pack(state)], ['INCR', KEY + ':rev']]);
    remoteRev = String(rev);
  } else flush();
  savedVersion = v;
}

function flush() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, DB_FILE);
}

function save() {
  version++;
  if (REMOTE || SERVERLESS) return; // در حالت ابری، commit() پس از هر درخواست ذخیره می‌کند
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
  load, loadRemote, sync, commit, commitInitial, reset, save, flush, insert, update, remove,
  REMOTE, SERVERLESS,
  get data() { return state; },
  get version() { return version; },
  find: (col, id) => state[col].find(r => r.id === id),
  all: col => state[col],
  DB_FILE
};
