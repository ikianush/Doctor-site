// داشبورد مدیریتی با نمودارها و شاخص‌های کلیدی
import { get, post, auth } from '../../lib/api.js';
import { useApp } from '../../lib/app.jsx';
import * as J from '../../lib/jalali.js';
import { fa, num, pct, STATUS } from '../../lib/format.js';
import { useAsync } from '../../lib/hooks.js';
import { Icon, Avatar, RatingPill, StatusBadge, Loader, ErrorBox, AsyncButton, Kpi } from '../../components/ui.jsx';
import { toast } from '../../components/overlay.jsx';
import { BarChart, LineChart, Donut, HBars } from '../../components/charts.jsx';

/** دانلود خروجی CSV نوبت‌ها (قابل باز شدن در اکسل) */
export async function exportCsv() {
  const r = await fetch('/api/admin/export', { headers: { Authorization: 'Bearer ' + auth.token } });
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement('a');
  a.href = url; a.download = `noban-appointments-${J.en(J.short(J.ymd())).replace(/\//g, '-')}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('فایل CSV (قابل باز شدن در اکسل) دانلود شد.', 'success');
}

const STATUS_COLORS = { booked: '#2563eb', checked_in: '#7c3aed', in_visit: '#0fb5a6', done: '#16a34a', cancelled: '#ef4444', no_show: '#f59e0b' };
const PALETTE = ['#2563eb', '#0fb5a6', '#7c3aed', '#f59e0b', '#ef4444', '#14b8a6'];
const Card = ({ icon, title, extra, children }) => <div className="card"><div className="card-h"><h3><Icon name={icon} /> {title}</h3>{extra}</div><div className="card-b">{children}</div></div>;

export default function AdminDashboard() {
  const { meta } = useApp();
  const res = useAsync(() => get('/admin/stats'), []);
  if (res.error) return <ErrorBox error={res.error} retry={res.reload} />;
  const s = res.data;
  if (!s) return <Loader />;
  const c = s.counts;
  const lbl = s.days.map(x => fa(J.jOf(x.date).jd) + ' ' + J.MONTHS[J.jOf(x.date).jm - 1].slice(0, 3));
  const hrs = s.hours.map((v, h) => ({ h, v })).filter(x => x.h >= 7 && x.h <= 21);
  const reminders = async () => { const r = await post('/admin/run-reminders'); toast(`${fa(r.sent)} پیامک یادآوری جدید ارسال شد.`, 'success'); };
  return <>
    <div className="page-head"><div><h1>داشبورد مدیریتی</h1><p>نمای کلی عملکرد سامانه — {J.withDay(J.ymd(), true)} • پایگاه‌داده: {{ redis: 'Redis (Upstash)', file: 'فایل JSON', temporary: 'موقت' }[meta.storage] || '—'}</p></div>
      <div className="row"><AsyncButton className="btn ghost" onClick={reminders}><Icon name="bell" size="sm" /> اجرای یادآوری‌ها</AsyncButton><AsyncButton className="btn" onClick={exportCsv}><Icon name="download" size="sm" /> خروجی اکسل نوبت‌ها</AsyncButton></div></div>
    {meta.storage === 'temporary' && <div className="alert warn mb3"><Icon name="database" /><div><b>پایگاه‌داده‌ی دائمی وصل نیست</b><p>سامانه روی سرور ابری (Vercel) اجرا شده ولی Redis تنظیم نشده؛ داده‌ها موقت هستند و ممکن است پاک شوند. از تب Storage در Vercel یک پایگاه Upstash Redis بسازید و به پروژه وصل کنید، سپس دوباره Deploy کنید.</p></div></div>}
    <div className="kpis">
      <Kpi icon="calendar" color="blue" value={num(c.today)} label="نوبت امروز" sub={`${num(c.upcoming)} نوبت آینده`} />
      <Kpi icon="users" color="purple" value={num(c.patients)} label="بیمار ثبت‌نامی" sub={`${num(c.users)} کاربر کل`} />
      <Kpi icon="stethoscope" color="teal" value={num(c.doctors)} label="پزشک فعال" sub={`${num(c.centers)} مرکز • ${num(c.specialties)} تخصص`} />
      <Kpi icon="percent" color="green" value={pct(s.occupancy)} label="اشغال ظرفیت هفته" sub="بر اساس شیفت‌های تعریف‌شده" />
    </div>
    <div className="kpis mt2">
      <Kpi compact icon="x-circle" color="red" value={pct(s.cancelRate)} label="نرخ لغو نوبت" />
      <Kpi compact icon="alert" color="orange" value={pct(s.noShowRate)} label="نرخ عدم مراجعه" />
      <Kpi compact icon="hourglass" color="purple" value={num(c.waitlist)} label={`در صف انتظار (${num(c.promoted)} تخصیص خودکار)`} />
      <Kpi compact icon="message" color="cyan" value={num(c.sms)} label="پیامک ارسال‌شده" />
    </div>
    <div className="grid mt3" style={{ gridTemplateColumns: '1.8fr 1fr' }}>
      <Card icon="trend" title="روند نوبت‌ها (۲۸ روز)"><LineChart labels={lbl} series={[
        { name: 'نوبت فعال', color: '#2563eb', values: s.days.map(x => x.total) }, { name: 'انجام شده', color: '#16a34a', values: s.days.map(x => x.done) },
        { name: 'لغو شده', color: '#ef4444', values: s.days.map(x => x.cancelled), area: false, dash: true }]} /></Card>
      <Card icon="activity" title="وضعیت نوبت‌ها"><Donut size={160} center={num(c.appointments)} sub="کل نوبت‌ها" items={Object.entries(s.status).map(([k, v]) => ({ label: STATUS[k]?.[0] || k, value: v, color: STATUS_COLORS[k] }))} /></Card>
    </div>
    <div className="grid mt3 g3">
      <Card icon="award" title="نوبت بر اساس تخصص"><HBars items={s.bySpec.slice(0, 7).map(x => ({ label: x.name, value: x.count }))} /></Card>
      <Card icon="building" title="سهم مراکز درمانی"><Donut size={140} center={fa(s.byCenter.length)} sub="مرکز" items={s.byCenter.map((x, i) => ({ label: x.name, value: x.count, color: PALETTE[i % PALETTE.length] }))} /></Card>
      <Card icon="clock" title="ساعات اوج مراجعه"><BarChart height={200} labels={hrs.map(x => fa(x.h))} series={[{ name: 'نوبت', color: '#7c3aed', values: hrs.map(x => x.v) }]} /></Card>
    </div>
    <div className="grid mt3" style={{ gridTemplateColumns: '1.3fr 1fr' }}>
      <div className="card"><div className="card-h"><h3><Icon name="star" /> پزشکان برتر</h3><a href="#/admin/doctors" className="small" style={{ color: 'var(--primary)' }}>مدیریت پزشکان</a></div>
        <div className="table-wrap"><table className="table"><thead><tr><th>پزشک</th><th>ویزیت</th><th>امتیاز</th><th>اشغال هفته</th></tr></thead><tbody>
          {s.topDoctors.map(d => (
            <tr key={d.id ?? d.name}><td><div className="row"><Avatar name={d.name} size="sm" /><div><b className="small">{d.name}</b><div className="xs muted">{d.specialty}</div></div></div></td>
              <td>{num(d.visits)}</td><td><RatingPill rating={d.rating} /></td>
              <td style={{ minWidth: 120 }}><div className="row small"><div className="bar blue grow"><i style={{ width: `${d.occupancy}%` }} /></div>{pct(d.occupancy)}</div></td></tr>))}
        </tbody></table></div></div>
      <div className="card"><div className="card-h"><h3><Icon name="list" /> آخرین نوبت‌های ثبت‌شده</h3></div>
        {s.recent.map(a => <div key={a.id} className="queue-item"><div className="turn" style={{ fontSize: 12 }}>{fa(a.time)}</div><div className="grow"><b className="small">{a.patient?.name}</b><div className="xs muted">{a.doctorName} • {J.relative(a.date)}</div></div><StatusBadge status={a.status} /></div>)}
      </div>
    </div>
  </>;
}
