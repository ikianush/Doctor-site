// بخش سیستم پنل مدیر: صف‌های انتظار، نظرات، تیکت‌ها، پیامک‌ها، گزارش فعالیت و تنظیمات
import { useState } from 'react';
import { useApp } from '../../lib/app.jsx';
import { get, post, put, auth } from '../../lib/api.js';
import * as J from '../../lib/jalali.js';
import { fa, formData } from '../../lib/format.js';
import { useAsync, useBusy } from '../../lib/hooks.js';
import { Icon, Avatar, Stars, StatusBadge, PrioBadge, Loader, Empty, AsyncButton, SubmitButton, Switch, Kpi } from '../../components/ui.jsx';
import { toast, confirmDialog } from '../../components/overlay.jsx';

const Table = ({ head, children, empty }) => (
  <div className="card"><div className="table-wrap"><table className="table">
    <thead><tr>{head.map(h => <th key={h}>{h}</th>)}</tr></thead>
    <tbody>{children.length ? children : <tr><td colSpan={head.length}>{empty}</td></tr>}</tbody>
  </table></div></div>
);

export function Waitlist() {
  const res = useAsync(() => get('/admin/waitlist'), []);
  if (!res.data) return <Loader />;
  const list = res.data;
  const st = s => list.filter(w => w.status === s).length;
  return <>
    <div className="page-head"><div><h1>صف‌های انتظار</h1><p>پایش عملکرد تخصیص خودکار ظرفیت</p></div></div>
    <div className="kpis mb3">
      <Kpi icon="hourglass" color="orange" value={fa(st('waiting'))} label="در انتظار" />
      <Kpi icon="check-circle" color="green" value={fa(st('promoted'))} label="نوبت خودکار گرفتند" />
      <Kpi icon="x-circle" color="red" value={fa(st('cancelled'))} label="انصراف" />
      <Kpi icon="clock" color="" value={fa(st('expired'))} label="منقضی" />
    </div>
    <Table head={['بیمار', 'پزشک', 'تاریخ', 'اولویت', 'امتیاز', 'جایگاه', 'وضعیت', 'ثبت']} empty={<Empty title="موردی نیست" icon="hourglass" />}>
      {list.map(w => <tr key={w.id}><td className="small"><b>{w.patientName}</b></td><td className="small">{w.doctorName}</td><td className="small">{J.withDay(w.date)}</td>
        <td><PrioBadge p={w.priority} fallback={<span className="xs muted">عادی</span>} /></td><td>{fa(w.score)}</td><td>{w.position ? fa(w.position) : '—'}</td><td><StatusBadge status={w.status} /></td><td className="xs muted">{J.ago(w.createdAt)}</td></tr>)}
    </Table>
  </>;
}

export function Reviews() {
  const res = useAsync(() => get('/admin/reviews'), []);
  if (!res.data) return <Loader />;
  const toggle = async (r, on) => {
    res.setData(l => l.map(x => (x.id === r.id ? { ...x, approved: on } : x)));
    await put('/admin/reviews/' + r.id, { approved: on });
    toast(on ? 'نظر نمایش داده می‌شود.' : 'نظر پنهان شد.', 'success');
  };
  return <>
    <div className="page-head"><div><h1>مدیریت نظرات</h1><p>تأیید یا پنهان‌سازی نظرات بیماران</p></div></div>
    <Table head={['بیمار', 'پزشک', 'امتیاز', 'نظر', 'تاریخ', 'نمایش']} empty={<Empty title="نظری ثبت نشده" icon="star" />}>
      {res.data.map(r => <tr key={r.id}><td className="small"><b>{r.patientName}</b></td><td className="small">{r.doctorName}</td><td><Stars value={r.rating} /></td>
        <td className="small" style={{ maxWidth: 340 }}>{r.comment || '—'}</td><td className="xs muted">{J.ago(r.createdAt)}</td>
        <td><Switch checked={r.approved !== false} onChange={e => toggle(r, e.target.checked)} /></td></tr>)}
    </Table>
  </>;
}

export function Tickets() {
  const res = useAsync(() => get('/admin/tickets'), []);
  const [answers, setAnswers] = useState({});
  if (!res.data) return <Loader />;
  const list = res.data;
  const answer = async id => {
    const v = (answers[id] || '').trim();
    if (!v) return;
    await post(`/admin/tickets/${id}/answer`, { answer: v });
    toast('پاسخ ارسال شد و به کاربر اطلاع داده شد.', 'success');
    res.reload({ silent: true });
  };
  return <>
    <div className="page-head"><div><h1>تیکت‌های پشتیبانی</h1><p>{fa(list.filter(t => t.status === 'open').length)} تیکت باز</p></div></div>
    <div className="col">{list.length ? list.map(t => (
      <div key={t.id} className="card pad">
        <div className="row between"><div className="row"><Avatar name={t.userName || '?'} size="sm" /><div><b>{t.subject}</b><div className="xs muted">{t.userName} • {J.ago(t.createdAt)}</div></div></div><StatusBadge status={t.status} /></div>
        <p className="small t2 mt1">{t.body}</p>
        {t.answer ? <div className="review"><div className="reply"><b>پاسخ:</b> {t.answer}</div></div>
          : <div className="row mt1"><input className="input sm grow" placeholder="پاسخ..." value={answers[t.id] || ''} onChange={e => setAnswers(x => ({ ...x, [t.id]: e.target.value }))} />
            <AsyncButton className="btn sm" onClick={() => answer(t.id)}><Icon name="send" size="sm" /> ارسال پاسخ</AsyncButton></div>}
      </div>)) : <div className="card"><Empty title="تیکتی وجود ندارد" icon="headset" /></div>}</div>
  </>;
}

const SMS_KIND = { booking: ['رزرو', 'blue'], reminder: ['یادآوری', 'orange'], cancel: ['لغو', 'red'], waitlist: ['صف انتظار', 'purple'], otp: ['کد ورود', 'teal'], auth: ['حساب', 'cyan'], info: ['اطلاع‌رسانی', ''] };
export function Sms() {
  const res = useAsync(() => get('/admin/sms'), []);
  if (!res.data) return <Loader />;
  return <>
    <div className="page-head"><div><h1>پیامک‌های ارسالی</h1><p>شبیه‌ساز درگاه پیامک — {fa(res.data.length)} پیام اخیر</p></div></div>
    <div className="alert info mb3"><Icon name="info" /><div>در محیط عملیاتی، این پیام‌ها از طریق وب‌سرویس سامانه‌ی پیامکی (مانند کاوه‌نگار یا ملی‌پیامک) ارسال می‌شوند. در این نسخه، ارسال شبیه‌سازی و در این جدول ثبت می‌شود.</div></div>
    <Table head={['گیرنده', 'نوع', 'متن پیام', 'زمان']} empty={<Empty title="پیامکی ارسال نشده" icon="message" />}>
      {res.data.map((s, i) => <tr key={s.id ?? i}><td><b className="small">{s.userName || ''}</b><div className="xs muted">{fa(s.mobile)}</div></td>
        <td><span className={`badge ${SMS_KIND[s.kind]?.[1] || ''}`}>{SMS_KIND[s.kind]?.[0] || s.kind}</span></td>
        <td className="small" style={{ maxWidth: 520 }}>{s.text}</td><td className="xs muted">{J.dateTime(s.at)}</td></tr>)}
    </Table>
  </>;
}

const LOG_LABEL = { 'auth.login': 'ورود به سیستم', 'appointment.book': 'ثبت نوبت', 'appointment.cancel': 'لغو نوبت', 'appointment.reschedule': 'جابه‌جایی نوبت', 'waitlist.join': 'عضویت در صف انتظار', 'waitlist.promote': 'تخصیص خودکار از صف', 'queue.next': 'فراخوانی بیمار', 'schedule.create': 'ایجاد شیفت', 'leave.create': 'ثبت مرخصی', 'settings.update': 'تغییر تنظیمات', 'system.seed': 'بارگذاری داده‌ی نمایشی', 'doctor.create': 'افزودن پزشک', 'doctor.update': 'ویرایش پزشک', 'user.create': 'افزودن کاربر', 'user.update': 'ویرایش کاربر', 'auth.password': 'تغییر رمز' };
export function Logs() {
  const res = useAsync(() => get('/admin/logs'), []);
  if (!res.data) return <Loader />;
  return <>
    <div className="page-head"><div><h1>گزارش فعالیت‌ها (Audit Log)</h1><p>ثبت رویدادهای مهم سامانه برای ردیابی و امنیت</p></div></div>
    <Table head={['زمان', 'کاربر', 'رویداد', 'جزئیات']} empty={<Empty title="رویدادی ثبت نشده" icon="activity" />}>
      {res.data.map((l, i) => <tr key={l.id ?? i}><td className="xs muted" style={{ whiteSpace: 'nowrap' }}>{J.dateTime(l.at)}</td><td className="small"><b>{l.userName || 'سیستم'}</b></td>
        <td><span className="badge blue">{LOG_LABEL[l.action] || l.action}</span></td><td className="small t2">{fa(l.detail)}</td></tr>)}
    </Table>
  </>;
}

export function Settings() {
  const { refreshMeta } = useApp();
  const res = useAsync(() => get('/admin/settings'), []);
  const [busy, run] = useBusy();
  if (!res.data) return <Loader />;
  const s = res.data;
  const save = e => {
    e.preventDefault();
    const d = formData(e.target);
    run(async () => { try { await put('/admin/settings', d); await refreshMeta(); toast('تنظیمات ذخیره شد.', 'success'); } catch (err) { toast(err.message, 'error'); } });
  };
  const reset = async () => {
    if (!await confirmDialog('تمام داده‌ها (نوبت‌ها، کاربران جدید و...) حذف و داده‌ی نمایشی تازه ساخته می‌شود. ادامه می‌دهید؟', { danger: true, ok: 'بله، بازسازی کن' })) return;
    const r = await post('/admin/reset-demo');
    toast(`داده‌ها بازسازی شد: ${fa(r.appointments)} نوبت. لطفاً دوباره وارد شوید.`, 'success');
    setTimeout(() => { auth.set(null); location.hash = '#/login'; location.reload(); }, 1500);
  };
  const num = (name, label) => <div key={name} className="field"><label>{label}</label><input className="input ltr" type="number" name={name} defaultValue={s[name]} /></div>;
  const toggle = (name, title, hint) => <label key={name} className="row between"><span><b className="small">{title}</b><div className="xs muted">{hint}</div></span><Switch name={name} defaultChecked={!!s[name]} /></label>;
  return <>
    <div className="page-head"><div><h1>تنظیمات سامانه</h1><p>قوانین نوبت‌دهی، یادآوری و صف انتظار</p></div></div>
    <form className="grid" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'start' }} onSubmit={save}>
      <div className="card"><div className="card-h"><h3><Icon name="calendar" /> قوانین نوبت‌دهی</h3></div><div className="card-b col" style={{ gap: 16 }}>
        <div className="field"><label>نام سامانه</label><input className="input" name="siteName" defaultValue={s.siteName} /></div>
        <div className="field"><label>تلفن پشتیبانی</label><input className="input" name="supportPhone" defaultValue={s.supportPhone} /></div>
        {num('bookingWindowDays', 'بازه‌ی مجاز رزرو (روز آینده)')}
        {num('cancelDeadlineHours', 'مهلت لغو / جابه‌جایی (ساعت قبل از نوبت)')}
        {num('maxActivePerPatient', 'حداکثر نوبت فعال هم‌زمان برای هر بیمار')}
      </div></div>
      <div className="col" style={{ gap: 18 }}>
        <div className="card"><div className="card-h"><h3><Icon name="bell" /> یادآوری و صف انتظار</h3></div><div className="card-b col" style={{ gap: 16 }}>
          {num('reminderHours', 'یادآوری اول (ساعت قبل)')}
          {num('secondReminderHours', 'یادآوری دوم (ساعت قبل)')}
          {toggle('waitlistAutoBook', 'رزرو خودکار از صف انتظار', 'در صورت غیرفعال بودن، فقط به بیماران اطلاع داده می‌شود.')}
          {toggle('maintenance', 'حالت تعمیر و نگهداری', 'ثبت تغییرات برای غیر از مدیران غیرفعال می‌شود.')}
        </div></div>
        <SubmitButton busy={busy} className="btn lg"><Icon name="check" /> ذخیره‌ی تنظیمات</SubmitButton>
        <div className="card pad" style={{ borderColor: 'var(--danger)' }}><div className="row"><Icon name="database" /><b>بازسازی داده‌های نمایشی</b></div>
          <p className="small t2 mt1">همه‌ی داده‌ها حذف و داده‌ی نمایشی جدید (نسبت به تاریخ امروز) ساخته می‌شود. مناسب پیش از ارائه‌ی پروژه.</p>
          <AsyncButton className="btn danger-soft mt1" onClick={reset}><Icon name="refresh" size="sm" /> بازسازی داده‌ها</AsyncButton></div>
      </div>
    </form>
  </>;
}
