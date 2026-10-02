// تولید داده‌ی نمایشی واقع‌گرایانه (نسبت به تاریخ امروز)
'use strict';
const db = require('./db');
const U = require('./util');

function rng(seed) { // mulberry32
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEFAULT_SETTINGS = {
  siteName: 'نوبان',
  bookingWindowDays: 30,
  cancelDeadlineHours: 3,
  reminderHours: 24,
  secondReminderHours: 2,
  maxActivePerPatient: 5,
  waitlistAutoBook: true,
  supportPhone: '۰۲۱-۹۱۰۰۰۰۰۰',
  maintenance: false
};

const SPECIALTIES = [
  ['قلب و عروق', 'heart', 'تشخیص و درمان بیماری‌های قلب، فشار خون و عروق'],
  ['داخلی', 'stethoscope', 'بیماری‌های داخلی، دیابت، تیروئید و گوارش'],
  ['کودکان', 'baby', 'مراقبت‌های سلامت نوزادان، کودکان و نوجوانان'],
  ['زنان و زایمان', 'female', 'مراقبت‌های بارداری، زایمان و بیماری‌های زنان'],
  ['پوست و مو', 'sparkle', 'بیماری‌های پوست، مو، ناخن و زیبایی'],
  ['ارتوپدی', 'bone', 'بیماری‌های استخوان، مفاصل و آسیب‌های ورزشی'],
  ['چشم‌پزشکی', 'eye', 'معاینه‌ی چشم، عینک، آب‌مروارید و لیزیک'],
  ['گوش، حلق و بینی', 'ear', 'سینوزیت، شنوایی، لوزه و جراحی بینی'],
  ['مغز و اعصاب', 'brain', 'سردرد، میگرن، صرع و بیماری‌های عصبی'],
  ['روان‌پزشکی', 'mind', 'افسردگی، اضطراب، اختلالات خواب و مشاوره'],
  ['دندان‌پزشکی', 'tooth', 'ترمیم، عصب‌کشی، ارتودنسی و ایمپلنت'],
  ['پزشک عمومی', 'user', 'ویزیت عمومی، چکاپ و ارجاع تخصصی'],
  ['تغذیه و رژیم', 'apple', 'رژیم درمانی، کاهش و افزایش وزن'],
  ['اورولوژی', 'kidney', 'بیماری‌های کلیه، مجاری ادراری و سنگ کلیه']
];

const CENTERS = [
  { name: 'بیمارستان پارس', type: 'بیمارستان', city: 'تهران', address: 'تهران، خیابان کریم‌خان زند، پلاک ۴۵', phone: '۰۲۱-۸۸۸۱۲۳۴۵', facilities: ['پارکینگ', 'آزمایشگاه', 'رادیولوژی', 'داروخانه', 'اورژانس ۲۴ ساعته'], color: '#0ea5e9' },
  { name: 'کلینیک تخصصی آرامش', type: 'کلینیک', city: 'تهران', address: 'تهران، سعادت‌آباد، بلوار دریا، پلاک ۱۲', phone: '۰۲۱-۲۲۳۵۶۷۸۹', facilities: ['پارکینگ', 'آسانسور', 'کافه', 'نوبت‌دهی آنلاین'], color: '#8b5cf6' },
  { name: 'درمانگاه شبانه‌روزی سلامت', type: 'درمانگاه', city: 'تهران', address: 'تهران، نارمک، میدان هفت حوض', phone: '۰۲۱-۷۷۹۰۰۱۱۲', facilities: ['شبانه‌روزی', 'تزریقات', 'پانسمان', 'نوار قلب'], color: '#10b981' },
  { name: 'بیمارستان امید', type: 'بیمارستان', city: 'اصفهان', address: 'اصفهان، خیابان چهارباغ بالا، کوچه‌ی ۸', phone: '۰۳۱-۳۶۶۴۵۵۰۰', facilities: ['پارکینگ', 'MRI', 'سی‌تی‌اسکن', 'ICU'], color: '#f59e0b' },
  { name: 'کلینیک ویژه‌ی نگین', type: 'کلینیک', city: 'شیراز', address: 'شیراز، خیابان ملاصدرا، ساختمان پزشکان نگین', phone: '۰۷۱-۳۲۳۰۴۴۵۵', facilities: ['آسانسور', 'سونوگرافی', 'آزمایشگاه'], color: '#ef4444' },
  { name: 'مرکز درمانی رضوی', type: 'بیمارستان', city: 'مشهد', address: 'مشهد، بلوار سجاد، نبش سجاد ۱۰', phone: '۰۵۱-۳۷۶۶۸۸۹۹', facilities: ['پارکینگ', 'اورژانس', 'داروخانه', 'فیزیوتراپی'], color: '#14b8a6' }
];

const INSURANCES = ['تأمین اجتماعی', 'سلامت ایرانیان', 'نیروهای مسلح', 'بیمه دی', 'بیمه آسیا', 'بیمه ایران', 'آتیه‌سازان حافظ'];

const MALE = ['علی', 'محمد', 'رضا', 'حسین', 'امیر', 'مهدی', 'سعید', 'حمید', 'بهزاد', 'کامران', 'آرش', 'فرهاد', 'پویا', 'سینا', 'مجید', 'نیما', 'بابک', 'کاوه', 'داریوش', 'امید'];
const FEMALE = ['زهرا', 'مریم', 'فاطمه', 'سارا', 'نرگس', 'الهام', 'لیلا', 'نازنین', 'شیما', 'مهسا', 'پریسا', 'نیلوفر', 'فرناز', 'ساناز', 'هانیه', 'یاسمن', 'رویا', 'مینا', 'آزاده', 'ترانه'];
const LAST = ['احمدی', 'محمدی', 'حسینی', 'رضایی', 'کریمی', 'موسوی', 'جعفری', 'صادقی', 'کاظمی', 'رحیمی', 'نوری', 'طاهری', 'عباسی', 'فراهانی', 'شریفی', 'قاسمی', 'مرادی', 'یزدانی', 'اکبری', 'زمانی', 'توکلی', 'سلیمانی', 'امینی', 'بهرامی', 'پاکزاد', 'نیک‌نام', 'افشار', 'تهرانی', 'شیرازی', 'کیانی'];

const DOCTORS = [
  // [نام، جنسیت، تخصص(ایندکس)، مدرک، سابقه، مراکز، شهر]
  ['سارا احمدی', 'f', 0, 'فوق تخصص قلب و عروق', 16, [0, 1]],
  ['کامران موسوی', 'm', 0, 'متخصص قلب و عروق', 22, [0]],
  ['مهدی کریمی', 'm', 1, 'متخصص داخلی', 12, [1, 2]],
  ['نرگس صادقی', 'f', 2, 'متخصص کودکان و نوزادان', 9, [1]],
  ['امیر حسینی', 'm', 2, 'فوق تخصص گوارش کودکان', 14, [0]],
  ['لیلا جعفری', 'f', 3, 'متخصص زنان، زایمان و نازایی', 18, [0, 1]],
  ['نازنین طاهری', 'f', 4, 'متخصص پوست، مو و زیبایی', 7, [1]],
  ['بهزاد رحیمی', 'm', 5, 'متخصص جراحی ارتوپدی', 20, [0, 3]],
  ['فرهاد کاظمی', 'm', 6, 'فلوشیپ قرنیه و جراحی لیزیک', 15, [1]],
  ['الهام نوری', 'f', 7, 'متخصص گوش، حلق و بینی', 11, [2]],
  ['سعید عباسی', 'm', 8, 'متخصص مغز و اعصاب', 19, [0]],
  ['مریم فراهانی', 'f', 9, 'متخصص روان‌پزشکی', 10, [1]],
  ['پویا شریفی', 'm', 10, 'دکترای حرفه‌ای دندان‌پزشکی', 8, [2]],
  ['حمید قاسمی', 'm', 11, 'پزشک عمومی', 6, [2]],
  ['یاسمن مرادی', 'f', 12, 'دکترای تخصصی تغذیه', 5, [1]],
  ['داریوش یزدانی', 'm', 13, 'متخصص اورولوژی', 17, [3]],
  ['شیما اکبری', 'f', 0, 'متخصص قلب و عروق', 8, [4]],
  ['آرش زمانی', 'm', 5, 'متخصص ارتوپدی و طب ورزشی', 13, [5]],
  ['مینا توکلی', 'f', 1, 'فوق تخصص غدد و متابولیسم', 21, [5]],
  ['کاوه سلیمانی', 'm', 6, 'متخصص چشم‌پزشکی', 9, [4]]
];

const BIOS = [
  'دارای بورد تخصصی و عضو انجمن علمی مربوطه، با سال‌ها تجربه در درمان بیماران در مراکز معتبر کشور. رویکرد من درمان مبتنی بر شواهد علمی و توجه کامل به شرایط هر بیمار است.',
  'فارغ‌التحصیل دانشگاه علوم پزشکی تهران با سابقه‌ی عضویت هیئت‌علمی. تمرکز اصلی بر پیشگیری، تشخیص زودهنگام و درمان کم‌تهاجمی است.',
  'دارای فلوشیپ از دانشگاه‌های معتبر و نویسنده‌ی چندین مقاله‌ی علمی بین‌المللی. آماده‌ی ارائه‌ی مشاوره و درمان با به‌روزترین روش‌ها هستم.'
];

const REVIEWS = [
  [5, 'بسیار با حوصله و دقیق معاینه کردند. کاملاً راضی هستم.'],
  [5, 'دکتر فوق‌العاده‌ای هستند، توضیحات کامل دادند و درمان مؤثر بود.'],
  [4, 'برخورد خوب و حرفه‌ای، فقط کمی در مطب منتظر ماندم.'],
  [5, 'سیستم نوبت‌دهی عالی بود، سر ساعت ویزیت شدم.'],
  [4, 'راضی بودم، تشخیص درست و سریع.'],
  [3, 'پزشک خوبی هستند ولی زمان ویزیت کوتاه بود.'],
  [5, 'بهترین پزشکی که تا به حال مراجعه کرده‌ام. ممنونم.'],
  [4, 'محیط مطب تمیز و منشی بسیار مؤدب بود.']
];

const REASONS = ['چکاپ دوره‌ای', 'پیگیری نتیجه‌ی آزمایش', 'درد مزمن', 'ویزیت اولیه', 'تمدید نسخه', 'سردرد و سرگیجه', 'کنترل فشار خون', 'مشاوره قبل از عمل', ''];
const DIAG = ['وضعیت عمومی مطلوب؛ ادامه‌ی درمان فعلی', 'فشار خون بالا – نیاز به کنترل روزانه', 'عفونت ویروسی خفیف', 'کمبود ویتامین D', 'التهاب مفصل زانو', 'میگرن بدون اورا', 'رفلاکس معده'];
const RX = [['آملودیپین ۵ میلی‌گرم – روزی یک عدد', 'آسپرین ۸۰ – روزی یک عدد پس از ناهار'], ['استامینوفن ۵۰۰ – هر ۸ ساعت در صورت درد'], ['ویتامین D3 پنجاه‌هزار واحد – هفته‌ای یک عدد به مدت ۸ هفته'], ['ناپروکسن ۲۵۰ – روزی دو عدد پس از غذا', 'ژل دیکلوفناک – موضعی'], ['پنتوپرازول ۴۰ – ناشتا', 'دومپریدون – قبل از غذا']];

function seed() {
  db.reset();
  const R = rng(1405);
  const pick = a => a[Math.floor(R() * a.length)];
  const now = new Date().toISOString();
  const today = U.ymd();
  const d = db.data;
  d.settings = { ...DEFAULT_SETTINGS };

  const shared = U.hashPassword('123456'); // برای سرعت ساخت داده‌ی نمایشی
  const mkUser = (o) => {
    const { salt, hash } = o.password ? U.hashPassword(o.password) : shared;
    delete o.password;
    return db.insert('users', { active: true, createdAt: now, city: 'تهران', ...o, salt, hash });
  };

  // حساب‌های نمایشی
  mkUser({ role: 'admin', name: 'مدیر سامانه', mobile: '09120000001', gender: 'm', nationalCode: '0012345679', birthYear: 1985 });
  const sp = SPECIALTIES.map(([name, icon, description]) => db.insert('specialties', { name, icon, description, active: true }));
  const ct = CENTERS.map(c => db.insert('centers', { ...c, active: true, description: `${c.type} ${c.name} با بهره‌گیری از کادر مجرب و تجهیزات به‌روز، آماده‌ی ارائه‌ی خدمات درمانی به شهروندان عزیز است.` }));

  const doctorIds = [];
  DOCTORS.forEach(([name, g, si, degree, exp, centers], i) => {
    const u = mkUser({ role: 'doctor', name: 'دکتر ' + name, mobile: i === 0 ? '09120000002' : '0912' + String(1000000 + i * 7919).slice(-7), gender: g, birthYear: 1990 - exp, city: ct[centers[0]].city });
    const doc = db.insert('doctors', {
      userId: u.id, specialtyId: sp[si].id, degree, experience: exp, gender: g,
      medicalCode: String(80000 + Math.floor(R() * 90000)), centerIds: centers.map(c => ct[c].id), city: ct[centers[0]].city,
      bio: BIOS[i % BIOS.length], fee: [180, 250, 320, 400, 450][Math.floor(R() * 5)] * 1000,
      insurances: INSURANCES.filter(() => R() > 0.45), accepting: true, active: true, verified: i !== 19,
      tags: ['نوبت‌دهی سریع', 'پاسخ‌گو', 'ویزیت آنلاین', 'پارکینگ'].filter(() => R() > 0.5)
    });
    doctorIds.push(doc.id);
    // برنامه‌ی کاری
    if (i === 0) {
      // پزشک نمایشی: هر روز فعال تا صف زنده همیشه قابل نمایش باشد
      [6, 0, 1, 2, 3, 4].forEach(wd => db.insert('schedules', { doctorId: doc.id, centerId: ct[0].id, weekday: wd, start: '08:00', end: '13:00', slotMinutes: 20, capacity: 1, active: true }));
      [6, 0, 1, 2, 3, 4, 5].forEach(wd => db.insert('schedules', { doctorId: doc.id, centerId: ct[1].id, weekday: wd, start: '16:00', end: '21:00', slotMinutes: 20, capacity: 1, active: true }));
    } else {
      const days = [6, 0, 1, 2, 3, 4].filter(() => R() > 0.4);
      if (days.length < 2) days.push(6, 2);
      const slot = pick([15, 20, 20, 30]);
      days.forEach((wd, k) => {
        const morning = (k + i) % 2 === 0;
        db.insert('schedules', { doctorId: doc.id, centerId: ct[centers[k % centers.length]].id, weekday: wd, start: morning ? '09:00' : '16:00', end: morning ? '13:00' : '20:00', slotMinutes: slot, capacity: R() > 0.8 ? 2 : 1, active: true });
      });
      // حداقل یک شیفت عصر جمعه برای برخی پزشکان (درمانگاه شبانه‌روزی)
      if (centers.includes(2)) db.insert('schedules', { doctorId: doc.id, centerId: ct[2].id, weekday: 5, start: '17:00', end: '21:00', slotMinutes: 20, capacity: 1, active: true });
    }
  });
  // یک مرخصی نمایشی
  db.insert('leaves', { doctorId: doctorIds[1], from: U.addDays(today, 3), to: U.addDays(today, 5), reason: 'شرکت در کنگره‌ی قلب' });

  // بیماران
  const demoPatient = mkUser({ role: 'patient', name: 'علی رضایی', mobile: '09120000003', gender: 'm', nationalCode: '0019876542', birthYear: 1992, insurance: 'تأمین اجتماعی', city: 'تهران' });
  const patients = [demoPatient];
  for (let i = 0; i < 180; i++) {
    const g = R() > 0.5 ? 'm' : 'f';
    const name = `${pick(g === 'm' ? MALE : FEMALE)} ${pick(LAST)}`;
    patients.push(mkUser({ role: 'patient', name, mobile: '093' + String(10000000 + Math.floor(R() * 89999999)), gender: g, birthYear: 1945 + Math.floor(R() * 75), insurance: pick(INSURANCES), city: pick(['تهران', 'تهران', 'تهران', 'اصفهان', 'شیراز', 'مشهد']) }));
  }

  // نوبت‌ها
  const busy = new Map(); // patientId|date -> [[s,e]]
  const docDay = new Set(); // patientId|doctorId|date
  const nm = U.nowMin();
  const canTake = (pid, did, date, s, e) => {
    if (docDay.has(`${pid}|${did}|${date}`)) return false;
    return !(busy.get(`${pid}|${date}`) || []).some(([a, b]) => s < b && a < e);
  };
  const take = (pid, did, date, s, e) => {
    docDay.add(`${pid}|${did}|${date}`);
    const k = `${pid}|${date}`; busy.set(k, [...(busy.get(k) || []), [s, e]]);
  };
  const prioOf = p => { const age = new Date().getFullYear() - p.birthYear; return age >= 65 ? 'elderly' : R() > 0.93 ? 'pregnant' : R() > 0.97 ? 'urgent' : 'normal'; };
  const scoreOf = { urgent: 100, disabled: 60, pregnant: 50, elderly: 40, child: 30, normal: 0 };
  let code = 100000 + Math.floor(R() * 500000);

  const addAppt = (doctorId, patient, date, time, dur, centerId, status, extra = {}) => {
    const s = U.toMin(time);
    take(patient.id, doctorId, date, s, s + dur);
    const pr = extra.priority || prioOf(patient);
    const created = new Date(U.parseYmd(date).getTime() - (1 + Math.floor(R() * 10)) * 86400000).toISOString();
    return db.insert('appointments', {
      code: String(code += 1 + Math.floor(R() * 97)), doctorId, patientId: patient.id, centerId, date, time, duration: dur,
      status, priority: pr, priorityScore: scoreOf[pr], reason: pick(REASONS), source: R() > 0.15 ? 'online' : 'phone',
      bookedBy: patient.id, createdAt: created, reminders: date < today ? { first: created, second: created } : {}, ...extra
    });
  };

  // نوبت‌های قطعی بیمار نمایشی
  const demoDoc = doctorIds[0];
  const schedFor = (did, date) => d.schedules.filter(s => s.doctorId === did && s.weekday === U.weekday(date));
  const findSlot = (did, date, pref) => {
    for (const sh of schedFor(did, date)) for (let t = U.toMin(sh.start); t + sh.slotMinutes <= U.toMin(sh.end); t += sh.slotMinutes)
      if (!pref || U.fromMin(t) >= pref) return { time: U.fromMin(t), dur: sh.slotMinutes, centerId: sh.centerId };
    return null;
  };
  const demoPlan = [
    { doc: 0, off: -40, st: 'done' }, { doc: 2, off: -25, st: 'done' }, { doc: 7, off: -12, st: 'done' },
    { doc: 5, off: -6, st: 'cancelled' }, { doc: 0, off: 2, st: 'booked' }, { doc: 12, off: 6, st: 'booked' }
  ];
  for (const p of demoPlan) {
    for (let k = 0; k < 7; k++) {
      const date = U.addDays(today, p.off + k);
      const sl = findSlot(doctorIds[p.doc], date, p.st === 'booked' ? '10:00' : null);
      if (!sl) continue;
      const extra = {};
      if (p.st === 'done') {
        const rx = pick(RX);
        Object.assign(extra, { diagnosis: pick(DIAG), prescription: rx, note: 'مراجعه‌ی مجدد در صورت تداوم علائم. مصرف آب کافی و پیاده‌روی روزانه توصیه می‌شود.', calledAt: now, finishedAt: now });
      }
      if (p.st === 'cancelled') Object.assign(extra, { cancelledAt: now, cancelledBy: demoPatient.id, cancelReason: 'تغییر برنامه‌ی کاری' });
      const a = addAppt(doctorIds[p.doc], demoPatient, date, sl.time, sl.dur, sl.centerId, p.st, { ...extra, priority: 'normal' });
      if (p.st === 'done' && p.doc !== 7) db.insert('reviews', { doctorId: a.doctorId, patientId: demoPatient.id, appointmentId: a.id, rating: 5, comment: 'بسیار با حوصله توضیح دادند. ممنون از سامانه‌ی خوبتان.', createdAt: now, approved: true });
      break;
    }
  }

  // پر کردن تصادفی
  for (const did of doctorIds) {
    const isDemo = did === demoDoc;
    for (let off = -21; off <= 14; off++) {
      const date = U.addDays(today, off);
      const leave = d.leaves.find(l => l.doctorId === did && date >= l.from && date <= l.to);
      if (leave) continue;
      // روز پر برای نمایش صف انتظار
      const fullDay = isDemo && (off === 1 || off === 4);
      for (const sh of schedFor(did, date)) {
        for (let t = U.toMin(sh.start); t + sh.slotMinutes <= U.toMin(sh.end); t += sh.slotMinutes) {
          const time = U.fromMin(t);
          for (let c = 0; c < sh.capacity; c++) {
            const exists = d.appointments.filter(a => a.doctorId === did && a.date === date && a.time === time && a.status !== 'cancelled').length;
            if (exists > c) continue;
            let p = off < 0 ? 0.72 : off === 0 ? 0.8 : off < 4 ? 0.62 : off < 8 ? 0.4 : 0.2;
            if (c > 0) p *= 0.5;
            if (!fullDay && R() > p) continue;
            let patient = null;
            for (let tries = 0; tries < 12 && !patient; tries++) {
              const cand = patients[1 + Math.floor(R() * (patients.length - 1))];
              if (canTake(cand.id, did, date, t, t + sh.slotMinutes)) patient = cand;
            }
            if (!patient) continue;
            let status = 'booked'; const extra = {};
            const past = off < 0 || (off === 0 && t + sh.slotMinutes <= nm);
            if (past) {
              const r = R();
              status = r < 0.8 ? 'done' : r < 0.9 ? 'no_show' : 'cancelled';
              if (status === 'done') {
                const st = new Date(U.stamp(date, time) + R() * 5 * 60000);
                Object.assign(extra, { calledAt: st.toISOString(), finishedAt: new Date(st.getTime() + (8 + R() * 14) * 60000).toISOString(), diagnosis: pick(DIAG), prescription: R() > 0.4 ? pick(RX) : [] });
              }
              if (status === 'cancelled') Object.assign(extra, { cancelledAt: now, cancelledBy: patient.id, cancelReason: 'انصراف بیمار' });
            } else if (off === 0 && t - nm < 90) {
              status = R() > 0.35 ? 'checked_in' : 'booked';
              if (status === 'checked_in') extra.checkedInAt = now;
            } else if (off > 0 && R() < 0.07 && !fullDay) {
              status = 'cancelled'; Object.assign(extra, { cancelledAt: now, cancelledBy: patient.id, cancelReason: 'انصراف بیمار' });
            }
            const a = addAppt(did, patient, date, time, sh.slotMinutes, sh.centerId, status, extra);
            if (status === 'done' && R() > 0.55) {
              const [rating, comment] = pick(REVIEWS);
              const adj = Math.max(3, rating - (R() > 0.85 ? 1 : 0));
              db.insert('reviews', { doctorId: did, patientId: patient.id, appointmentId: a.id, rating: adj, comment, createdAt: a.finishedAt || now, approved: true });
            }
          }
        }
      }
    }
    // در صف امروز: آخرین نوبت گذشته را «در حال ویزیت» کن
    const todays = d.appointments.filter(a => a.doctorId === did && a.date === today && a.status === 'done').sort((a, b) => b.time.localeCompare(a.time));
    if (todays[0] && U.toMin(todays[0].time) + 60 > nm) {
      todays[0].status = 'in_visit'; todays[0].finishedAt = null; todays[0].calledAt = now;
    }
  }

  // صف انتظار نمونه
  const fullDate = U.addDays(today, 1);
  const freeForWait = patients.slice(1).filter(p => !busy.has(`${p.id}|${fullDate}`));
  for (let i = 0; i < 4; i++) {
    const p = freeForWait[i * 3] || freeForWait[i];
    if (!p) break;
    const pr = ['normal', 'elderly', 'urgent', 'pregnant'][i];
    db.insert('waitlist', { doctorId: demoDoc, patientId: p.id, date: fullDate, priority: pr, score: scoreOf[pr], note: '', status: 'waiting', createdAt: new Date(Date.now() - (5 - i) * 3600000).toISOString() });
  }
  db.insert('waitlist', { doctorId: demoDoc, patientId: demoPatient.id, date: U.addDays(today, 4), priority: 'normal', score: 0, note: 'ترجیحاً صبح', status: 'waiting', createdAt: now });

  // اعلان‌های اولیه
  const n = (userId, type, title, body, link) => db.insert('notifications', { userId, type, title, body, link, read: false, createdAt: now });
  n(demoPatient.id, 'welcome', 'به نوبان خوش آمدید 👋', 'از این پس می‌توانید نوبت پزشکان را آنلاین رزرو، لغو یا جابه‌جا کنید.', '/search');
  n(demoPatient.id, 'waitlist', 'ثبت در صف انتظار', 'در صف انتظار دکتر سارا احمدی ثبت شدید. به محض آزاد شدن ظرفیت، نوبت به‌صورت خودکار برایتان رزرو می‌شود.', '/panel/waitlist');
  n(d.doctors[0].userId, 'welcome', 'پنل پزشک فعال شد', 'برنامه‌ی کاری، صف زنده‌ی امروز و پرونده‌ی بیماران خود را از این پنل مدیریت کنید.', '/dr');
  n(1, 'welcome', 'گزارش سیستم', 'داده‌های نمایشی با موفقیت بارگذاری شد.', '/admin');

  // تیکت پشتیبانی نمونه
  db.insert('tickets', { userId: demoPatient.id, subject: 'عدم دریافت پیامک یادآوری', body: 'برای نوبت هفته‌ی قبل پیامک یادآوری دریافت نکردم.', status: 'answered', answer: 'با سلام، شماره‌ی شما بررسی و مشکل برطرف شد. سپاس از همراهی شما.', createdAt: now });

  db.insert('logs', { userId: 1, action: 'system.seed', detail: 'بارگذاری داده‌ی نمایشی', at: now });
  db.flush();
  return { users: d.users.length, doctors: d.doctors.length, appointments: d.appointments.length };
}

module.exports = { seed, DEFAULT_SETTINGS, INSURANCES };
