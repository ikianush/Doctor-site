// موتور نوبت‌دهی: تولید اسلات، جلوگیری از تداخل، صف انتظار، اولویت‌بندی، پیشنهاد هوشمند و یادآوری
'use strict';
const db = require('./db');
const U = require('./util');

const ACTIVE = new Set(['booked', 'checked_in', 'in_visit', 'done', 'no_show']);
const OPEN = new Set(['booked', 'checked_in', 'in_visit']); // نوبت‌هایی که هنوز انجام نشده‌اند

const PRIORITY = {
  urgent: { label: 'اورژانسی', score: 100 },
  disabled: { label: 'معلولیت', score: 60 },
  pregnant: { label: 'بارداری', score: 50 },
  elderly: { label: 'سالمند', score: 40 },
  child: { label: 'کودک زیر ۵ سال', score: 30 },
  normal: { label: 'عادی', score: 0 }
};

const settings = () => db.data.settings;

class BookingError extends Error {
  constructor(message, code = 'CONFLICT', extra = {}) { super(message); this.code = code; this.extra = extra; }
}

/* ---------- ایندکس اشغال اسلات‌ها (کش‌شده بر اساس نسخه‌ی دیتابیس) ---------- */
let occCache = { v: -1, map: new Map() };
function occupancy() {
  if (occCache.v === db.version) return occCache.map;
  const map = new Map();
  for (const a of db.data.appointments) {
    if (!ACTIVE.has(a.status)) continue;
    const k = `${a.doctorId}|${a.date}|${a.time}`;
    map.set(k, (map.get(k) || 0) + 1);
  }
  occCache = { v: db.version, map };
  return map;
}

function patientAge(user) {
  if (!user || !user.birthYear) return null;
  return new Date().getFullYear() - user.birthYear;
}

/** امتیاز اولویت بیمار؛ سالمندی به‌صورت خودکار از سن تشخیص داده می‌شود */
function priorityScore(priority, user) {
  let p = PRIORITY[priority] ? priority : 'normal';
  let s = PRIORITY[p].score;
  const age = patientAge(user);
  if (age !== null && age >= 65) s = Math.max(s, PRIORITY.elderly.score);
  if (age !== null && age < 5) s = Math.max(s, PRIORITY.child.score);
  return s;
}

function isOnLeave(doctorId, date) {
  return db.data.leaves.find(l => l.doctorId === doctorId && date >= l.from && date <= l.to) || null;
}

/** تولید اسلات‌های یک پزشک در یک روز */
function slotsFor(doctorId, date, { includePast = false } = {}) {
  const leave = isOnLeave(doctorId, date);
  if (leave) return { leave, slots: [] };
  const wd = U.weekday(date);
  const shifts = db.data.schedules.filter(s => s.doctorId === doctorId && s.weekday === wd && s.active !== false);
  const occ = occupancy();
  const today = U.ymd();
  const nm = U.nowMin();
  const slots = [];
  for (const sh of shifts) {
    const start = U.toMin(sh.start), end = U.toMin(sh.end), dur = sh.slotMinutes;
    for (let t = start; t + dur <= end; t += dur) {
      const time = U.fromMin(t);
      const booked = occ.get(`${doctorId}|${date}|${time}`) || 0;
      const past = date < today || (date === today && t <= nm);
      if (past && !includePast) continue;
      slots.push({ time, end: U.fromMin(t + dur), duration: dur, centerId: sh.centerId, capacity: sh.capacity, booked, free: Math.max(0, sh.capacity - booked), past, shiftId: sh.id });
    }
  }
  slots.sort((a, b) => a.time.localeCompare(b.time));
  return { leave: null, slots };
}

/** وضعیت روزهای آینده برای تقویم (رنگ‌بندی بر اساس میزان شلوغی) */
function calendar(doctorId, from, days) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const date = U.addDays(from, i);
    const { leave, slots } = slotsFor(doctorId, date, { includePast: true });
    const future = slots.filter(s => !s.past);
    const cap = slots.reduce((a, s) => a + s.capacity, 0);
    const booked = slots.reduce((a, s) => a + Math.min(s.booked, s.capacity), 0);
    const free = future.reduce((a, s) => a + s.free, 0);
    out.push({ date, leave: leave ? leave.reason || 'مرخصی' : null, off: !leave && slots.length === 0, capacity: cap, booked, free, load: cap ? booked / cap : 0 });
  }
  return out;
}

function firstFree(doctorId, from = U.ymd(), days = null) {
  days = days || settings().bookingWindowDays;
  for (let i = 0; i < days; i++) {
    const date = U.addDays(from, i);
    const s = slotsFor(doctorId, date).slots.find(x => x.free > 0);
    if (s) return { date, time: s.time, centerId: s.centerId };
  }
  return null;
}

/** بررسی تداخل با سایر نوبت‌های بیمار (با هر پزشکی) */
function patientConflict(patientId, date, time, duration, ignoreId = null) {
  const s = U.toMin(time), e = s + duration;
  return db.data.appointments.find(a => a.patientId === patientId && a.id !== ignoreId && a.date === date && OPEN.has(a.status) && (() => {
    const as = U.toMin(a.time), ae = as + (a.duration || 15);
    return s < ae && as < e; // هم‌پوشانی بازه‌ها
  })());
}

/** اعتبارسنجی کامل یک رزرو؛ در صورت مشکل BookingError پرتاب می‌کند */
function validateBooking({ doctorId, patientId, date, time, ignoreId = null, forPromotion = false }) {
  const doctor = db.find('doctors', doctorId);
  if (!doctor || doctor.active === false) throw new BookingError('پزشک موردنظر یافت نشد یا غیرفعال است.', 'NOT_FOUND');
  if (!doctor.accepting && !forPromotion) throw new BookingError('این پزشک در حال حاضر نوبت جدید نمی‌پذیرد.', 'CLOSED');
  if (!U.isValidDate(date) || !U.isValidTime(time)) throw new BookingError('تاریخ یا ساعت نامعتبر است.', 'BAD_INPUT');
  const today = U.ymd();
  if (date < today) throw new BookingError('امکان رزرو برای تاریخ گذشته وجود ندارد.', 'PAST');
  if (U.dayDiff(today, date) >= settings().bookingWindowDays) throw new BookingError(`رزرو حداکثر تا ${settings().bookingWindowDays} روز آینده امکان‌پذیر است.`, 'WINDOW');
  const leave = isOnLeave(doctorId, date);
  if (leave) throw new BookingError(`پزشک در این تاریخ در مرخصی است${leave.reason ? ' (' + leave.reason + ')' : ''}.`, 'LEAVE');
  const { slots } = slotsFor(doctorId, date);
  const slot = slots.find(s => s.time === time);
  if (!slot) throw new BookingError('این ساعت در برنامه‌ی کاری پزشک نیست یا زمان آن گذشته است.', 'NO_SLOT');
  let free = slot.free;
  if (ignoreId) {
    const self = db.find('appointments', ignoreId);
    if (self && self.doctorId === doctorId && self.date === date && self.time === time) free += 1;
  }
  if (free <= 0) throw new BookingError('ظرفیت این نوبت تکمیل شده است.', 'FULL', { slotFull: true });

  const patient = db.find('users', patientId);
  if (!patient || patient.active === false) throw new BookingError('حساب کاربری بیمار غیرفعال است.', 'USER');
  const sameDay = db.data.appointments.find(a => a.patientId === patientId && a.doctorId === doctorId && a.date === date && OPEN.has(a.status) && a.id !== ignoreId);
  if (sameDay) throw new BookingError(`شما در این روز یک نوبت دیگر نزد همین پزشک (ساعت ${sameDay.time}) دارید.`, 'DUPLICATE');
  const c = patientConflict(patientId, date, time, slot.duration, ignoreId);
  if (c) {
    const d2 = db.find('doctors', c.doctorId); const u2 = d2 && db.find('users', d2.userId);
    throw new BookingError(`تداخل زمانی: در ساعت ${c.time} همین روز نوبت دیگری${u2 ? ' نزد ' + u2.name : ''} دارید.`, 'OVERLAP');
  }
  if (!ignoreId && !forPromotion) {
    const open = db.data.appointments.filter(a => a.patientId === patientId && OPEN.has(a.status) && a.date >= today).length;
    if (open >= settings().maxActivePerPatient) throw new BookingError(`حداکثر ${settings().maxActivePerPatient} نوبت فعال مجاز است. ابتدا یکی از نوبت‌های قبلی را لغو کنید.`, 'LIMIT');
  }
  return { doctor, patient, slot };
}

function genCode() {
  let c;
  do { c = String(Math.floor(100000 + Math.random() * 900000)); } while (db.data.appointments.some(a => a.code === c));
  return c;
}

function notify(userId, type, title, body, link = null) {
  return db.insert('notifications', { userId, type, title, body, link, read: false, createdAt: new Date().toISOString() });
}
function sms(userId, text, kind = 'info') {
  const u = db.find('users', userId);
  if (!u) return;
  db.insert('sms', { userId, mobile: u.mobile, text: `سامانه نوبان: ${text}`, kind, at: new Date().toISOString() });
}
function log(userId, action, detail = '') {
  db.insert('logs', { userId, action, detail, at: new Date().toISOString() });
  if (db.data.logs.length > 3000) db.data.logs.splice(0, db.data.logs.length - 3000);
}

function doctorName(doctorId) {
  const d = db.find('doctors', doctorId); const u = d && db.find('users', d.userId);
  return u ? u.name : 'پزشک';
}

/** ایجاد نوبت (بعد از اعتبارسنجی) */
function book({ doctorId, patientId, date, time, reason = '', priority = 'normal', bookedBy = null, source = 'online' }) {
  const { slot, patient } = validateBooking({ doctorId, patientId, date, time, forPromotion: source === 'waitlist' });
  const appt = db.insert('appointments', {
    code: genCode(), doctorId, patientId, centerId: slot.centerId, date, time, duration: slot.duration,
    status: 'booked', priority: PRIORITY[priority] ? priority : 'normal', priorityScore: priorityScore(priority, patient),
    reason: String(reason).slice(0, 300), source, bookedBy: bookedBy || patientId,
    createdAt: new Date().toISOString(), reminders: {}
  });
  const center = db.find('centers', slot.centerId);
  notify(patientId, 'booked', 'نوبت شما ثبت شد', `نوبت ${doctorName(doctorId)} در تاریخ ${date} ساعت ${time}${center ? ' — ' + center.name : ''} با کد رهگیری ${appt.code} ثبت شد.`, '/panel/appointments');
  sms(patientId, `نوبت شما نزد ${doctorName(doctorId)} ثبت شد. کد رهگیری: ${appt.code}`, 'booking');
  const doc = db.find('doctors', doctorId);
  if (doc) notify(doc.userId, 'new', 'نوبت جدید', `${patient.name} برای ${date} ساعت ${time} نوبت گرفت.`, '/dr/appointments');
  return appt;
}

/** لغو نوبت + آزادسازی ظرفیت و پردازش صف انتظار */
function cancel(appt, by, reason = '') {
  if (!OPEN.has(appt.status) || appt.status === 'in_visit') throw new BookingError('این نوبت قابل لغو نیست.', 'STATE');
  const actor = db.find('users', by);
  if (actor.role === 'patient') {
    const hours = (U.stamp(appt.date, appt.time) - Date.now()) / 3600000;
    if (hours < settings().cancelDeadlineHours) throw new BookingError(`لغو نوبت تنها تا ${settings().cancelDeadlineHours} ساعت قبل از زمان نوبت امکان‌پذیر است.`, 'DEADLINE');
  }
  db.update('appointments', appt.id, { status: 'cancelled', cancelledAt: new Date().toISOString(), cancelledBy: by, cancelReason: String(reason).slice(0, 200) });
  if (actor.role !== 'patient') {
    notify(appt.patientId, 'cancelled', 'نوبت شما لغو شد', `نوبت ${appt.date} ساعت ${appt.time} نزد ${doctorName(appt.doctorId)} ${actor.role === 'doctor' ? 'توسط پزشک' : 'توسط مدیریت'} لغو شد.${reason ? ' علت: ' + reason : ''}`, '/panel/appointments');
    sms(appt.patientId, `نوبت ${appt.date} ساعت ${appt.time} شما لغو شد. برای رزرو مجدد به سامانه مراجعه کنید.`, 'cancel');
  } else {
    const doc = db.find('doctors', appt.doctorId);
    if (doc) notify(doc.userId, 'cancelled', 'لغو نوبت توسط بیمار', `نوبت ${appt.date} ساعت ${appt.time} لغو شد و ظرفیت آزاد گردید.`, '/dr/appointments');
  }
  const promoted = processWaitlist(appt.doctorId, appt.date);
  return { promoted };
}

/**
 * پردازش صف انتظار: با آزاد شدن ظرفیت، بیماران منتظر به ترتیب «امتیاز اولویت» و سپس «زمان ثبت»
 * به‌صورت خودکار در اولین اسلات آزاد و بدون تداخل رزرو می‌شوند.
 */
function processWaitlist(doctorId, date) {
  const promoted = [];
  const entries = db.data.waitlist
    .filter(w => w.doctorId === doctorId && w.date === date && w.status === 'waiting')
    .sort((a, b) => b.score - a.score || a.createdAt.localeCompare(b.createdAt));
  for (const w of entries) {
    const { slots } = slotsFor(doctorId, date);
    const candidates = slots.filter(s => s.free > 0 && (!w.fromTime || s.time >= w.fromTime) && (!w.toTime || s.time <= w.toTime));
    if (!candidates.length) continue;
    if (!settings().waitlistAutoBook) {
      if (!w.notifiedAt) {
        db.update('waitlist', w.id, { notifiedAt: new Date().toISOString() });
        notify(w.patientId, 'waitlist', 'ظرفیت آزاد شد!', `برای ${doctorName(doctorId)} در تاریخ ${date} ظرفیت آزاد شد. سریعاً رزرو کنید.`, `/doctor/${doctorId}`);
        sms(w.patientId, `ظرفیت نوبت ${doctorName(doctorId)} در ${date} آزاد شد.`, 'waitlist');
      }
      continue;
    }
    for (const s of candidates) {
      try {
        const appt = book({ doctorId, patientId: w.patientId, date, time: s.time, reason: w.note || 'رزرو خودکار از صف انتظار', priority: w.priority, source: 'waitlist' });
        db.update('waitlist', w.id, { status: 'promoted', appointmentId: appt.id, promotedAt: new Date().toISOString() });
        notify(w.patientId, 'waitlist', '🎉 نوبت شما از صف انتظار قطعی شد', `با آزاد شدن ظرفیت، نوبت ${date} ساعت ${s.time} نزد ${doctorName(doctorId)} به‌صورت خودکار برای شما رزرو شد. کد: ${appt.code}`, '/panel/appointments');
        log(null, 'waitlist.promote', `بیمار #${w.patientId} → نوبت #${appt.id}`);
        promoted.push(appt);
        break;
      } catch (e) { /* تداخل برای این بیمار؛ اسلات بعدی را امتحان کن */ }
    }
  }
  return promoted;
}

function joinWaitlist({ doctorId, patientId, date, priority = 'normal', note = '', fromTime = null, toTime = null }) {
  const doctor = db.find('doctors', doctorId);
  if (!doctor) throw new BookingError('پزشک یافت نشد.', 'NOT_FOUND');
  if (!U.isValidDate(date) || date < U.ymd()) throw new BookingError('تاریخ نامعتبر است.', 'BAD_INPUT');
  if (isOnLeave(doctorId, date)) throw new BookingError('پزشک در این روز در مرخصی است.', 'LEAVE');
  if (db.data.waitlist.some(w => w.doctorId === doctorId && w.patientId === patientId && w.date === date && w.status === 'waiting'))
    throw new BookingError('شما قبلاً در صف انتظار این روز ثبت شده‌اید.', 'DUPLICATE');
  const patient = db.find('users', patientId);
  const open = db.data.appointments.filter(a => a.patientId === patientId && OPEN.has(a.status) && a.date >= U.ymd()).length;
  if (open >= settings().maxActivePerPatient) throw new BookingError(`حداکثر ${settings().maxActivePerPatient} نوبت فعال مجاز است؛ امکان عضویت در صف انتظار وجود ندارد.`, 'LIMIT');
  const w = db.insert('waitlist', {
    doctorId, patientId, date, priority, note: String(note).slice(0, 200), fromTime, toTime,
    score: priorityScore(priority, patient), status: 'waiting', createdAt: new Date().toISOString()
  });
  notify(patientId, 'waitlist', 'ثبت در صف انتظار', `در صف انتظار ${doctorName(doctorId)} برای ${date} ثبت شدید. به محض آزاد شدن ظرفیت به شما اطلاع داده می‌شود.`, '/panel/waitlist');
  // شاید همین حالا ظرفیت باشد
  processWaitlist(doctorId, date);
  return db.find('waitlist', w.id);
}

function waitlistPosition(w) {
  const list = db.data.waitlist.filter(x => x.doctorId === w.doctorId && x.date === w.date && x.status === 'waiting')
    .sort((a, b) => b.score - a.score || a.createdAt.localeCompare(b.createdAt));
  return list.findIndex(x => x.id === w.id) + 1;
}

/** پیشنهاد هوشمند زمان: نزدیک‌ترین اسلات‌های آزاد به زمان درخواستی + پزشکان هم‌تخصص */
function suggest(doctorId, date, time, limit = 6) {
  const today = U.ymd();
  date = U.isValidDate(date) && date >= today ? date : today;
  const wantMin = U.isValidTime(time) ? U.toMin(time) : 10 * 60;
  const cands = [];
  for (let i = -7; i <= 14; i++) {
    const d = U.addDays(date, i);
    if (d < today || U.dayDiff(today, d) >= settings().bookingWindowDays) continue;
    const cal = slotsFor(doctorId, d).slots;
    const cap = cal.reduce((a, s) => a + s.capacity, 0) || 1;
    const load = cal.reduce((a, s) => a + s.booked, 0) / cap;
    for (const s of cal) if (s.free > 0) {
      const dist = Math.abs(i) * 180 + Math.abs(U.toMin(s.time) - wantMin) + load * 60;
      cands.push({ date: d, time: s.time, centerId: s.centerId, free: s.free, load: Math.round(load * 100), dist });
    }
  }
  cands.sort((a, b) => a.dist - b.dist);
  const doc = db.find('doctors', doctorId);
  const alternatives = [];
  if (doc) {
    for (const d of db.data.doctors.filter(x => x.id !== doctorId && x.specialtyId === doc.specialtyId && x.active !== false && x.accepting)) {
      const f = firstFree(d.id, date, 14);
      if (f) alternatives.push({ doctorId: d.id, name: doctorName(d.id), rating: d.rating, ...f });
    }
    alternatives.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }
  return { slots: cands.slice(0, limit).map(({ dist, ...r }) => r), alternatives: alternatives.slice(0, 3) };
}

/** صف زنده‌ی امروز یک پزشک؛ ترتیب فراخوانی: اولویت، سپس ساعت نوبت */
function todayQueue(doctorId, date = U.ymd()) {
  const list = db.data.appointments.filter(a => a.doctorId === doctorId && a.date === date && a.status !== 'cancelled')
    .sort((a, b) => a.time.localeCompare(b.time));
  list.forEach((a, i) => (a._turn = i + 1));
  const waiting = list.filter(a => a.status === 'checked_in')
    .sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0) || a.time.localeCompare(b.time));
  return { list, waiting, current: list.find(a => a.status === 'in_visit') || null };
}

function callNext(doctorId) {
  const q = todayQueue(doctorId);
  if (q.current) db.update('appointments', q.current.id, { status: 'done', finishedAt: new Date().toISOString() });
  const next = q.waiting[0];
  if (!next) return null;
  db.update('appointments', next.id, { status: 'in_visit', calledAt: new Date().toISOString() });
  notify(next.patientId, 'call', 'نوبت شماست!', `لطفاً به اتاق ${doctorName(doctorId)} مراجعه کنید. (نوبت شماره ${next._turn})`);
  // اطلاع‌رسانی به نفر بعدی صف
  const after = q.waiting[1];
  if (after) notify(after.patientId, 'queue', 'نفر بعدی شما هستید', `پس از بیمار فعلی نوبت شما نزد ${doctorName(doctorId)} است. لطفاً آماده باشید.`);
  return next;
}

/** موقعیت بیمار در صف امروز و زمان انتظار تخمینی */
function queueStatus(appt) {
  if (appt.date !== U.ymd() || !OPEN.has(appt.status)) return null;
  const q = todayQueue(appt.doctorId);
  const me = q.list.find(a => a.id === appt.id);
  const avg = avgVisitMinutes(appt.doctorId) || appt.duration || 15;
  if (appt.status === 'in_visit') return { turn: me._turn, ahead: 0, eta: 0, current: me._turn, state: 'in_visit' };
  let ahead;
  if (appt.status === 'checked_in') ahead = q.waiting.findIndex(a => a.id === appt.id) + (q.current ? 1 : 0);
  else ahead = q.list.filter(a => (a.status === 'booked' || a.status === 'checked_in') && a.time < appt.time).length + (q.current ? 1 : 0);
  return { turn: me._turn, ahead, eta: Math.round(ahead * avg), current: q.current ? q.current._turn : null, state: appt.status };
}

function avgVisitMinutes(doctorId) {
  const done = db.data.appointments.filter(a => a.doctorId === doctorId && a.calledAt && a.finishedAt).slice(-30);
  if (done.length < 3) return null;
  const m = done.reduce((s, a) => s + (new Date(a.finishedAt) - new Date(a.calledAt)) / 60000, 0) / done.length;
  return Math.max(5, Math.min(60, Math.round(m)));
}

/** اجرای دوره‌ای: یادآوری نوبت‌ها، عدم مراجعه، انقضای صف انتظار */
function tick() {
  const now = Date.now();
  const today = U.ymd();
  const st = settings();
  let changed = false;
  for (const a of db.data.appointments) {
    if (a.status === 'booked' || a.status === 'checked_in') {
      const t = U.stamp(a.date, a.time);
      const h = (t - now) / 3600000;
      a.reminders = a.reminders || {};
      if (h > 0 && h <= st.reminderHours && !a.reminders.first) {
        a.reminders.first = new Date().toISOString(); changed = true;
        notify(a.patientId, 'reminder', '⏰ یادآوری نوبت', `یادآوری: نوبت شما نزد ${doctorName(a.doctorId)} در تاریخ ${a.date} ساعت ${a.time} است. کد: ${a.code}`, '/panel/appointments');
        sms(a.patientId, `یادآوری نوبت ${doctorName(a.doctorId)} - ${a.date} ساعت ${a.time}. لغو: تا ${st.cancelDeadlineHours} ساعت قبل.`, 'reminder');
      }
      if (h > 0 && h <= st.secondReminderHours && !a.reminders.second) {
        a.reminders.second = new Date().toISOString(); changed = true;
        notify(a.patientId, 'reminder', '⏰ نوبت شما نزدیک است', `کمتر از ${st.secondReminderHours} ساعت تا نوبت ${doctorName(a.doctorId)} (ساعت ${a.time}) باقی مانده است.`, '/panel/appointments');
        sms(a.patientId, `نوبت شما ساعت ${a.time} امروز است. لطفاً ۱۵ دقیقه زودتر حضور یابید.`, 'reminder');
      }
      if (a.date < today) { a.status = 'no_show'; changed = true; }
    }
    if (a.status === 'in_visit' && a.date < today) { a.status = 'done'; changed = true; }
  }
  for (const w of db.data.waitlist) if (w.status === 'waiting' && w.date < today) { w.status = 'expired'; changed = true; }
  if (changed) db.save();
}

module.exports = {
  PRIORITY, ACTIVE, OPEN, BookingError, slotsFor, calendar, firstFree, validateBooking, book, cancel,
  processWaitlist, joinWaitlist, waitlistPosition, suggest, todayQueue, callNext, queueStatus, avgVisitMinutes,
  tick, notify, sms, log, doctorName, priorityScore, patientAge, isOnLeave, occupancy
};
