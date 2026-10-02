// پنل بیمار: داشبورد، نوبت‌ها، صف انتظار، پرونده‌ی سلامت، پشتیبانی
import { useState } from 'react';
import { useApp } from '../../lib/app.jsx';
import { get, post, del } from '../../lib/api.js';
import * as J from '../../lib/jalali.js';
import { fa, formData } from '../../lib/format.js';
import { useAsync, useBusy, useInterval } from '../../lib/hooks.js';
import { Icon, Avatar, StatusBadge, PrioBadge, Loader, Empty, ErrorBox, AsyncButton, SubmitButton, Kpi } from '../../components/ui.jsx';
import { toast, confirmDialog } from '../../components/overlay.jsx';
import { QueueLive } from '../../components/shared.jsx';
import { NotifItem } from '../../layouts/Layouts.jsx';
import { ApptCard, apptActions, countdown, ACTIVE } from './ApptCard.jsx';

const TIPS = ['روزانه حداقل ۸ لیوان آب بنوشید و ۳۰ دقیقه پیاده‌روی کنید.', 'چکاپ سالانه‌ی فشار خون و قند خون را پس از ۴۰ سالگی فراموش نکنید.', 'خواب کافی (۷ تا ۸ ساعت) نقش مهمی در تقویت سیستم ایمنی دارد.', 'مصرف نمک و قند افزوده را کاهش دهید تا سلامت قلب حفظ شود.'];
const byTime = (a, b) => (a.date + a.time).localeCompare(b.date + b.time);

/* ---------------- داشبورد ---------------- */
export function Dashboard() {
  const { user } = useApp();
  const res = useAsync(() => Promise.all([get('/my/appointments'), get('/my/waitlist'), get('/notifications')]), []);
  useInterval(() => res.reload({ silent: true }), 30000);
  if (res.error) return <ErrorBox error={res.error} retry={res.reload} />;
  if (!res.data) return <Loader />;
  const [appts, wl, notifs] = res.data;
  const reload = () => res.reload({ silent: true });
  const upcoming = appts.filter(a => ACTIVE.includes(a.status)).sort(byTime);
  const next = upcoming[0];
  const h = new Date().getHours();
  const greet = h < 12 ? 'صبح بخیر' : h < 17 ? 'روز بخیر' : 'عصر بخیر';
  const act = next && apptActions(next, reload);
  return <>
    <div className="welcome"><div className="hero-pattern" />
      <div style={{ position: 'relative' }}><h2>{greet}، {user.name.split(' ')[0]} عزیز 👋</h2>
        <p>{next ? `نوبت بعدی شما ${J.relative(next.date)} ساعت ${fa(next.time)} نزد ${next.doctorName} است.` : 'در حال حاضر نوبت فعالی ندارید. همین حالا پزشک خود را پیدا کنید.'}</p></div>
      <a href="#/search" className="btn white" style={{ position: 'relative' }}><Icon name="plus" size="sm" /> رزرو نوبت جدید</a>
    </div>
    <div className="kpis mt3">
      <Kpi icon="calendar" color="blue" value={fa(upcoming.length)} label="نوبت پیش رو" />
      <Kpi icon="check-circle" color="green" value={fa(appts.filter(a => a.status === 'done').length)} label="ویزیت انجام‌شده" />
      <Kpi icon="hourglass" color="purple" value={fa(wl.filter(w => w.status === 'waiting').length)} label="در صف انتظار" />
      <Kpi icon="bell" color="orange" value={fa(notifs.filter(n => !n.read).length)} label="اعلان خوانده‌نشده" />
    </div>
    <div className="grid mt3" style={{ gridTemplateColumns: '1.6fr 1fr', alignItems: 'start' }}>
      <div className="col" style={{ gap: 18 }}>
        {next ? <div className="card"><div className="card-h"><h3><Icon name="zap" /> نوبت بعدی شما</h3><span className="badge blue">{countdown(next)}</span></div><div className="card-b">
          <div className="row top wrap" style={{ gap: 18 }}><Avatar name={next.doctorName} size="lg" />
            <div className="grow"><h3>{next.doctorName}</h3><div className="small t2">{next.specialty}</div>
              <div className="row wrap mt1 small" style={{ gap: 16 }}><span><Icon name="calendar" size="sm" /> {J.withDay(next.date, true)}</span><span><Icon name="clock" size="sm" /> ساعت {fa(next.time)}</span><span><Icon name="pin" size="sm" /> {next.centerName}</span></div>
              {next.queue && <QueueLive q={next.queue} />}</div></div>
          <div className="row wrap mt2">
            {next.canCheckin && <AsyncButton className="btn success sm" onClick={act.checkin}><Icon name="door" size="sm" /> رسیدم (پذیرش آنلاین)</AsyncButton>}
            <button className="btn soft sm" onClick={act.ticket}><Icon name="ticket" size="sm" /> نمایش رسید</button>
            <button className="btn ghost sm" onClick={act.ics}><Icon name="download" size="sm" /> افزودن به تقویم</button>
            <a href="#/panel/appointments" className="btn ghost sm">مدیریت نوبت</a>
          </div>
        </div></div>
          : <div className="card"><Empty title="نوبت فعالی ندارید" text="پزشک مورد نظر خود را جست‌وجو کرده و در کمتر از یک دقیقه نوبت بگیرید." icon="calendar"><a href="#/search" className="btn">جست‌وجوی پزشک</a></Empty></div>}
        <div className="card"><div className="card-h"><h3><Icon name="calendar" /> نوبت‌های پیش رو</h3><a href="#/panel/appointments" className="small" style={{ color: 'var(--primary)' }}>همه</a></div>
          {upcoming.length > 1 ? upcoming.slice(1, 4).map(a => (
            <div key={a.id} className="queue-item">
              <div className="turn" style={{ background: 'var(--primary-50)', color: 'var(--primary)', flexDirection: 'column', lineHeight: 1.2, width: 52, height: 52 }}><b>{J.monthDay(a.date).day}</b><small className="xs">{J.monthDay(a.date).month}</small></div>
              <div className="grow"><b className="small">{a.doctorName}</b><div className="xs muted">{J.withDay(a.date)} • ساعت {fa(a.time)}</div></div><StatusBadge status={a.status} />
            </div>)) : <div className="card-b small muted">نوبت دیگری ندارید.</div>}
        </div>
      </div>
      <div className="col" style={{ gap: 18 }}>
        <div className="card"><div className="card-h"><h3><Icon name="bell" /> آخرین اعلان‌ها</h3><a href="#/panel/notifications" className="small" style={{ color: 'var(--primary)' }}>همه</a></div>
          {notifs.length ? notifs.slice(0, 4).map(n => <NotifItem key={n.id} n={n} />) : <div className="card-b muted small">اعلانی ندارید</div>}</div>
        <div className="card pad"><h3 style={{ fontSize: 15 }} className="mb2"><Icon name="heart" /> نکته‌ی سلامت امروز</h3><p className="small t2">{TIPS[new Date().getDate() % 4]}</p></div>
      </div>
    </div>
  </>;
}

/* ---------------- نوبت‌های من ---------------- */
const GROUPS = {
  upcoming: ['پیش رو', a => ACTIVE.includes(a.status)],
  past: ['انجام‌شده', a => ['done', 'no_show'].includes(a.status)],
  cancelled: ['لغو شده', a => a.status === 'cancelled']
};
export function Appointments({ query }) {
  const [tab, setTab] = useState(query.tab || 'upcoming');
  const res = useAsync(() => get('/my/appointments'), []);
  useInterval(() => res.reload({ silent: true }), 20000);
  const reload = () => res.reload({ silent: true });
  const list = res.data || [];
  let items = list.filter(GROUPS[tab][1]);
  if (tab === 'upcoming') items = items.sort(byTime);
  return <>
    <div className="page-head"><div><h1>نوبت‌های من</h1><p>مدیریت، لغو، جابه‌جایی و پیگیری زنده‌ی نوبت‌ها</p></div><a href="#/search" className="btn"><Icon name="plus" size="sm" /> نوبت جدید</a></div>
    <div className="tabs mb2">{Object.entries(GROUPS).map(([k, [l, f]]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l} <span className="badge">{fa(list.filter(f).length)}</span></button>)}</div>
    <div className="col" style={{ gap: 14 }}>
      {res.error ? <ErrorBox error={res.error} retry={res.reload} /> : !res.data ? <Loader />
        : items.length ? items.map(a => <ApptCard key={a.id} a={a} reload={reload} />)
          : <Empty title="نوبتی در این بخش وجود ندارد" icon="calendar">{tab === 'upcoming' && <a href="#/search" className="btn">رزرو نوبت</a>}</Empty>}
    </div>
  </>;
}

/* ---------------- صف انتظار ---------------- */
export function Waitlist() {
  const res = useAsync(() => get('/my/waitlist'), []);
  const leave = async id => {
    if (!await confirmDialog('از صف انتظار خارج می‌شوید؟', { danger: true, ok: 'خروج' })) return;
    await del('/waitlist/' + id); toast('از صف انتظار خارج شدید.', 'success'); res.reload({ silent: true });
  };
  if (!res.data) return <Loader />;
  return <>
    <div className="page-head"><div><h1>صف انتظار</h1><p>با آزاد شدن ظرفیت، نوبت به‌صورت خودکار برای شما رزرو می‌شود.</p></div></div>
    <div className="alert info mb3"><Icon name="info" /><div><b>صف انتظار هوشمند چگونه کار می‌کند؟</b><p>هر زمان بیماری نوبت خود را لغو کند، سیستم افراد صف را بر اساس «امتیاز اولویت پزشکی» (اورژانسی ۱۰۰، معلولیت ۶۰، بارداری ۵۰، سالمند ۴۰) و سپس «زمان ثبت» مرتب کرده و اولین فردی را که تداخل زمانی ندارد به‌صورت خودکار رزرو می‌کند.</p></div></div>
    <div className="card"><div className="table-wrap"><table className="table">
      <thead><tr><th>پزشک</th><th>تاریخ</th><th>اولویت</th><th>جایگاه</th><th>وضعیت</th><th>زمان ثبت</th><th></th></tr></thead>
      <tbody>{res.data.length ? res.data.map(w => (
        <tr key={w.id}>
          <td><div className="row"><Avatar name={w.doctorName} size="sm" /><div><b className="small">{w.doctorName}</b><div className="xs muted">{w.specialty || ''}</div></div></div></td>
          <td>{J.withDay(w.date)}{w.fromTime && <div className="xs muted">{fa(w.fromTime)} تا {fa(w.toTime || '—')}</div>}</td>
          <td><PrioBadge p={w.priority} fallback={<span className="muted small">عادی</span>} /></td>
          <td>{w.position ? <b style={{ fontSize: 18, color: 'var(--primary)' }}>{fa(w.position)}</b> : '—'}</td>
          <td><StatusBadge status={w.status} /></td><td className="small muted">{J.ago(w.createdAt)}</td>
          <td className="actions">{w.status === 'waiting' ? <button className="btn xs danger-soft" onClick={() => leave(w.id)}>خروج از صف</button> : w.status === 'promoted' ? <a href="#/panel/appointments" className="btn xs soft">مشاهده‌ی نوبت</a> : null}</td>
        </tr>)) : <tr><td colSpan={7}><Empty title="در صف انتظاری عضو نیستید" text="زمانی که ظرفیت یک روز تکمیل باشد، می‌توانید در صف انتظار آن ثبت‌نام کنید." icon="hourglass" /></td></tr>}</tbody>
    </table></div></div>
  </>;
}

/* ---------------- پرونده‌ی سلامت ---------------- */
export function Records() {
  const { user: u } = useApp();
  const res = useAsync(() => get('/my/appointments'), []);
  if (!res.data) return <Loader />;
  const list = res.data.filter(a => a.status === 'done');
  const Row = ({ l, v, ltr }) => <div className="row between"><span className="muted">{l}</span><b className={ltr ? 'ltr' : ''}>{v}</b></div>;
  return <>
    <div className="page-head"><div><h1>پرونده‌ی سلامت</h1><p>سوابق ویزیت، تشخیص‌ها و نسخه‌های الکترونیک</p></div><button className="btn ghost" onClick={() => window.print()}><Icon name="printer" size="sm" /> چاپ پرونده</button></div>
    <div className="grid print-area" style={{ gridTemplateColumns: '300px 1fr', alignItems: 'start' }}>
      <div className="card pad" style={{ textAlign: 'center' }}><Avatar name={u.name} size="lg" /><h3 className="mt1">{u.name}</h3><div className="small muted ltr">{fa(u.mobile)}</div>
        <div className="divider" />
        <div className="col small" style={{ textAlign: 'right', gap: 8 }}>
          <Row l="سن" v={u.birthYear ? fa(new Date().getFullYear() - u.birthYear) + ' سال' : '—'} />
          <Row l="گروه خونی" v={u.bloodType || '—'} ltr />
          <Row l="بیمه" v={u.insurance || 'آزاد'} />
          <Row l="حساسیت‌ها" v={u.allergies || 'ندارد'} />
          <Row l="تعداد ویزیت" v={fa(list.length)} />
        </div><a href="#/panel/profile" className="btn ghost sm block mt2 no-print">ویرایش اطلاعات پزشکی</a></div>
      <div className="card pad">{list.length ? <div className="timeline">{list.map(a => (
        <div key={a.id} className="tl-item">
          <div className="row between wrap"><div><b>{a.doctorName}</b> <span className="small muted">— {a.specialty}</span></div><span className="small muted">{J.withDay(a.date, true)}</span></div>
          {a.diagnosis && <div className="mt1 small"><span className="badge cyan">تشخیص</span> {a.diagnosis}</div>}
          {a.prescription?.length > 0 && <div className="mt1"><div className="small semi mb1"><Icon name="pill" size="sm" /> نسخه:</div><ul className="rx">{a.prescription.map((r, i) => <li key={i}><Icon name="pill" size="sm" />{r}</li>)}</ul></div>}
          {a.note && <p className="small t2 mt1"><Icon name="file" size="sm" /> {a.note}</p>}
          {a.followUp && <div className="mt1"><span className="badge orange"><Icon name="calendar" size="sm" /> مراجعه‌ی بعدی: {J.long(a.followUp)}</span></div>}
          {!a.diagnosis && !a.prescription?.length && !a.note && <p className="small muted">توضیحاتی ثبت نشده است.</p>}
        </div>))}</div> : <Empty title="هنوز سابقه‌ی ویزیتی ثبت نشده" text="پس از هر ویزیت، تشخیص و نسخه‌ی پزشک در اینجا نمایش داده می‌شود." icon="file" />}</div>
    </div>
  </>;
}

/* ---------------- پشتیبانی ---------------- */
export function Support() {
  const res = useAsync(() => get('/my/tickets'), []);
  const [busy, run] = useBusy();
  const submit = e => {
    e.preventDefault();
    const f = e.target;
    run(async () => { try { await post('/tickets', formData(f)); f.reset(); toast('تیکت شما ثبت شد. به‌زودی پاسخ داده می‌شود.', 'success'); res.reload({ silent: true }); } catch (err) { toast(err.message, 'error'); } });
  };
  return <>
    <div className="page-head"><div><h1>پشتیبانی</h1><p>سؤال یا مشکلی دارید؟ با ما در میان بگذارید.</p></div></div>
    <div className="grid" style={{ gridTemplateColumns: '1fr 1.3fr', alignItems: 'start' }}>
      <div className="card"><div className="card-h"><h3><Icon name="send" /> ارسال تیکت جدید</h3></div>
        <form className="card-b col" onSubmit={submit}>
          <div className="field"><label>موضوع</label><select className="select" name="subject">{['مشکل در رزرو نوبت', 'لغو یا بازپرداخت', 'عدم دریافت پیامک', 'پیشنهاد و انتقاد', 'سایر موارد'].map(s => <option key={s}>{s}</option>)}</select></div>
          <div className="field"><label>متن پیام</label><textarea className="textarea" name="body" required placeholder="توضیحات خود را بنویسید..." /></div>
          <SubmitButton busy={busy}><Icon name="send" size="sm" /> ارسال</SubmitButton>
        </form></div>
      <div className="col">{!res.data ? <Loader /> : res.data.length ? res.data.map(t => (
        <div key={t.id} className="card pad"><div className="row between"><b>{t.subject}</b><StatusBadge status={t.status} /></div><p className="small t2 mt1">{t.body}</p><div className="xs muted">{J.ago(t.createdAt)}</div>
          {t.answer && <div className="review"><div className="reply"><b>پاسخ پشتیبانی:</b> {t.answer}</div></div>}</div>))
        : <div className="card"><Empty title="تیکتی ثبت نکرده‌اید" icon="headset" /></div>}</div>
    </div>
  </>;
}
