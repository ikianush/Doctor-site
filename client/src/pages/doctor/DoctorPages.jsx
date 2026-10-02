// پنل پزشک: داشبورد، صف زنده، نوبت‌ها، برنامه‌ی کاری، صف انتظار، بیماران، نظرات، پروفایل
import { useEffect, useState } from 'react';
import { useApp } from '../../lib/app.jsx';
import { get, post, put } from '../../lib/api.js';
import * as J from '../../lib/jalali.js';
import { fa, pct, formData, splitList } from '../../lib/format.js';
import { useAsync, useBusy, useInterval } from '../../lib/hooks.js';
import { Icon, Avatar, Stars, StatusBadge, PrioBadge, Loader, Empty, ErrorBox, AsyncButton, SubmitButton, Switch, Kpi, Tabs } from '../../components/ui.jsx';
import { toast, confirmDialog } from '../../components/overlay.jsx';
import { BarChart, HBars } from '../../components/charts.jsx';
import { datePicker } from '../../components/shared.jsx';
import { Profile } from '../patient/Account.jsx';
import { ageTxt, openVisit, openHistory, openPriority, openWalkin, ScheduleManager } from './DoctorTools.jsx';

const shortDate = d => fa(J.jOf(d).jd) + ' ' + J.MONTHS[J.jOf(d).jm - 1].slice(0, 3);

/* ---------------- داشبورد ---------------- */
export function Dashboard() {
  const res = useAsync(() => get('/dr/dashboard'), []);
  if (res.error) return <ErrorBox error={res.error} retry={res.reload} />;
  const d = res.data;
  if (!d) return <Loader />;
  const today = J.ymd();
  const toggleAccepting = async e => {
    const on = e.target.checked;
    await put('/dr/profile', { accepting: on });
    res.setData(x => ({ ...x, doctor: { ...x.doctor, accepting: on } }));
    toast(on ? 'پذیرش نوبت آنلاین فعال شد.' : 'پذیرش نوبت آنلاین متوقف شد.', 'success');
  };
  const PERF = [['users', 'blue', 'کل بیماران', fa(d.patients) + ' نفر'], ['hourglass', 'purple', 'در صف انتظار', fa(d.waitlist) + ' نفر'], ['x-circle', 'orange', 'نرخ عدم مراجعه', pct(d.noShowRate)], ['clock', 'teal', 'میانگین زمان ویزیت', d.avgVisit ? fa(d.avgVisit) + ' دقیقه' : '—']];
  return <>
    <div className="welcome"><div className="hero-pattern" />
      <div style={{ position: 'relative' }}><h2>{d.doctor.name}، روز خوبی داشته باشید</h2><p>امروز {fa(d.today.total)} نوبت دارید؛ {fa(d.today.done)} ویزیت انجام شده و {fa(d.today.waiting)} بیمار در سالن انتظار هستند.</p></div>
      <div className="row" style={{ position: 'relative' }}>
        <label className="row small" style={{ background: 'rgba(255,255,255,.15)', padding: '8px 14px', borderRadius: 12, cursor: 'pointer' }}><Switch checked={!!d.doctor.accepting} onChange={toggleAccepting} /> پذیرش نوبت آنلاین</label>
        <a href="#/dr/queue" className="btn white"><Icon name="queue" size="sm" /> صف زنده</a>
      </div>
    </div>
    <div className="kpis mt3">
      <Kpi icon="calendar" color="blue" value={fa(d.today.total)} label="نوبت امروز" />
      <Kpi icon="queue" color="teal" value={fa(d.today.waiting)} label="در سالن انتظار" />
      <Kpi icon="percent" color="purple" value={pct(d.week.occupancy)} label="اشغال ظرفیت ۷ روز آینده" />
      <Kpi icon="star" color="orange" value={d.rating ? fa(d.rating) : '—'} label={`امتیاز (${fa(d.reviewCount)} نظر)`} />
    </div>
    <div className="grid mt3" style={{ gridTemplateColumns: '1.7fr 1fr' }}>
      <div className="card"><div className="card-h"><h3><Icon name="chart" /> روند نوبت‌ها (۲۱ روز)</h3><span className="small muted">امروز برجسته شده است</span></div><div className="card-b">
        <BarChart labels={d.days.map(x => shortDate(x.date))} highlight={d.days.findIndex(x => x.date === today)} series={[
          { name: 'انجام شده', color: '#16a34a', values: d.days.map(x => x.done) }, { name: 'رزرو شده', color: '#2563eb', values: d.days.map(x => x.booked) },
          { name: 'عدم مراجعه', color: '#f59e0b', values: d.days.map(x => x.noShow) }, { name: 'لغو', color: '#ef4444', values: d.days.map(x => x.cancelled) }]} />
      </div></div>
      <div className="card"><div className="card-h"><h3><Icon name="percent" /> ظرفیت روزهای آینده</h3></div><div className="card-b">
        <HBars max={100} items={d.calendar.map(c => ({ label: J.relative(c.date) + (c.leave ? ' (مرخصی)' : c.off ? ' (تعطیل)' : ''), value: c.capacity ? Math.round(c.load * 100) : 0, suffix: '٪', color: c.load >= 0.9 ? 'var(--danger)' : c.load >= 0.6 ? 'var(--warning)' : 'var(--success)' }))} />
      </div></div>
    </div>
    <div className="grid mt3" style={{ gridTemplateColumns: '1fr 1.4fr' }}>
      <div className="card"><div className="card-h"><h3><Icon name="activity" /> شاخص‌های عملکرد</h3></div><div className="card-b col" style={{ gap: 16 }}>
        {PERF.map(([ic, c, l, v]) => <div key={l} className="row"><div className={`ic ${c}`} style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center' }}><Icon name={ic} size="sm" /></div><span className="grow t2">{l}</span><b>{v}</b></div>)}
      </div></div>
      <div className="card"><div className="card-h"><h3><Icon name="calendar" /> نوبت‌های پیش رو</h3><a href="#/dr/appointments" className="small" style={{ color: 'var(--primary)' }}>همه</a></div>
        {d.upcoming.length ? d.upcoming.map(a => (
          <div key={a.id} className="queue-item"><div className="turn">{fa(a.time)}</div>
            <div className="grow"><b className="small">{a.patient?.name}</b> <PrioBadge p={a.priority} /><div className="xs muted">{J.relative(a.date)} • {a.centerName} {a.reason ? '• ' + a.reason : ''}</div></div><StatusBadge status={a.status} /></div>))
          : <div className="card-b muted small">نوبتی در پیش ندارید.</div>}
      </div>
    </div>
  </>;
}

/* ---------------- صف زنده ---------------- */
export function Queue() {
  const { user } = useApp();
  const res = useAsync(() => get('/dr/queue'), []);
  useInterval(() => res.reload({ silent: true }), 10000);
  if (res.error) return <ErrorBox error={res.error} retry={res.reload} />;
  const data = res.data;
  if (!data) return <Loader />;
  const reload = () => res.reload({ silent: true });
  const c = data.current;
  const done = data.list.filter(a => a.status === 'done').length;
  const callNext = async () => {
    const r = await post('/dr/queue/next');
    if (r.called) toast(`بیمار شماره‌ی ${fa(data.list.find(x => x.id === r.called.id)?.turn || '')} — ${r.called.patient?.name} فراخوانی شد.`, 'success'); else toast(r.message, 'warn');
    await reload();
  };
  const setStatus = async (id, status) => { try { await post(`/dr/appointments/${id}/status`, { status }); await reload(); } catch (err) { toast(err.message, 'error'); } };
  return <>
    <div className="page-head"><div><h1>صف زنده‌ی امروز</h1><p>{J.withDay(J.ymd(), true)} — {fa(data.list.length)} نوبت، {fa(done)} انجام شده</p></div>
      <div className="row"><a href={`#/display/${c?.centerId || user.doctor?.centerIds?.[0] || 1}`} target="_blank" className="btn ghost"><Icon name="tv" size="sm" /> نمایشگر سالن</a>
        <AsyncButton className="btn accent lg" onClick={callNext}><Icon name="mega" /> فراخوانی بیمار بعدی</AsyncButton></div></div>
    <div className="grid" style={{ gridTemplateColumns: '1.1fr 1fr', alignItems: 'start' }}>
      <div className="col" style={{ gap: 18 }}>
        <div className="now-serving"><div className="hero-pattern" /><div style={{ position: 'relative' }}>
          {c ? <>
            <div className="row between"><span className="badge" style={{ background: 'rgba(255,255,255,.18)', color: '#fff' }}><span className="dot" style={{ animation: 'pulse 1.4s infinite' }} />در حال ویزیت</span><span className="small" style={{ opacity: 0.8 }}>از ساعت {J.time(c.calledAt)}</span></div>
            <div className="row mt2" style={{ gap: 20 }}><div className="num">{fa(c.turn)}</div>
              <div><h2 style={{ fontSize: 22 }}>{c.patient?.name}</h2><div style={{ opacity: 0.85 }} className="small">{ageTxt(c.patient)} • {c.patient?.insurance || 'آزاد'} • نوبت {fa(c.time)}</div>{c.reason && <div className="small mt1">علت مراجعه: {c.reason}</div>}</div></div>
            <div className="row wrap mt3"><button className="btn white" onClick={() => openVisit(c, reload)}><Icon name="file" size="sm" /> ثبت تشخیص و نسخه</button><button className="btn" style={{ background: 'rgba(255,255,255,.15)' }} onClick={() => openHistory(c.patient?.id)}><Icon name="activity" size="sm" /> سوابق بیمار</button></div>
          </> : <div style={{ textAlign: 'center', padding: '20px 0' }}><div style={{ opacity: 0.8 }}>در حال حاضر بیماری در حال ویزیت نیست</div><div className="small mt1" style={{ opacity: 0.7 }}>{data.waiting.length ? `${fa(data.waiting.length)} بیمار پذیرش‌شده در انتظار فراخوانی` : 'بیمار پذیرش‌شده‌ای در سالن نیست'}</div></div>}
        </div></div>
        <div className="card"><div className="card-h"><h3><Icon name="queue" /> ترتیب فراخوانی (سالن انتظار)</h3><span className="badge teal">{fa(data.waiting.length)} نفر</span></div>
          <div className="alert info" style={{ borderRadius: 0 }}><Icon name="info" size="sm" /><div className="xs">ترتیب بر اساس «اولویت پزشکی» و سپس «ساعت نوبت» محاسبه می‌شود.{data.avgVisit ? ` میانگین واقعی ویزیت شما: ${fa(data.avgVisit)} دقیقه.` : ''}</div></div>
          {data.waiting.length ? data.waiting.map((a, i) => (
            <div key={a.id} className={`queue-item ${a.priority !== 'normal' ? 'prio' : ''}`}><div className="turn">{fa(a.turn)}</div>
              <div className="grow"><b className="small">{a.patient?.name}</b> <PrioBadge p={a.priority} /><div className="xs muted">نوبت {fa(a.time)} • {ageTxt(a.patient)} • انتظار تقریبی {fa((i + (c ? 1 : 0)) * (data.avgVisit || 15))} دقیقه</div></div>
              <button className="btn xs ghost" title="تغییر اولویت" onClick={() => openPriority(a.id, reload)}><Icon name="flame" size="sm" /></button>
              <AsyncButton className="btn xs soft" onClick={() => setStatus(a.id, 'in_visit')}>فراخوانی</AsyncButton></div>))
            : <div className="card-b small muted">سالن انتظار خالی است.</div>}
        </div>
      </div>
      <div className="card"><div className="card-h"><h3><Icon name="list" /> همه‌ی نوبت‌های امروز</h3></div>
        {data.list.length ? data.list.map(a => (
          <div key={a.id} className={`queue-item ${a.status === 'done' || a.status === 'no_show' ? 'done' : ''} ${a.status === 'in_visit' ? 'cur' : ''}`}><div className="turn">{fa(a.turn)}</div>
            <div className="grow"><b className="small">{a.patient?.name}</b> <PrioBadge p={a.priority} /><div className="xs muted">{fa(a.time)} • {a.centerName}{a.source === 'reception' ? ' • حضوری' : ''}</div></div>
            <StatusBadge status={a.status} />
            {a.status === 'booked' && <><AsyncButton className="btn xs success" onClick={() => setStatus(a.id, 'checked_in')}>پذیرش</AsyncButton><AsyncButton className="btn xs ghost" title="عدم مراجعه" onClick={() => setStatus(a.id, 'no_show')}><Icon name="x" size="sm" /></AsyncButton></>}
            {a.status === 'no_show' && <AsyncButton className="btn xs ghost" onClick={() => setStatus(a.id, 'checked_in')}>پذیرش دیرهنگام</AsyncButton>}
            {a.status === 'done' && <button className="btn xs ghost" onClick={() => openVisit(a, reload)}><Icon name="file" size="sm" /></button>}
          </div>)) : <Empty title="امروز نوبتی ندارید" icon="calendar" />}
      </div>
    </div>
  </>;
}

/* ---------------- نوبت‌ها ---------------- */
const STATUS_OPTS = [['booked', 'رزرو شده'], ['checked_in', 'پذیرش شده'], ['done', 'انجام شده'], ['cancelled', 'لغو شده'], ['no_show', 'عدم مراجعه']];
export function Appointments({ query }) {
  const { user } = useApp();
  const [date, setDate] = useState(query.date || J.ymd());
  const [mode, setMode] = useState('day');
  const [status, setStatus] = useState('');
  const to = mode === 'week' ? J.addDays(date, 6) : date;
  const res = useAsync(() => get('/dr/appointments', { from: date, to, status }), [date, to, status]);
  const reload = () => res.reload({ silent: true });
  const list = res.data || [];
  const move = n => setDate(n === 0 ? J.ymd() : J.addDays(date, n * (mode === 'week' ? 7 : 1)));
  const pick = async () => { const d = await datePicker({ value: date }); if (d) setDate(d); };
  const cancel = async id => {
    const r = await confirmDialog('نوبت لغو و به بیمار پیامک اطلاع‌رسانی ارسال می‌شود. ظرفیت آزاد شده به صف انتظار داده خواهد شد.', { title: 'لغو نوبت', danger: true, ok: 'لغو نوبت', input: 'علت لغو (برای بیمار ارسال می‌شود)' });
    if (!r) return;
    try { const x = await post(`/appointments/${id}/cancel`, { reason: r.value }); toast('نوبت لغو شد.' + (x.promoted ? ` ${fa(x.promoted)} نفر از صف انتظار جایگزین شد.` : ''), 'success'); reload(); } catch (err) { toast(err.message, 'error'); }
  };
  return <>
    <div className="page-head"><div><h1>مدیریت نوبت‌ها</h1><p>مشاهده، ثبت نوبت حضوری، لغو و ثبت پرونده‌ی ویزیت</p></div><button className="btn" onClick={() => openWalkin(user.doctor.id, reload)}><Icon name="user-plus" size="sm" /> ثبت نوبت حضوری / تلفنی</button></div>
    <div className="card">
      <div className="toolbar">
        <button className="btn icon-only sm ghost" onClick={() => move(-1)}><Icon name="chev-right" /></button>
        <button className="btn sm ghost" onClick={pick} style={{ minWidth: 200 }}><Icon name="calendar" size="sm" /><span>{mode === 'week' ? `${J.long(date, false)} تا ${J.long(to, false)}` : J.withDay(date, true)}</span></button>
        <button className="btn icon-only sm ghost" onClick={() => move(1)}><Icon name="chev-left" /></button>
        <button className="btn sm soft" onClick={() => move(0)}>امروز</button>
        <Tabs style={{ marginInlineStart: 'auto' }} value={mode} onChange={setMode} tabs={[['day', 'روزانه'], ['week', 'هفتگی']]} />
        <select className="select sm" style={{ width: 160 }} value={status} onChange={e => setStatus(e.target.value)}><option value="">همه‌ی وضعیت‌ها</option>{STATUS_OPTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </div>
      {!res.data ? <Loader /> : list.length ? <>
        <div className="table-wrap"><table className="table"><thead><tr><th>ساعت</th>{mode === 'week' && <th>تاریخ</th>}<th>بیمار</th><th>مرکز</th><th>علت مراجعه</th><th>اولویت</th><th>وضعیت</th><th></th></tr></thead><tbody>
          {list.map(a => (
            <tr key={a.id}><td><b>{fa(a.time)}</b></td>{mode === 'week' && <td className="small">{J.withDay(a.date)}</td>}
              <td><div className="row"><Avatar name={a.patient?.name || '?'} size="sm" /><div><b className="small">{a.patient?.name}</b><div className="xs muted">{fa(a.patient?.mobile)} {a.patient?.age != null ? '• ' + ageTxt(a.patient) : ''}</div></div></div></td>
              <td className="small">{a.centerName}</td>
              <td className="small t2">{a.reason || '—'}{a.source === 'waitlist' ? <> <span className="badge purple">صف انتظار</span></> : a.source === 'reception' ? <> <span className="badge cyan">حضوری</span></> : null}</td>
              <td><PrioBadge p={a.priority} fallback={<span className="muted xs">عادی</span>} /></td><td><StatusBadge status={a.status} /></td>
              <td className="actions">
                {a.status !== 'cancelled' && <button className="btn xs ghost" title="پرونده" onClick={() => openVisit(a, reload)}><Icon name="file" size="sm" /></button>}
                <button className="btn xs ghost" title="سوابق" onClick={() => openHistory(a.patient?.id)}><Icon name="activity" size="sm" /></button>
                {['booked', 'checked_in'].includes(a.status) && <button className="btn xs danger-soft" title="لغو" onClick={() => cancel(a.id)}><Icon name="x" size="sm" /></button>}
              </td></tr>))}
        </tbody></table></div>
        <div className="toolbar small t2" style={{ border: 'none', borderTop: '1px solid var(--border)' }}>{fa(list.filter(a => a.status !== 'cancelled').length)} نوبت فعال • {fa(list.filter(a => a.status === 'done').length)} انجام شده • {fa(list.filter(a => a.status === 'cancelled').length)} لغو شده</div>
      </> : <Empty title="نوبتی در این بازه ثبت نشده است" icon="calendar" />}
    </div>
  </>;
}

/* ---------------- برنامه‌ی کاری ---------------- */
export function Schedule() {
  const { meta } = useApp();
  return <>
    <div className="page-head"><div><h1>برنامه‌ی کاری و مرخصی</h1><p>تعریف شیفت‌ها، مدت و ظرفیت نوبت‌ها در هر مرکز درمانی</p></div></div>
    <ScheduleManager centers={meta.centers} />
  </>;
}

/* ---------------- صف انتظار ---------------- */
export function Waitlist() {
  const res = useAsync(() => get('/dr/waitlist'), []);
  if (!res.data) return <Loader />;
  return <>
    <div className="page-head"><div><h1>صف انتظار بیماران</h1><p>بیمارانی که برای روزهای تکمیل منتظر آزاد شدن ظرفیت هستند</p></div></div>
    <div className="alert info mb3"><Icon name="zap" /><div><b>تخصیص خودکار فعال است</b><p>با لغو نوبت یا افزودن شیفت جدید، سیستم به‌طور خودکار به ترتیب جایگاه زیر نوبت تخصیص می‌دهد. افزایش ظرفیت شیفت‌ها نیز صف را پردازش می‌کند.</p></div></div>
    <div className="card"><div className="table-wrap"><table className="table"><thead><tr><th>جایگاه</th><th>بیمار</th><th>تاریخ درخواستی</th><th>اولویت</th><th>امتیاز</th><th>بازه‌ی ترجیحی</th><th>وضعیت</th><th>ثبت</th></tr></thead><tbody>
      {res.data.length ? res.data.map(w => (
        <tr key={w.id}><td><b style={{ fontSize: 17, color: 'var(--primary)' }}>{w.position ? fa(w.position) : '—'}</b></td>
          <td><b className="small">{w.patient?.name}</b><div className="xs muted">{fa(w.patient?.mobile)} {w.patient?.age != null ? '• ' + fa(w.patient.age) + ' ساله' : ''}</div></td>
          <td>{J.withDay(w.date)}</td><td><PrioBadge p={w.priority} fallback={<span className="xs muted">عادی</span>} /></td><td>{fa(w.score)}</td>
          <td className="small">{w.fromTime ? fa(w.fromTime) + ' – ' + fa(w.toTime || '') : '—'}{w.note && <div className="xs muted">{w.note}</div>}</td>
          <td><StatusBadge status={w.status} /></td><td className="xs muted">{J.ago(w.createdAt)}</td></tr>))
        : <tr><td colSpan={8}><Empty title="صف انتظار خالی است" icon="hourglass" /></td></tr>}
    </tbody></table></div></div>
  </>;
}

/* ---------------- بیماران ---------------- */
export function Patients() {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { const t = setTimeout(() => setQ(text), 300); return () => clearTimeout(t); }, [text]);
  const res = useAsync(() => get('/dr/patients', { q }), [q]);
  return <>
    <div className="page-head"><div><h1>بیماران من</h1><p>فهرست بیماران و سوابق ویزیت</p></div>
      <div className="input-icon" style={{ width: 280 }}><Icon name="search" /><input className="input" value={text} onChange={e => setText(e.target.value)} placeholder="جست‌وجوی نام یا موبایل" /></div></div>
    <div className="card">{!res.data ? <Loader /> : <div className="table-wrap"><table className="table"><thead><tr><th>بیمار</th><th>سن</th><th>بیمه</th><th>تعداد ویزیت</th><th>آخرین ویزیت</th><th>نوبت بعدی</th><th>عدم مراجعه</th><th></th></tr></thead><tbody>
      {res.data.length ? res.data.map(p => (
        <tr key={p.id}><td><div className="row"><Avatar name={p.name} size="sm" /><div><b className="small">{p.name}</b><div className="xs muted">{fa(p.mobile)}</div></div></div></td>
          <td>{p.age != null ? fa(p.age) : '—'}</td><td className="small">{p.insurance || 'آزاد'}</td><td><b>{fa(p.visits)}</b></td>
          <td className="small">{p.last ? J.short(p.last) : '—'}</td><td className="small">{p.next ? <span className="badge blue">{J.relative(p.next)}</span> : '—'}</td>
          <td>{p.noShow ? <span className="badge orange">{fa(p.noShow)}</span> : '—'}</td>
          <td className="actions"><button className="btn xs soft" onClick={() => openHistory(p.id)}>پرونده</button></td></tr>))
        : <tr><td colSpan={8}><Empty title="بیماری یافت نشد" icon="users" /></td></tr>}
    </tbody></table></div>}</div>
  </>;
}

/* ---------------- نظرات ---------------- */
export function Reviews() {
  const res = useAsync(() => get('/dr/reviews'), []);
  const [replies, setReplies] = useState({});
  if (!res.data) return <Loader />;
  const list = res.data;
  const avg = list.length ? (list.reduce((s, r) => s + r.rating, 0) / list.length).toFixed(1) : 0;
  const send = async id => {
    const v = (replies[id] || '').trim();
    if (!v) return;
    await post(`/dr/reviews/${id}/reply`, { reply: v });
    toast('پاسخ شما ثبت شد.', 'success');
    res.setData(l => l.map(r => (r.id === id ? { ...r, reply: v } : r)));
  };
  return <>
    <div className="page-head"><div><h1>نظرات بیماران</h1><p>میانگین امتیاز {fa(avg)} از {fa(list.length)} نظر</p></div></div>
    <div className="card pad">{list.length ? list.map(r => (
      <div key={r.id} className="review">
        <div className="row between"><div className="row"><Avatar name={r.patientName || '?'} size="sm" /><div><b className="small">{r.patientName}</b><div className="xs muted">{J.ago(r.createdAt)}</div></div></div><Stars value={r.rating} /></div>
        <p className="small mt1">{r.comment || '—'}</p>
        {r.reply ? <div className="reply"><b>پاسخ شما:</b> {r.reply}</div>
          : <div className="row mt1"><input className="input sm grow" placeholder="پاسخ به این نظر..." value={replies[r.id] || ''} onChange={e => setReplies(x => ({ ...x, [r.id]: e.target.value }))} />
            <AsyncButton className="btn sm soft" onClick={() => send(r.id)}><Icon name="send" size="sm" /> ارسال</AsyncButton></div>}
      </div>)) : <Empty title="هنوز نظری ثبت نشده است" icon="star" />}</div>
  </>;
}

/* ---------------- پروفایل پزشک ---------------- */
export function DoctorProfile() {
  const { meta } = useApp();
  const res = useAsync(async () => { const me = await get('/me'); return { d: me.doctor, full: await get('/doctors/' + me.doctor.id) }; }, []);
  const [busy, run] = useBusy();
  if (!res.data) return <Loader />;
  const { d, full } = res.data;
  const save = e => {
    e.preventDefault();
    const x = formData(e.target);
    x.tags = splitList(x.tags);
    run(async () => { try { await put('/dr/profile', x); toast('پروفایل به‌روز شد.', 'success'); } catch (err) { toast(err.message, 'error'); } });
  };
  return <>
    <div className="page-head"><div><h1>پروفایل پزشک</h1><p>اطلاعات نمایش‌داده‌شده به بیماران در صفحه‌ی عمومی</p></div><a href={`#/doctor/${d.id}`} className="btn ghost"><Icon name="eye" size="sm" /> مشاهده‌ی صفحه‌ی عمومی</a></div>
    <form className="card mb3" onSubmit={save}><div className="card-h"><h3><Icon name="stethoscope" /> اطلاعات حرفه‌ای</h3></div><div className="card-b form-grid">
      <div className="field"><label>تخصص</label><input className="input" defaultValue={d.specialty} disabled /></div>
      <div className="field"><label>شماره نظام پزشکی</label><input className="input ltr" defaultValue={fa(d.medicalCode)} disabled /></div>
      <div className="field"><label>هزینه‌ی ویزیت (تومان)</label><input className="input ltr" name="fee" defaultValue={d.fee} /></div>
      <div className="field"><label>وضعیت پذیرش</label><label className="check" style={{ height: 46 }}><Switch name="accepting" defaultChecked={d.accepting} /> پذیرش نوبت آنلاین</label></div>
      <div className="field full"><label>درباره‌ی من</label><textarea className="textarea" name="bio" rows={4} defaultValue={full.bio || ''} /></div>
      <div className="field full"><label>بیمه‌های طرف قرارداد</label><div className="chips-select">{meta.insurances.map(i => <label key={i}><input type="checkbox" data-multi name="insurances" value={i} defaultChecked={d.insurances.includes(i)} /><span>{i}</span></label>)}</div></div>
      <div className="field full"><label>برچسب‌ها (با کاما جدا کنید)</label><input className="input" name="tags" defaultValue={d.tags.join('، ')} /></div>
      <div className="full"><SubmitButton busy={busy}><Icon name="check" size="sm" /> ذخیره</SubmitButton></div>
    </div></form>
    <Profile embedded />
  </>;
}
