// ریشه‌ی برنامه: جدول مسیرها، کنترل دسترسی نقش‌محور و انتخاب قالب
import { Component, useEffect } from 'react';
import { AppProvider, useApp } from './lib/app.jsx';
import { useLocation, match, navigate } from './lib/router.js';
import { homeFor } from './lib/format.js';
import { Loader, Empty } from './components/ui.jsx';
import { ToastHost, ModalHost } from './components/overlay.jsx';
import { PublicLayout, PanelLayout, BareLayout } from './layouts/Layouts.jsx';

import Home from './pages/public/Home.jsx';
import Search from './pages/public/Search.jsx';
import DoctorProfile from './pages/public/DoctorProfile.jsx';
import { Centers, CenterDetail } from './pages/public/Centers.jsx';
import Track from './pages/public/Track.jsx';
import About from './pages/public/About.jsx';
import { Login, Register } from './pages/public/Auth.jsx';
import Display from './pages/public/Display.jsx';
import * as Patient from './pages/patient/PatientPages.jsx';
import { Notifications, Profile } from './pages/patient/Account.jsx';
import * as Doctor from './pages/doctor/DoctorPages.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import * as AdminM from './pages/admin/AdminManage.jsx';
import * as AdminS from './pages/admin/AdminSystem.jsx';

const NotFound = () => <div className="container"><Empty title="صفحه‌ی مورد نظر یافت نشد (۴۰۴)" text="ممکن است آدرس اشتباه وارد شده باشد." icon="alert"><a href="#/" className="btn">بازگشت به خانه</a></Empty></div>;

const P = { layout: 'panel', roles: ['patient'] };
const D = { layout: 'panel', roles: ['doctor'] };
const A = { layout: 'panel', roles: ['admin'] };
/** جدول مسیرها: [مسیر، کامپوننت، عنوان، تنظیمات] */
const ROUTES = [
  ['/', Home, ''],
  ['/search', Search, 'جست‌وجوی پزشک'],
  ['/doctor/:id', DoctorProfile, 'پروفایل پزشک'],
  ['/centers', Centers, 'مراکز درمانی'],
  ['/center/:id', CenterDetail, 'مرکز درمانی'],
  ['/track', Track, 'پیگیری نوبت'],
  ['/about', About, 'درباره‌ی سامانه'],
  ['/login', Login, 'ورود', { layout: 'bare' }],
  ['/register', Register, 'ثبت‌نام', { layout: 'bare' }],
  ['/display/:id', Display, 'نمایشگر سالن انتظار', { layout: 'bare' }],

  ['/panel', Patient.Dashboard, 'داشبورد', P],
  ['/panel/appointments', Patient.Appointments, 'نوبت‌های من', P],
  ['/panel/waitlist', Patient.Waitlist, 'صف انتظار', P],
  ['/panel/records', Patient.Records, 'پرونده‌ی سلامت', P],
  ['/panel/notifications', Notifications, 'اعلان‌ها', P],
  ['/panel/support', Patient.Support, 'پشتیبانی', P],
  ['/panel/profile', Profile, 'پروفایل', P],

  ['/dr', Doctor.Dashboard, 'داشبورد پزشک', D],
  ['/dr/queue', Doctor.Queue, 'صف زنده‌ی امروز', D],
  ['/dr/appointments', Doctor.Appointments, 'نوبت‌ها', D],
  ['/dr/schedule', Doctor.Schedule, 'برنامه‌ی کاری', D],
  ['/dr/waitlist', Doctor.Waitlist, 'صف انتظار', D],
  ['/dr/patients', Doctor.Patients, 'بیماران', D],
  ['/dr/reviews', Doctor.Reviews, 'نظرات', D],
  ['/dr/notifications', Notifications, 'اعلان‌ها', D],
  ['/dr/profile', Doctor.DoctorProfile, 'پروفایل پزشک', D],

  ['/admin', AdminDashboard, 'داشبورد مدیریتی', A],
  ['/admin/appointments', AdminM.Appointments, 'همه‌ی نوبت‌ها', A],
  ['/admin/doctors', AdminM.Doctors, 'پزشکان', A],
  ['/admin/users', AdminM.Users, 'کاربران', A],
  ['/admin/specialties', AdminM.Specialties, 'تخصص‌ها', A],
  ['/admin/centers', AdminM.Centers, 'مراکز درمانی', A],
  ['/admin/waitlist', AdminS.Waitlist, 'صف‌های انتظار', A],
  ['/admin/reviews', AdminS.Reviews, 'نظرات', A],
  ['/admin/tickets', AdminS.Tickets, 'پشتیبانی', A],
  ['/admin/sms', AdminS.Sms, 'پیامک‌ها', A],
  ['/admin/logs', AdminS.Logs, 'گزارش فعالیت‌ها', A],
  ['/admin/settings', AdminS.Settings, 'تنظیمات', A]
].map(([path, component, title, opts = {}]) => ({ path, component, title, layout: 'public', ...opts }));

/** مرز خطا: اگر صفحه‌ای هنگام رندر خطا بدهد، به‌جای صفحه‌ی سفید پیام نمایش داده می‌شود */
class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(e) { console.error(e); }
  render() {
    if (!this.state.error) return this.props.children;
    return <div className="container"><Empty title="خطا در نمایش صفحه" text={this.state.error.message} icon="alert"><button className="btn" onClick={() => location.reload()}>تلاش مجدد</button></Empty></div>;
  }
}

function Redirect({ to }) {
  useEffect(() => { navigate(to, true); }, [to]);
  return null;
}

function Router() {
  const { user, siteName } = useApp();
  const loc = useLocation();
  const m = match(ROUTES, loc.path);
  const route = m?.route;

  useEffect(() => {
    document.title = (route?.title ? route.title + ' | ' : '') + siteName + ' — نوبت‌دهی آنلاین پزشکان';
    window.scrollTo({ top: 0 });
  }, [loc.raw]); // eslint-disable-line react-hooks/exhaustive-deps

  if (route?.roles) {
    if (!user) return <Redirect to={'/login?next=' + encodeURIComponent(loc.path)} />;
    if (!route.roles.includes(user.role)) return <Redirect to={homeFor(user.role)} />;
  }
  const Page = route?.component || NotFound;
  // کلید = آدرس کامل؛ با هر ناوبری، صفحه از نو ساخته می‌شود
  const page = <ErrorBoundary key={loc.raw}><Page params={m?.params || {}} query={loc.query} path={loc.path} /></ErrorBoundary>;
  if (route?.layout === 'bare') return <BareLayout>{page}</BareLayout>;
  if (route?.layout === 'panel') return <PanelLayout path={loc.path} title={route.title}>{page}</PanelLayout>;
  return <PublicLayout path={loc.path}>{page}</PublicLayout>;
}

function Shell() {
  const { booted, bootError } = useApp();
  if (bootError) return <div className="empty" style={{ paddingTop: 120 }}><h4>سرور در دسترس نیست</h4><p>ابتدا سرور را با دستور <span className="kbd">npm start</span> اجرا کنید.</p></div>;
  if (!booted) return <div style={{ minHeight: '100vh' }}><Loader /></div>;
  return <><Router /><ModalHost /><ToastHost /></>;
}

export default function App() {
  return <AppProvider><Shell /></AppProvider>;
}
