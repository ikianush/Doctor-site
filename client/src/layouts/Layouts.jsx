// قالب‌های صفحه: عمومی (هدر و فوتر)، پنل (منوی کناری) و خالی
import { useEffect, useState } from 'react';
import { useApp } from '../lib/app.jsx';
import { get, post } from '../lib/api.js';
import * as J from '../lib/jalali.js';
import { fa, homeFor, ROLE_LABEL } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { Icon, Avatar, Loader } from '../components/ui.jsx';
import { Popover } from '../components/overlay.jsx';

export function Logo({ sub = 'نوبت‌دهی آنلاین پزشکان' }) {
  const { siteName } = useApp();
  return (
    <a href="#/" className="logo">
      <span className="logo-mark"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20s-7.5-4.6-9.3-9.2A5 5 0 0 1 12 6.5a5 5 0 0 1 9.3 4.3C19.5 15.4 12 20 12 20z" fill="rgba(255,255,255,.18)" /><path d="M5.5 12h3l1.5-3 3 6 1.5-3h4" /></svg></span>
      <span>{siteName}<small>{sub}</small></span>
    </a>
  );
}

function ThemeButton() {
  const { theme, toggleTheme } = useApp();
  return <button className="icon-btn" onClick={toggleTheme} title="تغییر تم"><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>;
}

/* ---------------- اعلان‌ها ---------------- */
const NOTIF_IC = { booked: ['calendar', 'blue'], cancelled: ['x-circle', 'red'], reminder: ['clock', 'orange'], waitlist: ['hourglass', 'purple'], call: ['mega', 'teal'], queue: ['queue', 'teal'], welcome: ['heart', 'blue'], new: ['calendar', 'green'], review: ['star', 'orange'], visit: ['file', 'green'], ticket: ['headset', 'cyan'] };
export function NotifItem({ n, onClick }) {
  const [ic, c] = NOTIF_IC[n.type] || ['bell', 'blue'];
  return (
    <div className={`notif ${n.read ? '' : 'unread'}`} onClick={onClick}>
      <div className={`ic ${c}`}><Icon name={ic} size="sm" /></div>
      <div className="grow"><b>{n.title}</b><p>{n.body}</p><span className="xs muted">{J.ago(n.createdAt)}</span></div>
    </div>
  );
}

function NotifPopover({ anchor, onClose }) {
  const { user, setUnread, refreshUnread } = useApp();
  const [list, setList] = useState(null);
  useEffect(() => { get('/notifications').then(setList).catch(() => setList([])); }, []);
  const home = homeFor(user.role);
  const readAll = async e => {
    e.stopPropagation();
    await post('/notifications/read-all');
    setList(l => l.map(n => ({ ...n, read: true })));
    setUnread(0);
  };
  const open = n => {
    post(`/notifications/${n.id}/read`).then(() => refreshUnread());
    onClose();
    if (n.link) navigate(n.link);
  };
  return (
    <Popover anchor={anchor} onClose={onClose} width={Math.min(380, innerWidth - 24)} className="notif-pop">
      <div className="row between" style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}><b>اعلان‌ها</b><button className="btn xs ghost" onClick={readAll} style={{ width: 'auto' }}>خواندن همه</button></div>
      {!list ? <Loader pad={30} /> : list.length ? <>
        {list.slice(0, 12).map(n => <NotifItem key={n.id} n={n} onClick={() => open(n)} />)}
        <a href={`#${home === '/admin' ? '/admin' : home + '/notifications'}`} style={{ justifyContent: 'center', color: 'var(--primary)', padding: 12 }}>مشاهده‌ی همه</a>
      </> : <div className="empty" style={{ padding: 30 }}>اعلانی ندارید</div>}
    </Popover>
  );
}

function UserMenu({ anchor, onClose }) {
  const { user, logout, toggleTheme } = useApp();
  return (
    <Popover anchor={anchor} onClose={onClose} width={250}>
      <div style={{ padding: '10px 12px' }}><b>{user.name}</b><div className="xs muted ltr">{fa(user.mobile)}</div></div>
      <div className="divider" style={{ margin: '4px 0' }} />
      <a href={`#${homeFor(user.role)}`}><Icon name="grid" /> ورود به پنل {ROLE_LABEL[user.role]}</a>
      {user.role === 'patient' && <><a href="#/panel/appointments"><Icon name="calendar" /> نوبت‌های من</a><a href="#/panel/profile"><Icon name="user" /> پروفایل</a></>}
      {user.role === 'doctor' && <><a href="#/dr/queue"><Icon name="queue" /> صف زنده‌ی امروز</a><a href={`#/doctor/${user.doctor?.id}`}><Icon name="eye" /> صفحه‌ی عمومی من</a></>}
      <button data-dd-close onClick={toggleTheme}><Icon name="moon" /> تغییر تم روشن / تیره</button>
      <button data-dd-close onClick={logout} style={{ color: 'var(--danger)' }}><Icon name="logout" /> خروج</button>
    </Popover>
  );
}

/** دکمه‌ای که با کلیک، منوی شناور خود را باز/بسته می‌کند */
function PopButton({ className, title, popover: Pop, children }) {
  const [anchor, setAnchor] = useState(null);
  return <>
    <button className={className} title={title} onClick={e => { const el = e.currentTarget; setAnchor(a => (a ? null : el)); }}>{children}</button>
    {anchor && <Pop anchor={anchor} onClose={() => setAnchor(null)} />}
  </>;
}

function UserChip() {
  const { user } = useApp();
  if (!user) return <a href="#/login" className="btn sm"><Icon name="login" size="sm" /> ورود / ثبت‌نام</a>;
  return <>
    <PopButton className="icon-btn" title="اعلان‌ها" popover={NotifPopover}><Icon name="bell" /><span className={`count ${user.unread ? '' : 'hidden'}`}>{fa(user.unread || 0)}</span></PopButton>
    <PopButton className="user-chip" popover={UserMenu}><Avatar name={user.name} size="sm" /><b>{user.name}</b><Icon name="chev-down" size="sm" /></PopButton>
  </>;
}

/* ---------------- قالب عمومی ---------------- */
const NAV = [['/', 'خانه', 'home'], ['/search', 'جست‌وجوی پزشک', 'search'], ['/centers', 'مراکز درمانی', 'building'], ['/track', 'پیگیری نوبت', 'ticket'], ['/about', 'درباره‌ی سامانه', 'info']];
function MobileNav({ anchor, onClose }) {
  return <Popover anchor={anchor} onClose={onClose}>{NAV.map(([p, l, ic]) => <a key={p} href={'#' + p}><Icon name={ic} /> {l}</a>)}</Popover>;
}

export function PublicLayout({ path, children }) {
  return <>
    <header className="topbar"><div className="container">
      <PopButton className="icon-btn burger" popover={MobileNav}><Icon name="menu" /></PopButton>
      <Logo />
      <nav className="nav">{NAV.map(([p, l]) => <a key={p} href={'#' + p} className={path === p || (p !== '/' && path.startsWith(p)) ? 'active' : ''}>{l}</a>)}</nav>
      <div className="top-actions"><ThemeButton /><UserChip /></div>
    </div></header>
    <main id="view">{children}</main>
    <Footer />
  </>;
}

function Footer() {
  const { meta, siteName } = useApp();
  return (
    <footer className="footer"><div className="container">
      <div className="footer-grid">
        <div><Logo sub="سلامت شما، در یک کلیک" /><p className="mt2 small" style={{ maxWidth: 340 }}>نوبان سامانه‌ی هوشمند نوبت‌دهی آنلاین مراکز درمانی است. جست‌وجوی پزشک، رزرو و لغو نوبت، صف انتظار هوشمند و یادآوری خودکار — همه در یک جا.</p>
          <div className="trust"><div><Icon name="shield" size="lg" /></div><div><Icon name="award" size="lg" /></div><div><Icon name="lock" size="lg" /></div></div></div>
        <div><h5>تخصص‌های پرمراجعه</h5>{(meta?.specialties || []).slice(0, 6).map(x => <a key={x.id} href={`#/search?specialty=${x.id}`}>{x.name}</a>)}</div>
        <div><h5>دسترسی سریع</h5><a href="#/search">رزرو نوبت</a><a href="#/track">پیگیری نوبت با کد رهگیری</a><a href="#/centers">مراکز درمانی</a><a href="#/display/1">نمایشگر سالن انتظار</a><a href="#/login">ورود پزشکان</a></div>
        <div><h5>ارتباط با ما</h5><a><Icon name="phone" size="sm" /> <span className="ltr">{meta?.settings.supportPhone}</span></a><a>پاسخ‌گویی: شنبه تا پنجشنبه ۸ الی ۲۰</a><a>تهران، خیابان ولیعصر، برج سلامت</a></div>
      </div>
      <div className="footer-bottom"><span>© {fa(J.jOf(J.ymd()).jy)} — تمامی حقوق برای سامانه‌ی {siteName} محفوظ است.</span><span>پروژه‌ی نهایی — طراحی و پیاده‌سازی سامانه‌ی نوبت‌دهی مراکز درمانی (React)</span></div>
    </div></footer>
  );
}

/* ---------------- قالب پنل ---------------- */
const MENUS = {
  patient: [['پنل کاربری'], ['/panel', 'grid', 'داشبورد'], ['/panel/appointments', 'calendar', 'نوبت‌های من'], ['/search', 'plus', 'رزرو نوبت جدید'], ['/panel/waitlist', 'hourglass', 'صف انتظار'], ['/panel/records', 'file', 'پرونده‌ی سلامت'],
    ['حساب کاربری'], ['/panel/notifications', 'bell', 'اعلان‌ها', 'unread'], ['/panel/support', 'headset', 'پشتیبانی'], ['/panel/profile', 'user', 'پروفایل و امنیت']],
  doctor: [['مطب من'], ['/dr', 'grid', 'داشبورد'], ['/dr/queue', 'queue', 'صف زنده‌ی امروز'], ['/dr/appointments', 'calendar', 'نوبت‌ها'], ['/dr/schedule', 'clock', 'برنامه‌ی کاری و مرخصی'], ['/dr/waitlist', 'hourglass', 'صف انتظار'], ['/dr/patients', 'users', 'بیماران من'], ['/dr/reviews', 'star', 'نظرات بیماران'],
    ['حساب کاربری'], ['/dr/notifications', 'bell', 'اعلان‌ها', 'unread'], ['/dr/profile', 'user', 'پروفایل پزشک']],
  admin: [['گزارش‌ها'], ['/admin', 'grid', 'داشبورد مدیریتی'], ['/admin/appointments', 'calendar', 'همه‌ی نوبت‌ها'], ['/admin/waitlist', 'hourglass', 'صف‌های انتظار'],
    ['مدیریت اطلاعات'], ['/admin/doctors', 'stethoscope', 'پزشکان'], ['/admin/users', 'users', 'کاربران'], ['/admin/specialties', 'award', 'تخصص‌ها'], ['/admin/centers', 'building', 'مراکز درمانی'], ['/admin/reviews', 'star', 'نظرات'],
    ['سیستم'], ['/admin/tickets', 'headset', 'تیکت‌های پشتیبانی'], ['/admin/sms', 'message', 'پیامک‌های ارسالی'], ['/admin/logs', 'activity', 'گزارش فعالیت‌ها'], ['/admin/settings', 'sliders', 'تنظیمات سامانه']]
};

export function PanelLayout({ path, title, children }) {
  const { user, logout } = useApp();
  const [open, setOpen] = useState(false);
  const menu = MENUS[user.role];
  // فعال‌ترین آیتم: طولانی‌ترین مسیر منطبق
  const active = menu.filter(m => m.length > 1 && (path === m[0] || path.startsWith(m[0] + '/'))).sort((a, b) => b[0].length - a[0].length)[0]?.[0];
  return (
    <div className="panel">
      <aside className={`sidebar ${open ? 'open' : ''}`} onClick={e => e.target.closest('a') && setOpen(false)}>
        <Logo sub={'پنل ' + ROLE_LABEL[user.role]} />
        <div className="side-user"><Avatar name={user.name} size="sm" /><div className="grow"><b className="ellipsis">{user.name}</b><small>{user.doctor ? user.doctor.specialty : ROLE_LABEL[user.role]}</small></div></div>
        <nav>{menu.map((m, i) => m.length === 1 ? <div key={i} className="side-title">{m[0]}</div> :
          <a key={m[0]} href={'#' + m[0]} className={`side-link ${active === m[0] ? 'active' : ''}`}><Icon name={m[1]} /><span>{m[2]}</span>{m[3] && <span className={`badge ${user.unread ? '' : 'hidden'}`}>{fa(user.unread || 0)}</span>}</a>)}</nav>
        <div className="side-foot">
          <a href="#/" className="side-link"><Icon name="home" /><span>مشاهده‌ی سایت</span></a>
          <a href="#/display/1" className="side-link" target="_blank"><Icon name="tv" /><span>نمایشگر سالن انتظار</span></a>
          <a className="side-link" onClick={logout} style={{ cursor: 'pointer' }}><Icon name="logout" /><span>خروج از حساب</span></a>
        </div>
      </aside>
      <div className="main">
        <div className="main-top">
          <button className="icon-btn burger" onClick={() => setOpen(o => !o)}><Icon name="menu" /></button>
          <h2>{title}</h2>
          <div className="top-actions"><span className="small muted" style={{ whiteSpace: 'nowrap' }} id="today-label">{J.nowJalaliText()}</span><ThemeButton /><UserChip /></div>
        </div>
        <div className="main-body" id="view">{children}</div>
      </div>
    </div>
  );
}

export const BareLayout = ({ children }) => <div id="view">{children}</div>;
