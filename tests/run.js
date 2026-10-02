// آزمون خودکار قوانین نوبت‌دهی — اجرا: npm test
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const PORT = 3000 + Math.floor(Math.random() * 900) + 50;
const DB = path.join(os.tmpdir(), `noban-test-${Date.now()}.json`);
const BASE = `http://localhost:${PORT}/api`;
let pass = 0, fail = 0;

const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'server.js'), '--reset'], { env: { ...process.env, PORT, NOBAN_DB: DB }, stdio: 'ignore' });

async function call(method, url, token, body) {
  const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
function check(name, cond, info = '') {
  if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (info ? '  →  ' + info : '')); }
}
const pad = n => String(n).padStart(2, '0');
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const toMin = t => +t.slice(0, 2) * 60 + +t.slice(3);

async function register(name, mobile, birthYear = 1990) {
  const r = await call('POST', '/auth/register', null, { name, mobile, password: '123456', birthYear });
  return r.data.token;
}

(async () => {
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/meta'); break; } catch { await new Promise(r => setTimeout(r, 200)); } }
  console.log('\n🧪 آزمون سامانه‌ی نوبت‌دهی\n');
  const admin = (await call('POST', '/auth/login', null, { mobile: '09120000001', password: '123456' })).data.token;
  const doctor = (await call('POST', '/auth/login', null, { mobile: '09120000002', password: '123456' })).data.token;
  const rnd = () => '0935' + String(Math.floor(1000000 + Math.random() * 8999999));
  const A = await register('بیمار آزمون الف', rnd());
  const B = await register('بیمار آزمون ب', rnd());
  const C = await register('بیمار آزمون ج', rnd(), 1950); // سالمند
  check('ثبت‌نام و ورود بیماران', A && B && C);

  console.log('\n— احراز هویت و دسترسی');
  check('رمز اشتباه رد می‌شود', (await call('POST', '/auth/login', null, { mobile: '09120000003', password: 'wrong' })).status === 401);
  check('بیمار به API مدیر دسترسی ندارد (403)', (await call('GET', '/admin/stats', A)).status === 403);
  check('بدون توکن به پنل دسترسی نیست (401)', (await call('GET', '/my/appointments')).status === 401);

  console.log('\n— جلوگیری از تداخل');
  // اولین روزی که پزشک ۱ حداقل ۲ اسلات آزاد دارد
  let D, slots;
  for (let i = 2; i < 20; i++) { const r = await call('GET', `/doctors/1/slots?date=${addDays(i)}`); const f = r.data.slots.filter(s => s.free > 0); if (f.length >= 2) { D = addDays(i); slots = f; break; } }
  const T = slots[0].time;
  const b1 = await call('POST', '/appointments', A, { doctorId: 1, date: D, time: T });
  check('رزرو موفق نوبت', b1.status === 200 && b1.data.code, JSON.stringify(b1.data));
  const b2 = await call('POST', '/appointments', B, { doctorId: 1, date: D, time: T });
  check('رزرو اسلات پر رد می‌شود (ظرفیت)', b2.status === 409 && b2.data.code === 'FULL', JSON.stringify(b2.data));
  const b3 = await call('POST', '/appointments', A, { doctorId: 1, date: D, time: slots[1].time });
  check('دو نوبت نزد یک پزشک در یک روز رد می‌شود', b3.status === 409 && b3.data.code === 'DUPLICATE', JSON.stringify(b3.data));
  // تداخل با پزشک دیگر در همان ساعت
  let overlapTested = false;
  for (let d = 2; d <= 20 && !overlapTested; d++) {
    const r = await call('GET', `/doctors/${d}/slots?date=${D}`);
    const s = (r.data.slots || []).find(x => x.free > 0 && toMin(x.time) < toMin(T) + 20 && toMin(T) < toMin(x.time) + x.duration);
    if (s) {
      const b4 = await call('POST', '/appointments', A, { doctorId: d, date: D, time: s.time });
      check('نوبت هم‌پوشان نزد پزشک دیگر رد می‌شود', b4.status === 409 && b4.data.code === 'OVERLAP', JSON.stringify(b4.data));
      overlapTested = true;
    }
  }
  if (!overlapTested) console.log('  ⏭️  آزمون هم‌پوشانی: اسلات هم‌زمانی نزد پزشک دیگر نبود');
  check('رزرو تاریخ گذشته رد می‌شود', (await call('POST', '/appointments', B, { doctorId: 1, date: addDays(-1), time: '10:00' })).status === 409);
  check('رزرو ساعت خارج از شیفت رد می‌شود', (await call('POST', '/appointments', B, { doctorId: 1, date: D, time: '23:10' })).data.code === 'NO_SLOT');
  check('رزرو خارج از بازه‌ی مجاز رد می‌شود', (await call('POST', '/appointments', B, { doctorId: 1, date: addDays(60), time: '10:00' })).data.code === 'WINDOW');

  console.log('\n— صف انتظار و اولویت‌بندی');
  const FULL = addDays(1);
  const cal = (await call('GET', `/doctors/1/calendar?days=3`)).data.find(x => x.date === FULL);
  check('روز فردا برای پزشک نمایشی تکمیل است', cal && cal.free === 0, JSON.stringify(cal));
  const wB = await call('POST', '/waitlist', B, { doctorId: 1, date: FULL, priority: 'normal' });
  const wC = await call('POST', '/waitlist', C, { doctorId: 1, date: FULL, priority: 'urgent' });
  check('عضویت در صف انتظار', wB.status === 200 && wC.status === 200 && wB.data.status === 'waiting');
  check('بیمار اورژانسی جلوتر از بیمار عادی در صف قرار می‌گیرد', wC.data.position < wB.data.position, `C=${wC.data.position} B=${wB.data.position}`);
  check('عضویت تکراری در صف رد می‌شود', (await call('POST', '/waitlist', B, { doctorId: 1, date: FULL })).status === 409);
  // لغو یک نوبت فردا توسط مدیر → نفر اول صف (با بالاترین امتیاز) باید خودکار رزرو شود
  const dayList = (await call('GET', `/admin/appointments?doctorId=1&from=${FULL}&to=${FULL}&status=booked&size=100`, admin)).data.items;
  const victim = dayList[dayList.length - 1];
  const wlBefore = (await call('GET', '/admin/waitlist', admin)).data.filter(w => w.doctorId === 1 && w.date === FULL && w.status === 'waiting').sort((a, b) => a.position - b.position)[0];
  const cr = await call('POST', `/appointments/${victim.id}/cancel`, admin, { reason: 'آزمون' });
  check('لغو نوبت توسط مدیر', cr.status === 200 && cr.data.promoted >= 1, JSON.stringify(cr.data));
  const wlAfter = (await call('GET', '/admin/waitlist', admin)).data.find(w => w.id === wlBefore.id);
  check('نفر اول صف (بالاترین اولویت) به‌صورت خودکار نوبت گرفت', wlAfter.status === 'promoted', JSON.stringify(wlAfter));
  const waitingScores = (await call('GET', '/admin/waitlist', admin)).data.filter(w => w.doctorId === 1 && w.date === FULL).map(w => w.score);
  check('نفر تخصیص‌یافته بالاترین امتیاز اولویت را داشت', wlBefore.score === Math.max(...waitingScores), `score=${wlBefore.score}`);
  const newAppt = (await call('GET', `/admin/appointments?doctorId=1&from=${FULL}&to=${FULL}&size=100`, admin)).data.items.find(a => a.source === 'waitlist' && a.time === victim.time);
  check('نوبت جدید دقیقاً در اسلات آزادشده ثبت شد', !!newAppt, victim.time);

  console.log('\n— برنامه‌ی کاری پزشک');
  const sch = (await call('GET', '/dr/schedules', doctor)).data.schedules[0];
  const ov = await call('POST', '/dr/schedules', doctor, { weekday: sch.weekday, start: sch.start, end: sch.end, slotMinutes: 20, capacity: 1, centerId: sch.centerId });
  check('تعریف شیفت متداخل رد می‌شود', ov.status === 409, JSON.stringify(ov.data));
  const lv = await call('POST', '/dr/leaves', doctor, { from: D, to: D, reason: 'آزمون' });
  check('ثبت مرخصی روی نوبت‌های موجود بدون تأیید رد می‌شود', lv.status === 409 && lv.data.affected > 0, JSON.stringify(lv.data));

  console.log('\n— صف زنده و یادآوری');
  const q = await call('GET', '/dr/queue', doctor);
  check('دریافت صف زنده‌ی امروز', q.status === 200 && Array.isArray(q.data.list));
  const w0 = q.data.waiting;
  if (w0.length > 1) check('صف پذیرش بر اساس امتیاز اولویت مرتب است', w0.every((a, i) => i === 0 || (w0[i - 1].priorityScore || 0) >= (a.priorityScore || 0)));
  const rem = await call('POST', '/admin/run-reminders', admin);
  check('زمان‌بند یادآوری اجرا می‌شود', rem.status === 200);
  const sms = (await call('GET', '/admin/sms', admin)).data;
  check('پیامک‌های یادآوری ثبت شده‌اند', sms.some(s => s.kind === 'reminder'));

  console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق\n`);
  srv.kill();
  try { fs.unlinkSync(DB); } catch { }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
