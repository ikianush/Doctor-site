// تبدیل تاریخ میلادی ⇄ شمسی (الگوریتم jalaali-js — MIT) و قالب‌بندی فارسی
const div = (a, b) => ~~(a / b);
const mod = (a, b) => a - ~~(a / b) * b;
const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

function jalCal(jy) {
  let gy = jy + 621, leapJ = -14, jp = BREAKS[0], jm, jump = 0, n, i;
  for (i = 1; i < BREAKS.length; i++) {
    jm = BREAKS[i]; jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}
function g2d(gy, gm, gd) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
}
function d2g(jdn) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1, gm = mod(div(i, 153), 12) + 1;
  return { gy: div(j, 1461) - 100100 + div(8 - gm, 6), gm, gd };
}
function j2d(jy, jm, jd) { const r = jalCal(jy); return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1; }
function d2j(jdn) {
  const gy = d2g(jdn).gy; let jy = gy - 621;
  const r = jalCal(jy); let k = jdn - g2d(gy, 3, r.march), jm, jd;
  if (k >= 0) { if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 }; k -= 186; }
  else { jy -= 1; k += 179; if (r.leap === 1) k += 1; }
  jm = 7 + div(k, 30); jd = mod(k, 30) + 1;
  return { jy, jm, jd };
}

export const toJalali = (gy, gm, gd) => d2j(g2d(gy, gm, gd));
export const toGregorian = (jy, jm, jd) => d2g(j2d(jy, jm, jd));
export const isLeapJ = jy => jalCal(jy).leap === 0;
export const monthLength = (jy, jm) => (jm <= 6 ? 31 : jm <= 11 ? 30 : isLeapJ(jy) ? 30 : 29);

export const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
// ایندکس بر اساس getDay جاوااسکریپت (۰=یکشنبه)
export const WEEKDAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
export const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5]; // شنبه تا جمعه
export const WD_SHORT = { 6: 'ش', 0: 'ی', 1: 'د', 2: 'س', 3: 'چ', 4: 'پ', 5: 'ج' };

const pad = n => String(n).padStart(2, '0');
export const fa = v => String(v ?? '').replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
export const en = v => String(v ?? '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));

export function parse(ymd) { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, m - 1, d); }
export function ymd(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function addDays(s, n) { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); }
export function jOf(s) { const d = parse(s); return toJalali(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
export function fromJ(jy, jm, jd) { const g = toGregorian(jy, jm, jd); return `${g.gy}-${pad(g.gm)}-${pad(g.gd)}`; }
export function weekday(s) { return parse(s).getDay(); }
export function diffDays(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }

/** ۱۴۰۵/۰۷/۰۳ */
export function short(s) { if (!s) return '—'; const j = jOf(s); return fa(`${j.jy}/${pad(j.jm)}/${pad(j.jd)}`); }
/** ۳ مهر ۱۴۰۵ */
export function long(s, withYear = true) { if (!s) return '—'; const j = jOf(s); return fa(`${j.jd} ${MONTHS[j.jm - 1]}${withYear ? ' ' + j.jy : ''}`); }
/** شنبه ۳ مهر */
export function withDay(s, withYear = false) { return `${WEEKDAYS[weekday(s)]} ${long(s, withYear)}`; }
/** امروز / فردا / پس‌فردا / شنبه ۳ مهر */
export function relative(s) {
  const d = diffDays(ymd(), s);
  if (d === 0) return 'امروز';
  if (d === 1) return 'فردا';
  if (d === 2) return 'پس‌فردا';
  if (d === -1) return 'دیروز';
  return withDay(s);
}
export function monthDay(s) { const j = jOf(s); return { day: fa(j.jd), month: MONTHS[j.jm - 1], year: fa(j.jy), weekday: WEEKDAYS[weekday(s)] }; }
export function isoToYmd(iso) { return ymd(new Date(iso)); }
export function time(iso) { const d = new Date(iso); return fa(`${pad(d.getHours())}:${pad(d.getMinutes())}`); }
export function dateTime(iso) { return `${short(isoToYmd(iso))} — ${time(iso)}`; }
export function ago(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'همین حالا';
  if (s < 3600) return fa(Math.floor(s / 60)) + ' دقیقه پیش';
  if (s < 86400) return fa(Math.floor(s / 3600)) + ' ساعت پیش';
  if (s < 86400 * 30) return fa(Math.floor(s / 86400)) + ' روز پیش';
  return short(isoToYmd(iso));
}
export function nowJalaliText() {
  const t = ymd(); return `${withDay(t, true)}`;
}
