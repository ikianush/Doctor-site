// سامانه‌ی نوبت‌دهی آنلاین «نوبان» — سرور HTTP بدون وابستگی خارجی (Node.js خالص)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const U = require('./util');
const S = require('./scheduling');
const { seed, DEFAULT_SETTINGS, INSURANCES } = require('./seed');

const PORT = +process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, '..', 'public');

/* ======================= راه‌اندازی ======================= */
if (db.load() || process.argv.includes('--reset')) {
  const r = seed();
  console.log(`✅ داده‌ی نمایشی ساخته شد: ${r.users} کاربر، ${r.doctors} پزشک، ${r.appointments} نوبت`);
}
db.data.settings = { ...DEFAULT_SETTINGS, ...db.data.settings };

/* ======================= روتر ساده ======================= */
const routes = [];
function route(method, pattern, roles, handler) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$');
  routes.push({ method, re, keys, roles, handler });
}
class HttpError extends Error { constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; } }
const fail = (status, msg, extra) => { throw new HttpError(status, msg, extra); };

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

function send(res, status, data, headers = {}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': typeof data === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 1e6) { reject(new HttpError(413, 'حجم درخواست بیش از حد مجاز است.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'فرمت داده نامعتبر است.')); }
    });
    req.on('error', reject);
  });
}

function authUser(req) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!t) return null;
  const s = db.data.sessions.find(x => x.token === t);
  if (!s) return null;
  const u = db.find('users', s.userId);
  if (!u || u.active === false) return null;
  s.lastSeen = Date.now();
  return u;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  if (!p.startsWith('/api/')) return serveStatic(p, res);
  const r = routes.find(r => r.method === req.method && r.re.test(p));
  if (!r) return send(res, 404, { error: 'مسیر یافت نشد.' });
  try {
    const m = p.match(r.re);
    const params = Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]]));
    const user = authUser(req);
    if (r.roles) {
      if (!user) fail(401, 'لطفاً ابتدا وارد حساب کاربری شوید.');
      if (r.roles !== 'any' && !r.roles.includes(user.role)) fail(403, 'شما به این بخش دسترسی ندارید.');
    }
    if (db.data.settings.maintenance && user?.role !== 'admin' && req.method !== 'GET' && !p.startsWith('/api/auth/')) fail(503, 'سامانه در حال به‌روزرسانی است. لطفاً دقایقی دیگر تلاش کنید.');
    const body = ['POST', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req) : {};
    const q = Object.fromEntries(url.searchParams);
    const out = await r.handler({ params, q, body, user, req, res });
    if (out === undefined) return; // پاسخ مستقیم
    send(res, 200, out);
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message, ...(e.extra || {}) });
    if (e instanceof S.BookingError) return send(res, e.code === 'NOT_FOUND' ? 404 : 409, { error: e.message, code: e.code, ...e.extra });
    console.error(e);
    send(res, 500, { error: 'خطای داخلی سرور.' });
  }
});

function serveStatic(p, res) {
  let file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) return send(res, 403, 'forbidden');
  fs.stat(file, (err, st) => {
    if (err || st.isDirectory()) file = path.join(PUBLIC, 'index.html');
    const ext = path.extname(file);
    fs.readFile(file, (e2, buf) => {
      if (e2) return send(res, 404, 'not found');
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.woff2' ? 'public, max-age=31536000' : 'no-cache' });
      res.end(buf);
    });
  });
}

/* ======================= توابع نمایش داده ======================= */
let ratingCache = { v: -1, map: new Map() };
function ratings() {
  if (ratingCache.v === db.version) return ratingCache.map;
  const map = new Map();
  for (const r of db.data.reviews) {
    if (r.approved === false) continue;
    const m = map.get(r.doctorId) || { sum: 0, n: 0 };
    m.sum += r.rating; m.n++; map.set(r.doctorId, m);
  }
  ratingCache = { v: db.version, map };
  return map;
}
function doctorCard(d, withFree = true) {
  const u = db.find('users', d.userId) || {};
  const sp = db.find('specialties', d.specialtyId) || {};
  const r = ratings().get(d.id) || { sum: 0, n: 0 };
  const visits = db.data.appointments.filter(a => a.doctorId === d.id && a.status === 'done').length;
  return {
    id: d.id, userId: d.userId, name: u.name, mobile: u.mobile, gender: d.gender, degree: d.degree, experience: d.experience, specialtyId: d.specialtyId,
    specialty: sp.name, specialtyIcon: sp.icon, city: d.city, fee: d.fee, insurances: d.insurances, accepting: d.accepting, active: d.active !== false,
    verified: d.verified, tags: d.tags || [], medicalCode: d.medicalCode, centerIds: d.centerIds,
    centers: d.centerIds.map(id => db.find('centers', id)).filter(Boolean).map(c => ({ id: c.id, name: c.name, city: c.city })),
    rating: r.n ? +(r.sum / r.n).toFixed(1) : null, reviewCount: r.n, visits,
    earliest: withFree && d.accepting ? S.firstFree(d.id) : null
  };
}
function publicUser(u) {
  if (!u) return null;
  const { salt, hash, ...rest } = u;
  return rest;
}
function apptView(a, { withPatient = false } = {}) {
  const d = db.find('doctors', a.doctorId); const du = d && db.find('users', d.userId);
  const sp = d && db.find('specialties', d.specialtyId);
  const c = db.find('centers', a.centerId);
  const out = { ...a, doctorName: du?.name, specialty: sp?.name, specialtyIcon: sp?.icon, centerName: c?.name, centerAddress: c?.address, centerPhone: c?.phone, fee: d?.fee };
  if (withPatient) {
    const p = db.find('users', a.patientId);
    out.patient = p ? { id: p.id, name: p.name, mobile: p.mobile, gender: p.gender, age: S.patientAge(p), insurance: p.insurance, nationalCode: p.nationalCode } : null;
  }
  return out;
}
const doctorOf = user => db.data.doctors.find(d => d.userId === user.id) || fail(404, 'پروفایل پزشک یافت نشد.');
const num = v => (v === undefined || v === null || v === '' ? null : +U.normDigits(v));
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const requireFields = (o, fields) => { for (const [k, label] of fields) if (!str(o[k])) fail(400, `${label} الزامی است.`); };

/* ======================= عمومی ======================= */
route('GET', '/api/meta', null, () => {
  const st = db.data.settings;
  const r = [...ratings().values()];
  const sum = r.reduce((a, m) => a + m.sum, 0), n = r.reduce((a, m) => a + m.n, 0);
  const doneCount = db.data.appointments.filter(a => a.status === 'done').length;
  return {
    settings: { siteName: st.siteName, bookingWindowDays: st.bookingWindowDays, cancelDeadlineHours: st.cancelDeadlineHours, supportPhone: st.supportPhone, maintenance: st.maintenance, reminderHours: st.reminderHours, waitlistAutoBook: st.waitlistAutoBook },
    specialties: db.data.specialties.filter(s => s.active !== false).map(s => ({ ...s, count: db.data.doctors.filter(d => d.specialtyId === s.id && d.active !== false).length })),
    centers: db.data.centers.filter(c => c.active !== false).map(c => ({ ...c, doctorCount: db.data.doctors.filter(d => d.centerIds.includes(c.id) && d.active !== false).length })),
    cities: [...new Set(db.data.centers.map(c => c.city))],
    insurances: INSURANCES,
    priorities: Object.entries(S.PRIORITY).map(([k, v]) => ({ key: k, ...v })),
    stats: { doctors: db.data.doctors.filter(d => d.active !== false).length, centers: db.data.centers.length, patients: db.data.users.filter(u => u.role === 'patient').length, visits: doneCount, satisfaction: n ? Math.round((sum / n / 5) * 100) : 0 },
    serverTime: new Date().toISOString(), today: U.ymd()
  };
});

route('GET', '/api/doctors', null, ({ q }) => {
  let list = db.data.doctors.filter(d => d.active !== false);
  const term = str(q.q).toLowerCase();
  if (q.specialty) list = list.filter(d => d.specialtyId === +q.specialty);
  if (q.center) list = list.filter(d => d.centerIds.includes(+q.center));
  if (q.city) list = list.filter(d => d.city === q.city);
  if (q.gender) list = list.filter(d => d.gender === q.gender);
  if (q.insurance) list = list.filter(d => (d.insurances || []).includes(q.insurance));
  let cards = list.map(d => doctorCard(d));
  if (term) cards = cards.filter(c => [c.name, c.specialty, c.degree, ...c.centers.map(x => x.name), c.city].join(' ').toLowerCase().includes(term));
  if (q.available === 'today') cards = cards.filter(c => c.earliest && c.earliest.date === U.ymd());
  if (q.available === 'week') cards = cards.filter(c => c.earliest && U.dayDiff(U.ymd(), c.earliest.date) < 7);
  if (q.minRating) cards = cards.filter(c => (c.rating || 0) >= +q.minRating);
  const sorts = {
    earliest: (a, b) => (a.earliest ? a.earliest.date + a.earliest.time : 'z').localeCompare(b.earliest ? b.earliest.date + b.earliest.time : 'z'),
    rating: (a, b) => (b.rating || 0) - (a.rating || 0) || b.reviewCount - a.reviewCount,
    experience: (a, b) => b.experience - a.experience,
    fee: (a, b) => a.fee - b.fee,
    popular: (a, b) => b.visits - a.visits
  };
  cards.sort(sorts[q.sort] || sorts.rating);
  return { items: cards, total: cards.length };
});

route('GET', '/api/doctors/:id', null, ({ params }) => {
  const d = db.find('doctors', +params.id);
  if (!d || d.active === false) fail(404, 'پزشک یافت نشد.');
  const reviews = db.data.reviews.filter(r => r.doctorId === d.id && r.approved !== false).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30)
    .map(r => { const u = db.find('users', r.patientId); return { ...r, patientName: u ? u.name.split(' ')[0] + ' ' + (u.name.split(' ')[1] || '').charAt(0) + '.' : 'کاربر' }; });
  const dist = [1, 2, 3, 4, 5].map(s => reviews.filter(r => r.rating === s).length);
  const schedules = db.data.schedules.filter(s => s.doctorId === d.id && s.active !== false).map(s => ({ ...s, centerName: db.find('centers', s.centerId)?.name }));
  const waitCount = db.data.waitlist.filter(w => w.doctorId === d.id && w.status === 'waiting').length;
  return { ...doctorCard(d), bio: d.bio, reviews, ratingDist: dist, schedules, waitCount, avgVisit: S.avgVisitMinutes(d.id), centersFull: d.centerIds.map(id => db.find('centers', id)).filter(Boolean) };
});

route('GET', '/api/doctors/:id/calendar', null, ({ params, q }) => {
  const from = U.isValidDate(q.from) ? q.from : U.ymd();
  return S.calendar(+params.id, from, Math.min(62, +q.days || 35));
});
route('GET', '/api/doctors/:id/slots', null, ({ params, q }) => {
  if (!U.isValidDate(q.date)) fail(400, 'تاریخ نامعتبر است.');
  const r = S.slotsFor(+params.id, q.date);
  const waitCount = db.data.waitlist.filter(w => w.doctorId === +params.id && w.date === q.date && w.status === 'waiting').length;
  return { ...r, waitCount, slots: r.slots.map(s => ({ ...s, centerName: db.find('centers', s.centerId)?.name })) };
});
route('GET', '/api/doctors/:id/suggest', null, ({ params, q }) => {
  const r = S.suggest(+params.id, q.date, q.time);
  r.slots.forEach(s => (s.centerName = db.find('centers', s.centerId)?.name));
  return r;
});

route('GET', '/api/centers/:id', null, ({ params }) => {
  const c = db.find('centers', +params.id);
  if (!c) fail(404, 'مرکز یافت نشد.');
  return { ...c, doctors: db.data.doctors.filter(d => d.centerIds.includes(c.id) && d.active !== false).map(d => doctorCard(d)) };
});

route('GET', '/api/track/:code', null, ({ params, q }) => {
  const a = db.data.appointments.find(x => x.code === U.normDigits(params.code));
  const p = a && db.find('users', a.patientId);
  if (!a || !p || p.mobile !== U.normDigits(q.mobile)) fail(404, 'نوبتی با این مشخصات یافت نشد. کد رهگیری و شماره موبایل را بررسی کنید.');
  return { ...apptView(a), patientName: p.name, queue: S.queueStatus(a) };
});

// نمایشگر سالن انتظار
route('GET', '/api/display/:centerId', null, ({ params }) => {
  const c = db.find('centers', +params.centerId);
  if (!c) fail(404, 'مرکز یافت نشد.');
  const today = U.ymd();
  const docs = db.data.doctors.filter(d => d.centerIds.includes(c.id) && d.active !== false);
  const rows = [];
  for (const d of docs) {
    const shift = db.data.schedules.some(s => s.doctorId === d.id && s.centerId === c.id && s.weekday === U.weekday(today));
    if (!shift) continue;
    const q = S.todayQueue(d.id);
    const list = q.list.filter(a => a.centerId === c.id);
    if (!list.length) continue;
    rows.push({ doctor: doctorCard(d, false).name, specialty: db.find('specialties', d.specialtyId)?.name, current: q.current ? { turn: q.current._turn, code: q.current.code.slice(-3) } : null, next: q.waiting.slice(0, 3).map(a => ({ turn: a._turn, priority: a.priority })), waiting: q.waiting.length, done: list.filter(a => a.status === 'done').length, total: list.length });
  }
  return { center: { id: c.id, name: c.name, color: c.color }, rows, time: new Date().toISOString() };
});

/* ======================= احراز هویت ======================= */
const loginFails = new Map();
function checkLock(mobile) {
  const f = loginFails.get(mobile);
  if (f && f.count >= 5 && Date.now() - f.at < 5 * 60000) fail(429, 'به دلیل تلاش‌های ناموفق متعدد، ورود برای ۵ دقیقه مسدود شد.');
}
function registerFail(mobile) { const f = loginFails.get(mobile) || { count: 0 }; f.count++; f.at = Date.now(); loginFails.set(mobile, f); }
function startSession(u) {
  const token = U.token();
  db.insert('sessions', { token, userId: u.id, createdAt: Date.now() });
  if (db.data.sessions.length > 2000) db.data.sessions.splice(0, 500);
  S.log(u.id, 'auth.login', u.mobile);
  return { token, user: publicUser(u) };
}

route('POST', '/api/auth/register', null, ({ body }) => {
  requireFields(body, [['name', 'نام و نام خانوادگی'], ['mobile', 'شماره موبایل'], ['password', 'رمز عبور']]);
  const mobile = U.normDigits(body.mobile);
  if (!U.isMobile(mobile)) fail(400, 'شماره موبایل معتبر نیست (مثال: ۰۹۱۲۱۲۳۴۵۶۷).');
  if (String(body.password).length < 6) fail(400, 'رمز عبور باید حداقل ۶ کاراکتر باشد.');
  const nc = U.normDigits(body.nationalCode || '');
  if (nc && !U.isNationalCode(nc)) fail(400, 'کد ملی وارد شده معتبر نیست.');
  if (db.data.users.some(u => u.mobile === mobile)) fail(409, 'این شماره موبایل قبلاً ثبت‌نام کرده است.');
  const { salt, hash } = U.hashPassword(body.password);
  const u = db.insert('users', { role: 'patient', name: str(body.name, 60), mobile, nationalCode: nc || null, gender: body.gender === 'f' ? 'f' : 'm', birthYear: num(body.birthYear) || null, city: str(body.city, 30) || 'تهران', insurance: str(body.insurance, 40) || null, active: true, createdAt: new Date().toISOString(), salt, hash });
  S.notify(u.id, 'welcome', 'به نوبان خوش آمدید 👋', 'حساب کاربری شما ساخته شد. اکنون می‌توانید پزشک خود را جست‌وجو و نوبت رزرو کنید.', '/search');
  S.sms(u.id, 'ثبت‌نام شما با موفقیت انجام شد.', 'auth');
  return startSession(u);
});

route('POST', '/api/auth/login', null, ({ body }) => {
  const mobile = U.normDigits(body.mobile);
  checkLock(mobile);
  const u = db.data.users.find(x => x.mobile === mobile);
  if (!u || !U.verifyPassword(body.password || '', u.salt, u.hash)) { registerFail(mobile); fail(401, 'شماره موبایل یا رمز عبور اشتباه است.'); }
  if (u.active === false) fail(403, 'حساب کاربری شما توسط مدیر مسدود شده است.');
  loginFails.delete(mobile);
  return startSession(u);
});

// ورود با رمز یک‌بارمصرف (پیامک شبیه‌سازی‌شده)
const otps = new Map();
route('POST', '/api/auth/otp', null, ({ body }) => {
  const mobile = U.normDigits(body.mobile);
  if (!U.isMobile(mobile)) fail(400, 'شماره موبایل معتبر نیست.');
  const u = db.data.users.find(x => x.mobile === mobile);
  if (!u) fail(404, 'کاربری با این شماره یافت نشد. ابتدا ثبت‌نام کنید.');
  const prev = otps.get(mobile);
  if (prev && Date.now() - prev.at < 60000) fail(429, 'برای درخواست مجدد کد، یک دقیقه صبر کنید.');
  const code = String(Math.floor(10000 + Math.random() * 90000));
  otps.set(mobile, { code, at: Date.now(), tries: 0 });
  S.sms(u.id, `کد ورود شما: ${code}`, 'otp');
  return { sent: true, demoCode: code, message: 'کد تأیید پیامک شد (در نسخه‌ی نمایشی کد روی صفحه نمایش داده می‌شود).' };
});
route('POST', '/api/auth/otp/verify', null, ({ body }) => {
  const mobile = U.normDigits(body.mobile);
  const o = otps.get(mobile);
  if (!o || Date.now() - o.at > 120000) fail(400, 'کد منقضی شده است. دوباره درخواست دهید.');
  if (++o.tries > 5) { otps.delete(mobile); fail(429, 'تعداد تلاش بیش از حد مجاز.'); }
  if (U.normDigits(body.code) !== o.code) fail(400, 'کد وارد شده صحیح نیست.');
  otps.delete(mobile);
  const u = db.data.users.find(x => x.mobile === mobile);
  if (u.active === false) fail(403, 'حساب کاربری شما مسدود است.');
  return startSession(u);
});

route('POST', '/api/auth/logout', 'any', ({ req }) => {
  const t = (req.headers.authorization || '').slice(7);
  const i = db.data.sessions.findIndex(s => s.token === t);
  if (i >= 0) { db.data.sessions.splice(i, 1); db.save(); }
  return { ok: true };
});

route('GET', '/api/me', 'any', ({ user }) => {
  const out = publicUser(user);
  if (user.role === 'doctor') out.doctor = doctorCard(doctorOf(user), false);
  out.unread = db.data.notifications.filter(n => n.userId === user.id && !n.read).length;
  return out;
});
route('PUT', '/api/me', 'any', ({ user, body }) => {
  const patch = {};
  if (body.name !== undefined) { if (!str(body.name)) fail(400, 'نام الزامی است.'); patch.name = str(body.name, 60); }
  if (body.nationalCode !== undefined) { const nc = U.normDigits(body.nationalCode); if (nc && !U.isNationalCode(nc)) fail(400, 'کد ملی معتبر نیست.'); patch.nationalCode = nc || null; }
  ['city', 'insurance', 'email', 'address'].forEach(k => body[k] !== undefined && (patch[k] = str(body[k], 80)));
  if (body.gender) patch.gender = body.gender === 'f' ? 'f' : 'm';
  if (body.birthYear !== undefined) patch.birthYear = num(body.birthYear);
  if (body.emergencyContact !== undefined) patch.emergencyContact = str(body.emergencyContact, 60);
  if (body.bloodType !== undefined) patch.bloodType = str(body.bloodType, 4);
  if (body.allergies !== undefined) patch.allergies = str(body.allergies, 200);
  db.update('users', user.id, patch);
  return publicUser(db.find('users', user.id));
});
route('PUT', '/api/me/password', 'any', ({ user, body }) => {
  if (!U.verifyPassword(body.current || '', user.salt, user.hash)) fail(400, 'رمز عبور فعلی اشتباه است.');
  if (String(body.next || '').length < 6) fail(400, 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد.');
  db.update('users', user.id, U.hashPassword(body.next));
  S.log(user.id, 'auth.password', '');
  return { ok: true };
});

/* ======================= اعلان‌ها ======================= */
route('GET', '/api/notifications', 'any', ({ user }) =>
  db.data.notifications.filter(n => n.userId === user.id).sort((a, b) => b.id - a.id).slice(0, 100));
route('POST', '/api/notifications/read-all', 'any', ({ user }) => {
  db.data.notifications.forEach(n => n.userId === user.id && (n.read = true)); db.save(); return { ok: true };
});
route('POST', '/api/notifications/:id/read', 'any', ({ user, params }) => {
  const n = db.find('notifications', +params.id);
  if (n && n.userId === user.id) db.update('notifications', n.id, { read: true });
  return { ok: true };
});

/* ======================= بیمار ======================= */
route('GET', '/api/my/appointments', ['patient'], ({ user }) => {
  const st = db.data.settings;
  return db.data.appointments.filter(a => a.patientId === user.id).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).map(a => {
    const v = apptView(a);
    v.queue = S.queueStatus(a);
    v.canCancel = a.status === 'booked' || a.status === 'checked_in' ? (U.stamp(a.date, a.time) - Date.now()) / 3600000 >= st.cancelDeadlineHours : false;
    v.canCheckin = a.status === 'booked' && a.date === U.ymd() && U.toMin(a.time) - U.nowMin() <= 60;
    v.review = db.data.reviews.find(r => r.appointmentId === a.id) || null;
    return v;
  });
});

route('POST', '/api/appointments', ['patient', 'doctor', 'admin'], ({ user, body }) => {
  let patientId = user.id;
  if (user.role !== 'patient') {
    // ثبت نوبت حضوری/تلفنی توسط پزشک یا مدیر
    const mobile = U.normDigits(body.patientMobile);
    if (!U.isMobile(mobile)) fail(400, 'شماره موبایل بیمار معتبر نیست.');
    let p = db.data.users.find(u => u.mobile === mobile);
    if (p && p.role !== 'patient') fail(400, 'این شماره متعلق به کاربر بیمار نیست.');
    if (!p) {
      if (!str(body.patientName)) fail(400, 'نام بیمار برای ساخت حساب جدید الزامی است.');
      const { salt, hash } = U.hashPassword(mobile.slice(-6));
      p = db.insert('users', { role: 'patient', name: str(body.patientName, 60), mobile, gender: 'm', active: true, createdAt: new Date().toISOString(), city: 'تهران', salt, hash });
      S.sms(p.id, 'حساب کاربری شما در نوبان ساخته شد. رمز اولیه: ۶ رقم آخر موبایل', 'auth');
    }
    patientId = p.id;
    if (user.role === 'doctor' && +body.doctorId !== doctorOf(user).id) fail(403, 'فقط برای خودتان می‌توانید نوبت ثبت کنید.');
  }
  const a = S.book({ doctorId: +body.doctorId, patientId, date: body.date, time: body.time, reason: body.reason, priority: body.priority, bookedBy: user.id, source: user.role === 'patient' ? 'online' : 'reception' });
  S.log(user.id, 'appointment.book', `نوبت #${a.id} (${a.date} ${a.time})`);
  return apptView(a);
});

function canTouch(user, a) {
  if (!a) fail(404, 'نوبت یافت نشد.');
  if (user.role === 'admin') return;
  if (user.role === 'patient' && a.patientId === user.id) return;
  if (user.role === 'doctor' && doctorOf(user).id === a.doctorId) return;
  fail(403, 'دسترسی به این نوبت ندارید.');
}

route('POST', '/api/appointments/:id/cancel', 'any', ({ user, params, body }) => {
  const a = db.find('appointments', +params.id); canTouch(user, a);
  const r = S.cancel(a, user.id, body.reason);
  S.log(user.id, 'appointment.cancel', `نوبت #${a.id}`);
  return { ok: true, promoted: r.promoted.length };
});

route('POST', '/api/appointments/:id/reschedule', ['patient', 'admin', 'doctor'], ({ user, params, body }) => {
  const a = db.find('appointments', +params.id); canTouch(user, a);
  if (a.status !== 'booked') fail(409, 'فقط نوبت‌های رزروشده قابل جابه‌جایی هستند.');
  if (user.role === 'patient' && (U.stamp(a.date, a.time) - Date.now()) / 3600000 < db.data.settings.cancelDeadlineHours) fail(409, `جابه‌جایی تنها تا ${db.data.settings.cancelDeadlineHours} ساعت قبل از نوبت ممکن است.`);
  const { slot } = S.validateBooking({ doctorId: a.doctorId, patientId: a.patientId, date: body.date, time: body.time, ignoreId: a.id });
  const old = { date: a.date, time: a.time };
  db.update('appointments', a.id, { date: body.date, time: body.time, centerId: slot.centerId, duration: slot.duration, reminders: {}, rescheduledFrom: old });
  S.notify(a.patientId, 'booked', 'نوبت جابه‌جا شد', `نوبت شما از ${old.date} ساعت ${old.time} به ${body.date} ساعت ${body.time} منتقل شد.`, '/panel/appointments');
  S.processWaitlist(a.doctorId, old.date);
  S.log(user.id, 'appointment.reschedule', `نوبت #${a.id}`);
  return apptView(db.find('appointments', a.id));
});

route('POST', '/api/appointments/:id/checkin', ['patient'], ({ user, params }) => {
  const a = db.find('appointments', +params.id); canTouch(user, a);
  if (a.status !== 'booked' || a.date !== U.ymd()) fail(409, 'پذیرش فقط در روز نوبت امکان‌پذیر است.');
  if (U.toMin(a.time) - U.nowMin() > 60) fail(409, 'پذیرش آنلاین از یک ساعت قبل از نوبت فعال می‌شود.');
  db.update('appointments', a.id, { status: 'checked_in', checkedInAt: new Date().toISOString() });
  return { ok: true, queue: S.queueStatus(a) };
});

route('POST', '/api/appointments/:id/review', ['patient'], ({ user, params, body }) => {
  const a = db.find('appointments', +params.id); canTouch(user, a);
  if (a.status !== 'done') fail(409, 'فقط پس از انجام ویزیت امکان ثبت نظر وجود دارد.');
  if (db.data.reviews.some(r => r.appointmentId === a.id)) fail(409, 'برای این نوبت قبلاً نظر ثبت کرده‌اید.');
  const rating = Math.round(num(body.rating));
  if (!(rating >= 1 && rating <= 5)) fail(400, 'امتیاز باید بین ۱ تا ۵ باشد.');
  const r = db.insert('reviews', { doctorId: a.doctorId, patientId: user.id, appointmentId: a.id, rating, comment: str(body.comment, 500), createdAt: new Date().toISOString(), approved: true });
  const d = db.find('doctors', a.doctorId);
  S.notify(d.userId, 'review', 'نظر جدید', `${user.name} به ویزیت شما ${rating} ستاره داد.`, '/dr/reviews');
  return r;
});

route('GET', '/api/my/waitlist', ['patient'], ({ user }) =>
  db.data.waitlist.filter(w => w.patientId === user.id).sort((a, b) => b.id - a.id).map(w => ({ ...w, doctorName: S.doctorName(w.doctorId), specialty: db.find('specialties', db.find('doctors', w.doctorId)?.specialtyId)?.name, position: w.status === 'waiting' ? S.waitlistPosition(w) : null })));
route('POST', '/api/waitlist', ['patient'], ({ user, body }) => {
  const w = S.joinWaitlist({ doctorId: +body.doctorId, patientId: user.id, date: body.date, priority: body.priority, note: body.note, fromTime: U.isValidTime(body.fromTime) ? body.fromTime : null, toTime: U.isValidTime(body.toTime) ? body.toTime : null });
  S.log(user.id, 'waitlist.join', `پزشک #${body.doctorId} — ${body.date}`);
  return { ...w, position: w.status === 'waiting' ? S.waitlistPosition(w) : null };
});
route('DELETE', '/api/waitlist/:id', ['patient', 'admin', 'doctor'], ({ user, params }) => {
  const w = db.find('waitlist', +params.id);
  if (!w || (user.role === 'patient' && w.patientId !== user.id)) fail(404, 'یافت نشد.');
  db.update('waitlist', w.id, { status: 'cancelled' });
  return { ok: true };
});

route('GET', '/api/my/tickets', ['patient', 'doctor'], ({ user }) => db.data.tickets.filter(t => t.userId === user.id).sort((a, b) => b.id - a.id));
route('POST', '/api/tickets', ['patient', 'doctor'], ({ user, body }) => {
  requireFields(body, [['subject', 'موضوع'], ['body', 'متن پیام']]);
  return db.insert('tickets', { userId: user.id, subject: str(body.subject, 100), body: str(body.body, 1000), status: 'open', createdAt: new Date().toISOString() });
});

/* ======================= پزشک ======================= */
route('GET', '/api/dr/dashboard', ['doctor'], ({ user }) => {
  const d = doctorOf(user); const today = U.ymd();
  const mine = db.data.appointments.filter(a => a.doctorId === d.id);
  const days = [];
  for (let i = -13; i <= 7; i++) {
    const date = U.addDays(today, i);
    const x = mine.filter(a => a.date === date);
    days.push({ date, done: x.filter(a => a.status === 'done').length, booked: x.filter(a => S.OPEN.has(a.status)).length, cancelled: x.filter(a => a.status === 'cancelled').length, noShow: x.filter(a => a.status === 'no_show').length });
  }
  const cal = S.calendar(d.id, today, 7);
  const cap = cal.reduce((a, c) => a + c.capacity, 0), booked = cal.reduce((a, c) => a + c.booked, 0);
  const q = S.todayQueue(d.id);
  const past = mine.filter(a => a.date < today && a.status !== 'cancelled');
  const r = ratings().get(d.id) || { sum: 0, n: 0 };
  return {
    doctor: doctorCard(d, false),
    today: { total: q.list.length, done: q.list.filter(a => a.status === 'done').length, waiting: q.waiting.length, current: q.current ? apptView(q.current, { withPatient: true }) : null, remaining: q.list.filter(a => a.status === 'booked').length },
    week: { capacity: cap, booked, occupancy: cap ? Math.round((booked / cap) * 100) : 0 },
    patients: new Set(mine.map(a => a.patientId)).size,
    noShowRate: past.length ? Math.round((past.filter(a => a.status === 'no_show').length / past.length) * 100) : 0,
    rating: r.n ? +(r.sum / r.n).toFixed(1) : null, reviewCount: r.n,
    waitlist: db.data.waitlist.filter(w => w.doctorId === d.id && w.status === 'waiting').length,
    days, calendar: cal,
    upcoming: mine.filter(a => S.OPEN.has(a.status) && (a.date > today || a.date === today)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 6).map(a => apptView(a, { withPatient: true })),
    avgVisit: S.avgVisitMinutes(d.id)
  };
});

route('GET', '/api/dr/queue', ['doctor'], ({ user }) => {
  const d = doctorOf(user);
  const q = S.todayQueue(d.id);
  const view = a => ({ ...apptView(a, { withPatient: true }), turn: a._turn });
  return { list: q.list.map(view), waiting: q.waiting.map(view), current: q.current ? view(q.current) : null, avgVisit: S.avgVisitMinutes(d.id) };
});
route('POST', '/api/dr/queue/next', ['doctor'], ({ user }) => {
  const d = doctorOf(user);
  const n = S.callNext(d.id);
  if (!n) return { called: null, message: 'بیمار پذیرش‌شده‌ای در صف نیست.' };
  S.log(user.id, 'queue.next', `نوبت #${n.id}`);
  return { called: apptView(n, { withPatient: true }) };
});

route('POST', '/api/dr/appointments/:id/status', ['doctor', 'admin'], ({ user, params, body }) => {
  const a = db.find('appointments', +params.id); canTouch(user, a);
  const allowed = { booked: ['checked_in', 'no_show'], checked_in: ['in_visit', 'no_show', 'booked'], in_visit: ['done'], no_show: ['checked_in'], done: [] };
  if (!(allowed[a.status] || []).includes(body.status)) fail(409, 'تغییر وضعیت نامعتبر است.');
  if (body.status === 'in_visit') {
    const cur = S.todayQueue(a.doctorId).current;
    if (cur && cur.id !== a.id) db.update('appointments', cur.id, { status: 'done', finishedAt: new Date().toISOString() });
    db.update('appointments', a.id, { status: 'in_visit', calledAt: new Date().toISOString() });
    S.notify(a.patientId, 'call', 'نوبت شماست!', `لطفاً به اتاق ${S.doctorName(a.doctorId)} مراجعه کنید.`);
  } else {
    const patch = { status: body.status };
    if (body.status === 'checked_in') patch.checkedInAt = new Date().toISOString();
    if (body.status === 'done') patch.finishedAt = new Date().toISOString();
    db.update('appointments', a.id, patch);
  }
  if (body.priority && S.PRIORITY[body.priority]) db.update('appointments', a.id, { priority: body.priority, priorityScore: S.PRIORITY[body.priority].score });
  return apptView(db.find('appointments', a.id), { withPatient: true });
});

route('POST', '/api/dr/appointments/:id/priority', ['doctor', 'admin'], ({ user, params, body }) => {
  const a = db.find('appointments', +params.id); canTouch(user, a);
  if (!S.PRIORITY[body.priority]) fail(400, 'اولویت نامعتبر است.');
  db.update('appointments', a.id, { priority: body.priority, priorityScore: S.priorityScore(body.priority, db.find('users', a.patientId)) });
  return { ok: true };
});

route('GET', '/api/dr/appointments', ['doctor'], ({ user, q }) => {
  const d = doctorOf(user);
  const from = U.isValidDate(q.from) ? q.from : U.ymd();
  const to = U.isValidDate(q.to) ? q.to : from;
  return db.data.appointments.filter(a => a.doctorId === d.id && a.date >= from && a.date <= to && (!q.status || a.status === q.status))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).map(a => apptView(a, { withPatient: true }));
});

route('PUT', '/api/dr/appointments/:id/visit', ['doctor'], ({ user, params, body }) => {
  const a = db.find('appointments', +params.id); canTouch(user, a);
  if (a.status === 'cancelled') fail(409, 'نوبت لغو شده است.');
  const rx = (Array.isArray(body.prescription) ? body.prescription : String(body.prescription || '').split('\n')).map(x => str(x, 150)).filter(Boolean).slice(0, 20);
  const patch = { diagnosis: str(body.diagnosis, 300), note: str(body.note, 1000), prescription: rx, followUp: U.isValidDate(body.followUp) ? body.followUp : null };
  if (body.finish) { patch.status = 'done'; patch.finishedAt = new Date().toISOString(); if (!a.calledAt) patch.calledAt = patch.finishedAt; }
  db.update('appointments', a.id, patch);
  if (body.finish) S.notify(a.patientId, 'visit', 'پرونده‌ی ویزیت ثبت شد', `نسخه و توضیحات ${S.doctorName(a.doctorId)} در بخش «پرونده‌ی سلامت» قابل مشاهده است. لطفاً به پزشک امتیاز دهید.`, '/panel/records');
  return apptView(db.find('appointments', a.id), { withPatient: true });
});

// برنامه‌ی کاری
function validateShift(doctorId, s, ignoreId) {
  if (!U.isValidTime(s.start) || !U.isValidTime(s.end)) fail(400, 'ساعت شروع و پایان نامعتبر است.');
  if (U.toMin(s.end) - U.toMin(s.start) < s.slotMinutes) fail(400, 'بازه‌ی شیفت باید حداقل به اندازه‌ی یک نوبت باشد.');
  if (!(s.weekday >= 0 && s.weekday <= 6)) fail(400, 'روز هفته نامعتبر است.');
  if (!(s.slotMinutes >= 5 && s.slotMinutes <= 120)) fail(400, 'مدت هر نوبت باید بین ۵ تا ۱۲۰ دقیقه باشد.');
  if (!(s.capacity >= 1 && s.capacity <= 10)) fail(400, 'ظرفیت هر نوبت باید بین ۱ تا ۱۰ باشد.');
  if (!db.find('centers', s.centerId)) fail(400, 'مرکز درمانی نامعتبر است.');
  const clash = db.data.schedules.find(x => x.doctorId === doctorId && x.id !== ignoreId && x.weekday === s.weekday && x.active !== false && U.toMin(s.start) < U.toMin(x.end) && U.toMin(x.start) < U.toMin(s.end));
  if (clash) fail(409, `این شیفت با شیفت ${clash.start} تا ${clash.end} همان روز در «${db.find('centers', clash.centerId).name}» تداخل دارد.`);
}
/** نوبت‌های آینده‌ای که با حذف/ویرایش شیفت بی‌جا می‌شوند */
function orphanedBy(doctorId, sh) {
  return db.data.appointments.filter(a => a.doctorId === doctorId && a.status === 'booked' && a.date >= U.ymd() && U.weekday(a.date) === sh.weekday && a.time >= sh.start && a.time < sh.end);
}
const shiftBody = (b, d) => ({ weekday: num(b.weekday), start: b.start, end: b.end, slotMinutes: num(b.slotMinutes) || 15, capacity: num(b.capacity) || 1, centerId: num(b.centerId) || d.centerIds[0], active: b.active !== false });
function scheduleOwner(user, body) {
  if (user.role === 'admin') return db.find('doctors', num(body.doctorId)) || fail(404, 'پزشک یافت نشد.');
  return doctorOf(user);
}
route('GET', '/api/dr/schedules', ['doctor', 'admin'], ({ user, q }) => {
  const d = user.role === 'admin' ? db.find('doctors', +q.doctorId) : doctorOf(user);
  return { schedules: db.data.schedules.filter(s => s.doctorId === d.id).map(s => ({ ...s, centerName: db.find('centers', s.centerId)?.name, booked: orphanedBy(d.id, s).length })), leaves: db.data.leaves.filter(l => l.doctorId === d.id).sort((a, b) => b.from.localeCompare(a.from)), centerIds: d.centerIds };
});
route('POST', '/api/dr/schedules', ['doctor', 'admin'], ({ user, body }) => {
  const d = scheduleOwner(user, body);
  const s = shiftBody(body, d);
  validateShift(d.id, s);
  const row = db.insert('schedules', { doctorId: d.id, ...s });
  for (let i = 0; i < 30; i++) { const date = U.addDays(U.ymd(), i); if (U.weekday(date) === s.weekday) S.processWaitlist(d.id, date); }
  S.log(user.id, 'schedule.create', `شیفت #${row.id}`);
  return row;
});
route('PUT', '/api/dr/schedules/:id', ['doctor', 'admin'], ({ user, params, body }) => {
  const sh = db.find('schedules', +params.id);
  const d = user.role === 'admin' ? db.find('doctors', sh?.doctorId) : doctorOf(user);
  if (!sh || sh.doctorId !== d.id) fail(404, 'شیفت یافت نشد.');
  const s = shiftBody({ ...sh, ...body }, d);
  validateShift(d.id, s, sh.id);
  const affected = orphanedBy(d.id, sh).filter(a => a.time < s.start || a.time >= s.end || s.weekday !== sh.weekday || (U.toMin(a.time) - U.toMin(s.start)) % s.slotMinutes !== 0 || !s.active);
  if (affected.length && !body.force) fail(409, `${affected.length} نوبت رزروشده‌ی آینده تحت تأثیر این تغییر قرار می‌گیرد.`, { affected: affected.length });
  affected.forEach(a => S.cancel(a, user.id, 'تغییر برنامه‌ی کاری پزشک'));
  db.update('schedules', sh.id, s);
  for (let i = 0; i < 30; i++) { const date = U.addDays(U.ymd(), i); if (U.weekday(date) === s.weekday) S.processWaitlist(d.id, date); }
  return db.find('schedules', sh.id);
});
route('DELETE', '/api/dr/schedules/:id', ['doctor', 'admin'], ({ user, params, body }) => {
  const sh = db.find('schedules', +params.id);
  const d = user.role === 'admin' ? db.find('doctors', sh?.doctorId) : doctorOf(user);
  if (!sh || sh.doctorId !== d.id) fail(404, 'شیفت یافت نشد.');
  const affected = orphanedBy(d.id, sh);
  if (affected.length && !body.force) fail(409, `${affected.length} نوبت رزروشده در این شیفت وجود دارد. در صورت حذف، نوبت‌ها لغو و به بیماران اطلاع داده می‌شود.`, { affected: affected.length });
  affected.forEach(a => S.cancel(a, user.id, 'حذف شیفت کاری پزشک'));
  db.remove('schedules', sh.id);
  return { ok: true, cancelled: affected.length };
});

route('POST', '/api/dr/leaves', ['doctor', 'admin'], ({ user, body }) => {
  const d = scheduleOwner(user, body);
  if (!U.isValidDate(body.from) || !U.isValidDate(body.to) || body.to < body.from) fail(400, 'بازه‌ی تاریخ نامعتبر است.');
  if (body.from < U.ymd()) fail(400, 'تاریخ شروع نمی‌تواند در گذشته باشد.');
  const affected = db.data.appointments.filter(a => a.doctorId === d.id && S.OPEN.has(a.status) && a.date >= body.from && a.date <= body.to);
  if (affected.length && !body.force) fail(409, `${affected.length} نوبت در این بازه رزرو شده است. با ثبت مرخصی، این نوبت‌ها لغو و به بیماران پیامک ارسال می‌شود.`, { affected: affected.length });
  const leave = db.insert('leaves', { doctorId: d.id, from: body.from, to: body.to, reason: str(body.reason, 100) });
  // لغو نوبت‌ها و پیشنهاد زمان جایگزین
  for (const a of affected) {
    db.update('appointments', a.id, { status: 'cancelled', cancelledAt: new Date().toISOString(), cancelledBy: user.id, cancelReason: 'مرخصی پزشک' });
    const f = S.firstFree(d.id, U.addDays(body.to, 1), 21);
    S.notify(a.patientId, 'cancelled', 'لغو نوبت به دلیل مرخصی پزشک', `نوبت ${a.date} ساعت ${a.time} نزد ${S.doctorName(d.id)} به دلیل مرخصی پزشک لغو شد.${f ? ` نزدیک‌ترین زمان آزاد پیشنهادی: ${f.date} ساعت ${f.time}` : ''}`, `/doctor/${d.id}`);
    S.sms(a.patientId, `نوبت ${a.date} شما به دلیل مرخصی پزشک لغو شد. لطفاً زمان جدید رزرو کنید.`, 'cancel');
  }
  db.data.waitlist.forEach(w => { if (w.doctorId === d.id && w.status === 'waiting' && w.date >= body.from && w.date <= body.to) w.status = 'cancelled'; });
  S.log(user.id, 'leave.create', `${body.from} تا ${body.to}`);
  return { leave, cancelled: affected.length };
});
route('DELETE', '/api/dr/leaves/:id', ['doctor', 'admin'], ({ user, params }) => {
  const l = db.find('leaves', +params.id);
  if (!l || (user.role === 'doctor' && l.doctorId !== doctorOf(user).id)) fail(404, 'یافت نشد.');
  db.remove('leaves', l.id);
  return { ok: true };
});

route('GET', '/api/dr/waitlist', ['doctor'], ({ user }) => {
  const d = doctorOf(user);
  return db.data.waitlist.filter(w => w.doctorId === d.id && (w.status === 'waiting' || w.date >= U.addDays(U.ymd(), -7)))
    .sort((a, b) => a.date.localeCompare(b.date) || b.score - a.score || a.createdAt.localeCompare(b.createdAt))
    .map(w => { const p = db.find('users', w.patientId); return { ...w, patient: p ? { name: p.name, mobile: p.mobile, age: S.patientAge(p) } : null, position: w.status === 'waiting' ? S.waitlistPosition(w) : null }; });
});

route('GET', '/api/dr/patients', ['doctor'], ({ user, q }) => {
  const d = doctorOf(user);
  const map = new Map();
  for (const a of db.data.appointments) {
    if (a.doctorId !== d.id || a.status === 'cancelled') continue;
    const m = map.get(a.patientId) || { visits: 0, last: null, next: null, noShow: 0 };
    if (a.status === 'done') { m.visits++; if (!m.last || a.date > m.last) m.last = a.date; }
    if (a.status === 'no_show') m.noShow++;
    if (S.OPEN.has(a.status) && (!m.next || a.date < m.next)) m.next = a.date;
    map.set(a.patientId, m);
  }
  let list = [...map.entries()].map(([pid, m]) => { const p = db.find('users', pid); return { id: pid, name: p?.name, mobile: p?.mobile, age: S.patientAge(p), gender: p?.gender, insurance: p?.insurance, ...m }; });
  if (q.q) list = list.filter(p => (p.name + p.mobile).includes(U.normDigits(q.q)));
  return list.sort((a, b) => (b.last || '').localeCompare(a.last || ''));
});
route('GET', '/api/dr/patients/:id', ['doctor'], ({ user, params }) => {
  const d = doctorOf(user);
  const p = db.find('users', +params.id);
  const history = db.data.appointments.filter(a => a.doctorId === d.id && a.patientId === +params.id).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).map(a => apptView(a));
  if (!p || !history.length) fail(404, 'بیمار یافت نشد.');
  return { patient: { ...publicUser(p), age: S.patientAge(p) }, history };
});
route('GET', '/api/dr/reviews', ['doctor'], ({ user }) => {
  const d = doctorOf(user);
  return db.data.reviews.filter(r => r.doctorId === d.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(r => ({ ...r, patientName: db.find('users', r.patientId)?.name }));
});
route('POST', '/api/dr/reviews/:id/reply', ['doctor'], ({ user, params, body }) => {
  const d = doctorOf(user); const r = db.find('reviews', +params.id);
  if (!r || r.doctorId !== d.id) fail(404, 'یافت نشد.');
  db.update('reviews', r.id, { reply: str(body.reply, 400), repliedAt: new Date().toISOString() });
  return { ok: true };
});
route('PUT', '/api/dr/profile', ['doctor'], ({ user, body }) => {
  const d = doctorOf(user);
  const patch = {};
  if (body.bio !== undefined) patch.bio = str(body.bio, 1200);
  if (body.fee !== undefined) patch.fee = Math.max(0, num(body.fee) || 0);
  if (Array.isArray(body.insurances)) patch.insurances = body.insurances.filter(i => INSURANCES.includes(i));
  if (Array.isArray(body.tags)) patch.tags = body.tags.map(t => str(t, 30)).filter(Boolean).slice(0, 8);
  if (body.accepting !== undefined) patch.accepting = !!body.accepting;
  db.update('doctors', d.id, patch);
  return doctorCard(db.find('doctors', d.id), false);
});

/* ======================= مدیر ======================= */
const A = ['admin'];
route('GET', '/api/admin/stats', A, () => {
  const today = U.ymd(); const all = db.data.appointments;
  const days = [];
  for (let i = -20; i <= 7; i++) {
    const date = U.addDays(today, i);
    const x = all.filter(a => a.date === date);
    days.push({ date, total: x.filter(a => a.status !== 'cancelled').length, cancelled: x.filter(a => a.status === 'cancelled').length, done: x.filter(a => a.status === 'done').length });
  }
  const bySpec = db.data.specialties.map(s => {
    const ids = new Set(db.data.doctors.filter(d => d.specialtyId === s.id).map(d => d.id));
    return { name: s.name, count: all.filter(a => ids.has(a.doctorId) && a.status !== 'cancelled').length };
  }).sort((a, b) => b.count - a.count);
  const status = {}; all.forEach(a => (status[a.status] = (status[a.status] || 0) + 1));
  const byCenter = db.data.centers.map(c => ({ name: c.name, count: all.filter(a => a.centerId === c.id && a.status !== 'cancelled').length }));
  const hours = Array(24).fill(0); all.forEach(a => a.status !== 'cancelled' && hours[+a.time.slice(0, 2)]++);
  let cap = 0, booked = 0;
  const topDoctors = db.data.doctors.map(d => {
    const cal = S.calendar(d.id, today, 7);
    const c = cal.reduce((s, x) => s + x.capacity, 0), b = cal.reduce((s, x) => s + x.booked, 0);
    cap += c; booked += b;
    return { ...doctorCard(d, false), occupancy: c ? Math.round((b / c) * 100) : 0 };
  }).sort((a, b) => b.visits - a.visits).slice(0, 6);
  const sources = {}; all.forEach(a => (sources[a.source] = (sources[a.source] || 0) + 1));
  return {
    counts: {
      users: db.data.users.length, patients: db.data.users.filter(u => u.role === 'patient').length, doctors: db.data.doctors.length, centers: db.data.centers.length, specialties: db.data.specialties.length,
      appointments: all.length, today: all.filter(a => a.date === today && a.status !== 'cancelled').length, upcoming: all.filter(a => a.date >= today && S.OPEN.has(a.status)).length,
      waitlist: db.data.waitlist.filter(w => w.status === 'waiting').length, promoted: db.data.waitlist.filter(w => w.status === 'promoted').length,
      sms: db.data.sms.length, openTickets: db.data.tickets.filter(t => t.status === 'open').length
    },
    cancelRate: all.length ? Math.round(((status.cancelled || 0) / all.length) * 100) : 0,
    noShowRate: all.length ? Math.round(((status.no_show || 0) / all.length) * 100) : 0,
    occupancy: cap ? Math.round((booked / cap) * 100) : 0,
    days, bySpec, byCenter, status, hours, topDoctors, sources,
    recent: all.slice(-8).reverse().map(a => apptView(a, { withPatient: true }))
  };
});

// کاربران
route('GET', '/api/admin/users', A, ({ q }) => {
  let list = db.data.users;
  if (q.role) list = list.filter(u => u.role === q.role);
  if (q.q) { const t = U.normDigits(q.q); list = list.filter(u => (u.name + u.mobile + (u.nationalCode || '')).includes(t)); }
  return list.slice().sort((a, b) => b.id - a.id).map(u => ({ ...publicUser(u), appointments: db.data.appointments.filter(a => a.patientId === u.id).length }));
});
route('POST', '/api/admin/users', A, ({ user, body }) => {
  requireFields(body, [['name', 'نام'], ['mobile', 'موبایل']]);
  const mobile = U.normDigits(body.mobile);
  if (!U.isMobile(mobile)) fail(400, 'شماره موبایل معتبر نیست.');
  if (db.data.users.some(u => u.mobile === mobile)) fail(409, 'این شماره قبلاً ثبت شده است.');
  const role = ['patient', 'admin'].includes(body.role) ? body.role : 'patient';
  const pw = body.password || '123456';
  const u = db.insert('users', { role, name: str(body.name, 60), mobile, gender: body.gender === 'f' ? 'f' : 'm', birthYear: num(body.birthYear), nationalCode: U.normDigits(body.nationalCode || '') || null, city: str(body.city, 30) || 'تهران', insurance: str(body.insurance, 40) || null, active: true, createdAt: new Date().toISOString(), ...U.hashPassword(pw) });
  S.log(user.id, 'user.create', u.name);
  return publicUser(u);
});
route('PUT', '/api/admin/users/:id', A, ({ user, params, body }) => {
  const u = db.find('users', +params.id); if (!u) fail(404, 'کاربر یافت نشد.');
  const patch = {};
  if (body.name) patch.name = str(body.name, 60);
  if (body.mobile) { const m = U.normDigits(body.mobile); if (!U.isMobile(m)) fail(400, 'موبایل نامعتبر.'); if (db.data.users.some(x => x.mobile === m && x.id !== u.id)) fail(409, 'این موبایل تکراری است.'); patch.mobile = m; }
  if (body.active !== undefined) { if (u.id === user.id) fail(400, 'نمی‌توانید حساب خودتان را مسدود کنید.'); patch.active = !!body.active; if (!patch.active) db.data.sessions = db.data.sessions.filter(s => s.userId !== u.id); }
  ['city', 'insurance'].forEach(k => body[k] !== undefined && (patch[k] = str(body[k], 40)));
  if (body.birthYear !== undefined) patch.birthYear = num(body.birthYear);
  if (body.gender) patch.gender = body.gender === 'f' ? 'f' : 'm';
  if (body.password) { if (String(body.password).length < 6) fail(400, 'رمز باید حداقل ۶ کاراکتر باشد.'); Object.assign(patch, U.hashPassword(body.password)); }
  db.update('users', u.id, patch);
  S.log(user.id, 'user.update', u.name);
  return publicUser(db.find('users', u.id));
});

// پزشکان
route('GET', '/api/admin/doctors', A, () => db.data.doctors.map(d => ({ ...doctorCard(d, false), bio: d.bio, shifts: db.data.schedules.filter(s => s.doctorId === d.id).length })));
route('POST', '/api/admin/doctors', A, ({ user, body }) => {
  requireFields(body, [['name', 'نام پزشک'], ['mobile', 'موبایل'], ['specialtyId', 'تخصص'], ['medicalCode', 'شماره نظام پزشکی']]);
  const mobile = U.normDigits(body.mobile);
  if (!U.isMobile(mobile)) fail(400, 'موبایل نامعتبر است.');
  if (db.data.users.some(u => u.mobile === mobile)) fail(409, 'این موبایل قبلاً ثبت شده است.');
  const mc = U.normDigits(body.medicalCode);
  if (db.data.doctors.some(d => d.medicalCode === mc)) fail(409, 'شماره نظام پزشکی تکراری است.');
  const centerIds = (body.centerIds || []).map(Number).filter(id => db.find('centers', id));
  if (!centerIds.length) fail(400, 'حداقل یک مرکز درمانی انتخاب کنید.');
  let name = str(body.name, 60); if (!name.startsWith('دکتر')) name = 'دکتر ' + name;
  const u = db.insert('users', { role: 'doctor', name, mobile, gender: body.gender === 'f' ? 'f' : 'm', active: true, createdAt: new Date().toISOString(), city: db.find('centers', centerIds[0]).city, ...U.hashPassword(body.password || '123456') });
  const d = db.insert('doctors', { userId: u.id, specialtyId: +body.specialtyId, degree: str(body.degree, 80) || 'متخصص', experience: num(body.experience) || 0, gender: u.gender, medicalCode: mc, centerIds, city: u.city, bio: str(body.bio, 1200), fee: num(body.fee) || 250000, insurances: body.insurances || [], accepting: true, active: true, verified: true, tags: [] });
  S.notify(u.id, 'welcome', 'حساب پزشک فعال شد', 'لطفاً از بخش «برنامه‌ی کاری» شیفت‌های خود را تعریف کنید.', '/dr/schedule');
  S.log(user.id, 'doctor.create', name);
  return doctorCard(d, false);
});
route('PUT', '/api/admin/doctors/:id', A, ({ user, params, body }) => {
  const d = db.find('doctors', +params.id); if (!d) fail(404, 'پزشک یافت نشد.');
  const patch = {};
  ['degree', 'bio'].forEach(k => body[k] !== undefined && (patch[k] = str(body[k], 1200)));
  if (body.specialtyId) patch.specialtyId = +body.specialtyId;
  if (body.experience !== undefined) patch.experience = num(body.experience);
  if (body.fee !== undefined) patch.fee = num(body.fee);
  if (Array.isArray(body.centerIds) && body.centerIds.length) patch.centerIds = body.centerIds.map(Number);
  if (Array.isArray(body.insurances)) patch.insurances = body.insurances;
  ['active', 'verified', 'accepting'].forEach(k => body[k] !== undefined && (patch[k] = !!body[k]));
  if (body.name) db.update('users', d.userId, { name: body.name.startsWith('دکتر') ? str(body.name, 60) : 'دکتر ' + str(body.name, 60) });
  db.update('doctors', d.id, patch);
  if (patch.active === false) db.update('users', d.userId, { active: false });
  if (patch.active === true) db.update('users', d.userId, { active: true });
  S.log(user.id, 'doctor.update', `#${d.id}`);
  return doctorCard(db.find('doctors', d.id), false);
});

// تخصص‌ها و مراکز (CRUD عمومی)
function crud(col, label, fields, guard) {
  route('GET', `/api/admin/${col}`, A, () => db.data[col]);
  route('POST', `/api/admin/${col}`, A, ({ user, body }) => {
    requireFields(body, fields.filter(f => f[2]).map(f => [f[0], f[1]]));
    const row = {}; fields.forEach(([k]) => body[k] !== undefined && (row[k] = typeof body[k] === 'string' ? str(body[k], 400) : body[k]));
    const r = db.insert(col, { active: true, ...row });
    S.log(user.id, `${col}.create`, r.name); return r;
  });
  route('PUT', `/api/admin/${col}/:id`, A, ({ user, params, body }) => {
    const r = db.find(col, +params.id); if (!r) fail(404, `${label} یافت نشد.`);
    const patch = {}; [...fields, ['active']].forEach(([k]) => body[k] !== undefined && (patch[k] = typeof body[k] === 'string' ? str(body[k], 400) : body[k]));
    db.update(col, r.id, patch); S.log(user.id, `${col}.update`, r.name); return db.find(col, r.id);
  });
  route('DELETE', `/api/admin/${col}/:id`, A, ({ user, params }) => {
    const r = db.find(col, +params.id); if (!r) fail(404, `${label} یافت نشد.`);
    const used = guard(r.id); if (used) fail(409, `این ${label} توسط ${used} پزشک استفاده می‌شود و قابل حذف نیست. می‌توانید آن را غیرفعال کنید.`);
    db.remove(col, r.id); S.log(user.id, `${col}.delete`, r.name); return { ok: true };
  });
}
crud('specialties', 'تخصص', [['name', 'نام تخصص', true], ['icon'], ['description']], id => db.data.doctors.filter(d => d.specialtyId === id).length);
crud('centers', 'مرکز', [['name', 'نام مرکز', true], ['type', 'نوع مرکز', true], ['city', 'شهر', true], ['address', 'آدرس', true], ['phone'], ['description'], ['facilities'], ['color']], id => db.data.doctors.filter(d => d.centerIds.includes(id)).length);

route('GET', '/api/admin/appointments', A, ({ q }) => {
  let list = db.data.appointments;
  if (q.status) list = list.filter(a => a.status === q.status);
  if (q.doctorId) list = list.filter(a => a.doctorId === +q.doctorId);
  if (q.centerId) list = list.filter(a => a.centerId === +q.centerId);
  if (U.isValidDate(q.from)) list = list.filter(a => a.date >= q.from);
  if (U.isValidDate(q.to)) list = list.filter(a => a.date <= q.to);
  let out = list.map(a => apptView(a, { withPatient: true }));
  if (q.q) { const t = U.normDigits(q.q); out = out.filter(a => (a.code + a.patient?.name + a.patient?.mobile + a.doctorName).includes(t)); }
  out.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const page = Math.max(1, +q.page || 1), size = Math.min(100, +q.size || 20);
  return { items: out.slice((page - 1) * size, page * size), total: out.length, page, pages: Math.ceil(out.length / size) };
});
route('GET', '/api/admin/export', A, ({ res }) => {
  const rows = [['کد', 'تاریخ', 'ساعت', 'پزشک', 'تخصص', 'بیمار', 'موبایل', 'مرکز', 'وضعیت', 'اولویت']];
  const ST = { booked: 'رزرو شده', checked_in: 'پذیرش شده', in_visit: 'در حال ویزیت', done: 'انجام شده', cancelled: 'لغو شده', no_show: 'عدم مراجعه' };
  db.data.appointments.forEach(a => { const v = apptView(a, { withPatient: true }); rows.push([v.code, v.date, v.time, v.doctorName, v.specialty, v.patient?.name, v.patient?.mobile, v.centerName, ST[v.status], S.PRIORITY[v.priority]?.label]); });
  const csv = '﻿' + rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="appointments.csv"' });
  res.end(csv);
});
route('GET', '/api/admin/waitlist', A, () => db.data.waitlist.slice().sort((a, b) => b.id - a.id).slice(0, 300).map(w => ({ ...w, doctorName: S.doctorName(w.doctorId), patientName: db.find('users', w.patientId)?.name, position: w.status === 'waiting' ? S.waitlistPosition(w) : null })));
route('GET', '/api/admin/sms', A, () => db.data.sms.slice(-300).reverse().map(s => ({ ...s, userName: db.find('users', s.userId)?.name })));
route('GET', '/api/admin/logs', A, () => db.data.logs.slice(-300).reverse().map(l => ({ ...l, userName: l.userId ? db.find('users', l.userId)?.name : 'سیستم' })));
route('GET', '/api/admin/reviews', A, () => db.data.reviews.slice().sort((a, b) => b.id - a.id).slice(0, 300).map(r => ({ ...r, doctorName: S.doctorName(r.doctorId), patientName: db.find('users', r.patientId)?.name })));
route('PUT', '/api/admin/reviews/:id', A, ({ params, body }) => { db.update('reviews', +params.id, { approved: !!body.approved }); return { ok: true }; });
route('GET', '/api/admin/tickets', A, () => db.data.tickets.slice().sort((a, b) => b.id - a.id).map(t => ({ ...t, userName: db.find('users', t.userId)?.name })));
route('POST', '/api/admin/tickets/:id/answer', A, ({ params, body }) => {
  const t = db.find('tickets', +params.id); if (!t) fail(404, 'یافت نشد.');
  db.update('tickets', t.id, { answer: str(body.answer, 1000), status: 'answered', answeredAt: new Date().toISOString() });
  S.notify(t.userId, 'ticket', 'پاسخ پشتیبانی', `به تیکت «${t.subject}» پاسخ داده شد.`, '/panel/support');
  return { ok: true };
});
route('GET', '/api/admin/settings', A, () => db.data.settings);
route('PUT', '/api/admin/settings', A, ({ user, body }) => {
  const s = db.data.settings;
  const ints = { bookingWindowDays: [1, 90], cancelDeadlineHours: [0, 72], reminderHours: [1, 72], secondReminderHours: [0, 24], maxActivePerPatient: [1, 20] };
  for (const [k, [lo, hi]] of Object.entries(ints)) if (body[k] !== undefined) { const v = num(body[k]); if (!(v >= lo && v <= hi)) fail(400, `مقدار «${k}» باید بین ${lo} و ${hi} باشد.`); s[k] = v; }
  ['waitlistAutoBook', 'maintenance'].forEach(k => body[k] !== undefined && (s[k] = !!body[k]));
  ['siteName', 'supportPhone'].forEach(k => body[k] !== undefined && (s[k] = str(body[k], 40)));
  db.save(); S.log(user.id, 'settings.update', ''); return s;
});
route('POST', '/api/admin/reset-demo', A, () => {
  const r = seed();
  return { ok: true, ...r };
});
route('POST', '/api/admin/run-reminders', A, () => { const before = db.data.sms.length; S.tick(); return { sent: db.data.sms.length - before }; });

/* ======================= اجرا ======================= */
setInterval(() => { try { S.tick(); } catch (e) { console.error(e); } }, 30000);
S.tick();

function shutdown() { try { db.flush(); } catch { } process.exit(0); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);

server.listen(PORT, () => {
  console.log(`\n🩺 سامانه‌ی نوبت‌دهی «${db.data.settings.siteName}» اجرا شد`);
  console.log(`🌐 آدرس:  http://localhost:${PORT}\n`);
  console.log('حساب‌های نمایشی (رمز همه: 123456):');
  console.log('  مدیر:  09120000001   پزشک: 09120000002   بیمار: 09120000003\n');
});
server.on('error', e => {
  if (e.code === 'EADDRINUSE') console.error(`❌ پورت ${PORT} اشغال است. با PORT=3001 npm start اجرا کنید.`);
  else console.error(e);
  process.exit(1);
});
