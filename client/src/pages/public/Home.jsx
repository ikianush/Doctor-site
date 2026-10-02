// صفحه‌ی اصلی سایت
import { useApp } from '../../lib/app.jsx';
import { get } from '../../lib/api.js';
import { fa, num, SPEC_ICON, formData } from '../../lib/format.js';
import { navigate } from '../../lib/router.js';
import { useAsync } from '../../lib/hooks.js';
import { Icon, Avatar, Loader } from '../../components/ui.jsx';
import { DoctorCard, CenterCard } from '../../components/shared.jsx';

const STEPS = [
  ['search', 'جست‌وجوی پزشک', 'پزشک را بر اساس نام، تخصص، شهر، بیمه یا زودترین نوبت خالی پیدا کنید.'],
  ['calendar', 'انتخاب روز و ساعت', 'روی تقویم شمسی، میزان شلوغی هر روز را ببینید و زمان دلخواه را انتخاب کنید.'],
  ['check-circle', 'تأیید و دریافت کد', 'نوبت بلافاصله تأیید شده و کد رهگیری و پیامک برای شما ارسال می‌شود.'],
  ['mega', 'حضور و پذیرش آنلاین', 'در روز نوبت با زدن «رسیدم» وارد صف شوید و جایگاه خود را زنده ببینید.']
];
const FEATURES = [
  ['shield', 'blue', 'جلوگیری کامل از تداخل', 'کنترل ظرفیت هر اسلات، جلوگیری از رزرو هم‌زمان دو نوبت برای یک بیمار و بررسی تداخل شیفت‌های پزشک در چند مرکز.'],
  ['hourglass', 'purple', 'صف انتظار خودکار', 'با لغو هر نوبت، اولین فرد صف انتظار (بر اساس اولویت پزشکی) به‌صورت خودکار نوبت می‌گیرد و پیامک دریافت می‌کند.'],
  ['clock', 'orange', 'یادآوری چندمرحله‌ای', 'یادآوری ۲۴ ساعت و ۲ ساعت قبل از نوبت از طریق اعلان و پیامک، به همراه افزودن نوبت به تقویم گوشی.'],
  ['flame', 'red', 'اولویت‌بندی بیماران', 'بیماران اورژانسی، باردار، سالمند (تشخیص خودکار از سن) و دارای معلولیت در صف پذیرش و صف انتظار جلوتر قرار می‌گیرند.'],
  ['zap', 'teal', 'پیشنهاد هوشمند زمان', 'پیشنهاد نزدیک‌ترین و خلوت‌ترین زمان‌ها بر اساس ظرفیت پزشک، و معرفی پزشکان هم‌تخصص با نوبت خالی.'],
  ['tv', 'cyan', 'صف زنده و نمایشگر سالن', 'نمایش لحظه‌ای شماره‌ی نوبت در حال ویزیت، زمان انتظار تخمینی و نمایشگر تلویزیونی سالن انتظار با اعلان صوتی.']
];

function SecHead({ eyebrow, icon, title, text, link, linkText, center }) {
  return (
    <div className="sec-head" style={center ? { justifyContent: 'center', textAlign: 'center' } : undefined}>
      <div><span className="eyebrow"><Icon name={icon} size="sm" /> {eyebrow}</span><h2>{title}</h2>{text && <p>{text}</p>}</div>
      {link && <a href={link} className="btn ghost">{linkText} <Icon name="arrow-left" size="sm" /></a>}
    </div>
  );
}

export default function Home() {
  const { meta: m } = useApp();
  const top = useAsync(() => get('/doctors', { sort: 'rating' }), []);
  const search = e => {
    e.preventDefault();
    const q = formData(e.target);
    navigate('/search?' + new URLSearchParams(Object.entries(q).filter(([, v]) => v)));
  };
  const FAQ = [
    ['آیا رزرو نوبت هزینه دارد؟', 'خیر، رزرو نوبت از طریق نوبان کاملاً رایگان است و هزینه‌ی ویزیت در مطب پرداخت می‌شود.'],
    ['چگونه نوبت خود را لغو یا جابه‌جا کنم؟', `از بخش «نوبت‌های من» در پنل کاربری، تا ${fa(m.settings.cancelDeadlineHours)} ساعت قبل از زمان نوبت می‌توانید آن را لغو یا به زمان دیگری منتقل کنید.`],
    ['صف انتظار چگونه کار می‌کند؟', 'اگر ظرفیت روز مورد نظر پر باشد، در صف انتظار ثبت‌نام می‌کنید. با لغو هر نوبت، سیستم به‌صورت خودکار اولین نفر واجد شرایط را (با در نظر گرفتن اولویت پزشکی) جایگزین کرده و پیامک ارسال می‌کند.'],
    ['اولویت‌بندی بیماران به چه معناست؟', 'بیماران اورژانسی، باردار، سالمند و دارای معلولیت هنگام پذیرش در مطب و در صف انتظار، جلوتر از سایرین قرار می‌گیرند.'],
    ['اگر به موقع نرسم چه می‌شود؟', 'پس از گذشت روز نوبت، وضعیت نوبت به «عدم مراجعه» تغییر می‌کند. پیشنهاد می‌کنیم در صورت عدم امکان حضور، نوبت را لغو کنید تا بیمار دیگری از آن استفاده کند.']
  ];
  const h52 = { height: 52 };
  return <>
    <section className="hero"><div className="hero-pattern" /><div className="container">
      <div>
        <span className="hero-badges" style={{ margin: '0 0 18px' }}><span><Icon name="sparkle" size="sm" /> سامانه‌ی هوشمند نوبت‌دهی مراکز درمانی</span></span>
        <h1>نوبت پزشک متخصص،<br /><em>بدون صف و بدون معطلی</em></h1>
        <p className="lead">از بین {fa(m.stats.doctors)} پزشک متخصص در {fa(m.stats.centers)} مرکز درمانی معتبر، بهترین پزشک را پیدا کنید و در کمتر از یک دقیقه نوبت بگیرید. صف انتظار هوشمند، یادآوری پیامکی و پیگیری زنده‌ی نوبت، همه در یک سامانه.</p>
        <div className="row wrap mt3"><a href="#/search" className="btn lg white"><Icon name="search" /> جست‌وجو و رزرو نوبت</a><a href="#/track" className="btn lg" style={{ background: 'rgba(255,255,255,.14)', border: '1px solid rgba(255,255,255,.3)' }}><Icon name="ticket" /> پیگیری نوبت</a></div>
        <div className="hero-badges">{['رزرو ۲۴ ساعته', 'صف انتظار خودکار', 'یادآوری پیامکی', 'اولویت بیماران خاص'].map(t => <span key={t}><Icon name="check" size="sm" /> {t}</span>)}</div>
      </div>
      <div className="hero-visual">
        <div className="float-card a"><div className="row"><Avatar name="دکتر سارا احمدی" size="sm" verified /><div className="grow"><b className="small">دکتر سارا احمدی</b><div className="xs muted">قلب و عروق</div></div><span className="rating-pill"><Icon name="star" />{fa('4.9')}</span></div>
          <div className="earliest mt1" style={{ background: 'var(--success-50)', color: 'var(--success)', padding: '8px 12px', borderRadius: 10, fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center' }}><Icon name="zap" size="sm" /> اولین نوبت: فردا ساعت {fa('10:20')}</div></div>
        <div className="float-card b"><div className="row"><div className="ic teal" style={{ width: 42, height: 42, borderRadius: 12, display: 'grid', placeItems: 'center' }}><Icon name="mega" /></div><div><b className="small">نفر بعدی شما هستید!</b><div className="xs muted">زمان انتظار: ~{fa(5)} دقیقه</div></div></div></div>
        <div className="float-card c"><div className="row between"><b className="small"><Icon name="check-circle" size="sm" /> نوبت شما ثبت شد</b><span className="badge green">تأیید</span></div><div className="xs muted mt1">کد رهگیری: <span className="code">{fa('482913')}</span></div><div className="bar blue mt1"><i style={{ width: '72%' }} /></div></div>
      </div>
    </div></section>

    <div className="container search-box"><div className="card">
      <form className="search-grid" onSubmit={search}>
        <div className="input-icon"><Icon name="search" /><input className="input" name="q" placeholder="نام پزشک، تخصص یا بیماری..." style={h52} /></div>
        <select className="select" name="specialty" style={h52}><option value="">همه‌ی تخصص‌ها</option>{m.specialties.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select className="select" name="city" style={h52}><option value="">همه‌ی شهرها</option>{m.cities.map(c => <option key={c}>{c}</option>)}</select>
        <button className="btn lg"><Icon name="search" /> جست‌وجو</button>
      </form>
      <div className="quick-tags"><span className="small muted">جست‌وجوهای پرتکرار:</span>{['قلب', 'کودکان', 'پوست', 'دندان', 'چشم', 'زنان'].map(t => <a key={t} href={`#/search?q=${t}`}>{t}</a>)}<a href="#/search?available=today" style={{ color: 'var(--success)', borderColor: 'var(--success)' }}><Icon name="zap" size="sm" /> نوبت خالی امروز</a></div>
    </div></div>

    <section className="section"><div className="container">
      <SecHead icon="stethoscope" eyebrow="تخصص‌ها" title="بر اساس تخصص جست‌وجو کنید" text={`${fa(m.specialties.length)} تخصص پزشکی با بهترین متخصصان کشور`} link="#/search" linkText="همه‌ی پزشکان" />
      <div className="spec-grid">{m.specialties.map(s => <a key={s.id} className="spec" href={`#/search?specialty=${s.id}`}><div className="ic"><Icon name={SPEC_ICON(s.icon)} size="lg" /></div><b>{s.name}</b><small>{fa(s.count)} پزشک</small></a>)}</div>
    </div></section>

    <section className="section alt"><div className="container">
      <SecHead icon="award" eyebrow="برترین‌ها" title="پزشکان برتر با بالاترین رضایت" text="بر اساس امتیاز و نظرات ثبت‌شده‌ی بیماران پس از ویزیت" link="#/search?sort=rating" linkText="مشاهده‌ی همه" />
      {top.data ? <div className="grid g3">{top.data.items.slice(0, 6).map(d => <DoctorCard key={d.id} d={d} />)}</div> : <Loader />}
    </div></section>

    <section className="section"><div className="container">
      <SecHead icon="info" eyebrow="راهنما" title="نوبت گرفتن در ۴ قدم ساده" />
      <div className="steps">{STEPS.map(([ic, h, p]) => <div key={h} className="step"><div className="ic"><Icon name={ic} /></div><h4>{h}</h4><p>{p}</p></div>)}</div>
    </div></section>

    <section className="section alt"><div className="container">
      <SecHead icon="zap" eyebrow="قابلیت‌های هوشمند" title="چرا نوبان متفاوت است؟" text="امکاناتی فراتر از یک نوبت‌دهی ساده" />
      <div className="grid g3">{FEATURES.map(([ic, c, h, p]) => <div key={h} className="feature"><div className={`ic ${c}`}><Icon name={ic} /></div><div><h4>{h}</h4><p>{p}</p></div></div>)}</div>
    </div></section>

    <section className="section"><div className="container">
      <div className="card stats-band">
        <div className="stat-big"><b>{num(m.stats.doctors)}+</b><span>پزشک متخصص</span></div>
        <div className="stat-big"><b>{num(m.stats.visits)}+</b><span>ویزیت موفق</span></div>
        <div className="stat-big"><b>{num(m.stats.patients)}+</b><span>بیمار ثبت‌نام‌شده</span></div>
        <div className="stat-big"><b>{fa(m.stats.satisfaction)}٪</b><span>رضایت بیماران</span></div>
      </div>
    </div></section>

    <section className="section alt" style={{ paddingTop: 60 }}><div className="container">
      <SecHead icon="building" eyebrow="مراکز درمانی" title="مراکز درمانی طرف قرارداد" link="#/centers" linkText="همه‌ی مراکز" />
      <div className="grid g3">{m.centers.slice(0, 6).map(c => <CenterCard key={c.id} c={c} />)}</div>
    </div></section>

    <section className="section"><div className="container" style={{ maxWidth: 860 }}>
      <SecHead icon="help" eyebrow="سؤالات متداول" title="پاسخ به پرسش‌های شما" center />
      <div className="faq">{FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
    </div></section>

    <section className="section" style={{ paddingTop: 0 }}><div className="container">
      <div className="cta"><div className="hero-pattern" /><div style={{ position: 'relative' }}><h3>پزشک هستید؟ مطب خود را هوشمند کنید</h3><p style={{ opacity: 0.9, marginTop: 6 }}>مدیریت برنامه‌ی کاری، صف زنده‌ی بیماران، پرونده‌ی ویزیت و گزارش‌های تحلیلی — رایگان در پنل پزشکان نوبان.</p></div>
        <a href="#/login" className="btn lg white" style={{ position: 'relative' }}><Icon name="stethoscope" /> ورود به پنل پزشکان</a></div>
    </div></section>
  </>;
}
