// توابع کمکی تاریخ، زمان، رمزنگاری
'use strict';
const crypto = require('crypto');

const pad = n => String(n).padStart(2, '0');

function ymd(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(s, n) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}
function weekday(s) { return parseYmd(s).getDay(); } // 0=یکشنبه ... 6=شنبه
function toMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function fromMin(m) { return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; }
function nowMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
function dayDiff(a, b) { return Math.round((parseYmd(b) - parseYmd(a)) / 86400000); }
/** زمان مطلق یک نوبت (میلی‌ثانیه) */
function stamp(date, time) { const d = parseYmd(date); d.setMinutes(toMin(time)); return d.getTime(); }
function isValidDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(parseYmd(s)); }
function isValidTime(s) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(s || ''); }

function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(pw), salt, 32).toString('hex');
  return { salt, hash };
}
function verifyPassword(pw, salt, hash) {
  const h = crypto.scryptSync(String(pw), salt, 32);
  return crypto.timingSafeEqual(h, Buffer.from(hash, 'hex'));
}
const token = () => crypto.randomBytes(24).toString('hex');

/** تبدیل ارقام فارسی/عربی به انگلیسی */
function normDigits(s) {
  return String(s ?? '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
}
function isMobile(s) { return /^09\d{9}$/.test(s); }
function isNationalCode(code) {
  if (!/^\d{10}$/.test(code) || /^(\d)\1{9}$/.test(code)) return false;
  const c = +code[9];
  const s = code.split('').slice(0, 9).reduce((a, d, i) => a + (+d) * (10 - i), 0) % 11;
  return (s < 2 && c === s) || (s >= 2 && c === 11 - s);
}

module.exports = {
  pad, ymd, parseYmd, addDays, weekday, toMin, fromMin, nowMin, dayDiff, stamp,
  isValidDate, isValidTime, hashPassword, verifyPassword, token, normDigits, isMobile, isNationalCode
};
