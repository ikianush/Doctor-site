// مدیریت اطلاعات: نوبت‌ها، پزشکان، کاربران، تخصص‌ها و مراکز درمانی
import { useEffect, useState } from 'react';
import { useApp } from '../../lib/app.jsx';
import { get, post, put, del } from '../../lib/api.js';
import * as J from '../../lib/jalali.js';
import { fa, num, formData, splitList, STATUS, SPEC_ICON } from '../../lib/format.js';
import { useAsync, useBusy } from '../../lib/hooks.js';
import { Icon, Avatar, RatingPill, StatusBadge, PrioBadge, Loader, Empty, ErrorBox, AsyncButton, Switch, Spinner, Tabs } from '../../components/ui.jsx';
import { toast, openModal, Modal, confirmDialog } from '../../components/overlay.jsx';
import { DateField, showTicket } from '../../components/shared.jsx';
import { ScheduleManager, openWalkin } from '../doctor/DoctorTools.jsx';
import { exportCsv } from './AdminDashboard.jsx';

/** فوتر استاندارد مودال‌های فرم */
function FormFooter({ close, busy, onSave, label = 'ذخیره' }) {
  return <><button className="btn ghost" onClick={close}>انصراف</button><button className="btn" disabled={busy} onClick={onSave}>{busy ? <Spinner /> : <><Icon name="check" size="sm" /> {label}</>}</button></>;
}
/** هوک ذخیره‌ی فرم مودال: خواندن فرم با id، ارسال، بستن، تازه‌سازی */
function useSave(formId, send, { close, done, msg = 'ذخیره شد.', transform }) {
  const [busy, run] = useBusy();
  const { refreshMeta } = useApp();
  const save = () => run(async () => {
    let x = formData(document.getElementById(formId));
    if (transform) x = transform(x);
    try { await send(x); close(); toast(msg, 'success'); await refreshMeta(); done(); } catch (err) { toast(err.message, 'error'); }
  });
  return [busy, save];
}

/* ======================= همه‌ی نوبت‌ها ======================= */
const SOURCE = { online: 'آنلاین', phone: 'تلفنی', reception: 'حضوری', waitlist: 'صف انتظار' };
function pages(p, n) {
  const arr = [...new Set([1, p - 2, p - 1, p, p + 1, p + 2, n])].filter(x => x >= 1 && x <= n).sort((a, b) => a - b);
  return arr.flatMap((x, i) => (i && x - arr[i - 1] > 1 ? [['…', x]] : []).concat([[x]]));
}
export function Appointments() {
  const { meta } = useApp();
  const docs = useAsync(() => get('/admin/doctors'), []);
  const EMPTY = { q: '', status: '', doctorId: '', centerId: '', from: '', to: '', page: 1 };
  const [f, setF] = useState(EMPTY);
  const [text, setText] = useState('');
  const set = (k, v) => setF(x => ({ ...x, [k]: v, page: k === 'page' ? v : 1 }));
  useEffect(() => { const t = setTimeout(() => set('q', text.trim()), 350); return () => clearTimeout(t); }, [text]);
  const res = useAsync(() => get('/admin/appointments', f), [JSON.stringify(f)]);
  const reload = () => res.reload({ silent: true });
  const data = res.data;
  const cancel = async id => {
    const r = await confirmDialog('این نوبت لغو و به بیمار اطلاع داده می‌شود.', { title: 'لغو نوبت توسط مدیر', danger: true, ok: 'لغو', input: 'علت لغو' });
    if (!r) return;
    try { const x = await post(`/appointments/${id}/cancel`, { reason: r.value }); toast('نوبت لغو شد.' + (x.promoted ? ` ${fa(x.promoted)} نفر از صف انتظار جایگزین شد.` : ''), 'success'); reload(); } catch (err) { toast(err.message, 'error'); }
  };
  return <>
    <div className="page-head"><div><h1>همه‌ی نوبت‌ها</h1><p>جست‌وجو، فیلتر و مدیریت نوبت‌های کل سامانه</p></div>
      <div className="row"><AsyncButton className="btn ghost" onClick={exportCsv}><Icon name="download" size="sm" /> خروجی CSV</AsyncButton><button className="btn" disabled={!docs.data} onClick={() => openWalkin(null, reload, docs.data.filter(d => d.active))}><Icon name="plus" size="sm" /> ثبت نوبت</button></div></div>
    <div className="card">
      <div className="toolbar">
        <div className="input-icon" style={{ width: 230 }}><Icon name="search" /><input className="input sm" value={text} onChange={e => setText(e.target.value)} placeholder="کد، نام بیمار، موبایل..." /></div>
        <select className="select sm" style={{ width: 150 }} value={f.status} onChange={e => set('status', e.target.value)}><option value="">همه‌ی وضعیت‌ها</option>{Object.entries(STATUS).slice(0, 6).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</select>
        <select className="select sm" style={{ width: 190 }} value={f.doctorId} onChange={e => set('doctorId', e.target.value)}><option value="">همه‌ی پزشکان</option>{(docs.data || []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <select className="select sm" style={{ width: 180 }} value={f.centerId} onChange={e => set('centerId', e.target.value)}><option value="">همه‌ی مراکز</option>{meta.centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <div style={{ width: 170 }}><DateField small value={f.from} onChange={v => set('from', v)} placeholder="از تاریخ" /></div>
        <div style={{ width: 170 }}><DateField small value={f.to} onChange={v => set('to', v)} placeholder="تا تاریخ" /></div>
        <button className="btn sm ghost" title="حذف فیلترها" onClick={() => { setText(''); setF(EMPTY); }}><Icon name="refresh" size="sm" /></button>
      </div>
      {res.error ? <ErrorBox error={res.error} retry={res.reload} /> : !data ? <Loader /> : data.items.length ? <>
        <div className="table-wrap"><table className="table"><thead><tr><th>کد</th><th>تاریخ و ساعت</th><th>بیمار</th><th>پزشک</th><th>مرکز</th><th>اولویت</th><th>منبع</th><th>وضعیت</th><th></th></tr></thead><tbody>
          {data.items.map(a => (
            <tr key={a.id}><td><span className="code small" style={{ letterSpacing: 1 }}>{fa(a.code)}</span></td>
              <td><b className="small">{J.short(a.date)}</b><div className="xs muted">{fa(a.time)} — {J.WEEKDAYS[J.weekday(a.date)]}</div></td>
              <td><b className="small">{a.patient?.name}</b><div className="xs muted">{fa(a.patient?.mobile)}</div></td>
              <td className="small">{a.doctorName}<div className="xs muted">{a.specialty}</div></td><td className="small">{a.centerName}</td>
              <td><PrioBadge p={a.priority} fallback={<span className="xs muted">عادی</span>} /></td><td><span className="badge">{SOURCE[a.source] || a.source}</span></td><td><StatusBadge status={a.status} /></td>
              <td className="actions"><button className="btn xs ghost" title="رسید" onClick={() => showTicket(a)}><Icon name="ticket" size="sm" /></button>
                {['booked', 'checked_in'].includes(a.status) && <button className="btn xs danger-soft" title="لغو" onClick={() => cancel(a.id)}><Icon name="x" size="sm" /></button>}</td></tr>))}
        </tbody></table></div>
        <div className="row between" style={{ padding: '0 22px' }}><span className="small muted">{fa(data.total)} نوبت</span>
          <div className="pager">{pages(data.page, data.pages).map(([x, k]) => x === '…' ? <span key={'e' + k} className="muted">…</span> : <button key={x} className={x === data.page ? 'on' : ''} onClick={() => set('page', x)}>{fa(x)}</button>)}</div></div>
      </> : <Empty title="نوبتی یافت نشد" text="فیلترها را تغییر دهید." icon="search" />}
    </div>
  </>;
}

/* ======================= پزشکان ======================= */
export function Doctors() {
  const { meta } = useApp();
  const res = useAsync(() => get('/admin/doctors'), []);
  const reload = () => res.reload({ silent: true });
  if (!res.data) return <Loader />;
  const list = res.data;
  const toggle = async (d, key, val) => {
    res.setData(l => l.map(x => (x.id === d.id ? { ...x, [key]: val } : x)));
    try { await put('/admin/doctors/' + d.id, { [key]: val }); toast('وضعیت به‌روز شد.', 'success'); }
    catch (err) { toast(err.message, 'error'); res.setData(l => l.map(x => (x.id === d.id ? { ...x, [key]: !val } : x))); }
  };
  const edit = d => openModal(({ close }) => <DoctorModal d={d} close={close} done={reload} />);
  const schedule = d => openModal(({ close }) => (
    <Modal size="lg" width="min(1100px,100%)" onClose={close} title={<><Icon name="clock" /> برنامه‌ی کاری — {d.name}</>}><ScheduleManager doctorId={d.id} centers={meta.centers} /></Modal>
  ), { onClose: reload });
  return <>
    <div className="page-head"><div><h1>مدیریت پزشکان</h1><p>{fa(list.length)} پزشک ثبت‌شده</p></div><button className="btn" onClick={() => edit(null)}><Icon name="plus" size="sm" /> افزودن پزشک</button></div>
    <div className="card"><div className="table-wrap"><table className="table"><thead><tr><th>پزشک</th><th>تخصص</th><th>مراکز</th><th>امتیاز</th><th>ویزیت</th><th>شیفت</th><th>پذیرش</th><th>تأیید</th><th>فعال</th><th></th></tr></thead><tbody>
      {list.map(d => (
        <tr key={d.id}><td><div className="row"><Avatar name={d.name} size="sm" verified={d.verified} /><div><b className="small">{d.name}</b><div className="xs muted">{fa(d.mobile)} • نظام {fa(d.medicalCode)}</div></div></div></td>
          <td className="small">{d.specialty}</td><td className="small">{d.centers.map(c => c.name).join('، ')}</td><td><RatingPill rating={d.rating} count={d.reviewCount} /></td><td>{num(d.visits)}</td><td>{fa(d.shifts)}</td>
          {['accepting', 'verified', 'active'].map(k => <td key={k}><Switch checked={!!d[k]} onChange={e => toggle(d, k, e.target.checked)} /></td>)}
          <td className="actions"><button className="btn xs ghost" title="برنامه‌ی کاری" onClick={() => schedule(d)}><Icon name="clock" size="sm" /></button><button className="btn xs ghost" title="ویرایش" onClick={() => edit(d)}><Icon name="edit" size="sm" /></button><a className="btn xs ghost" href={`#/doctor/${d.id}`} title="صفحه‌ی عمومی"><Icon name="eye" size="sm" /></a></td></tr>))}
    </tbody></table></div></div>
  </>;
}
function DoctorModal({ d, close, done }) {
  const { meta: m } = useApp();
  const [busy, save] = useSave('docf', x => (d ? put('/admin/doctors/' + d.id, x) : post('/admin/doctors', x)), { close, done, msg: d ? 'اطلاعات پزشک به‌روز شد.' : 'پزشک جدید اضافه شد. اکنون برنامه‌ی کاری او را تعریف کنید.' });
  return (
    <Modal title={d ? 'ویرایش پزشک' : 'افزودن پزشک جدید'} size="lg" onClose={close} footer={<FormFooter close={close} busy={busy} onSave={save} />}>
      <form id="docf" className="form-grid" onSubmit={e => e.preventDefault()}>
        <div className="field"><label>نام و نام خانوادگی *</label><input className="input" name="name" defaultValue={d?.name || ''} required /></div>
        <div className="field"><label>موبایل (نام کاربری) *</label><input className="input ltr" name="mobile" defaultValue={d?.mobile || ''} disabled={!!d} /></div>
        <div className="field"><label>تخصص *</label><select className="select" name="specialtyId" defaultValue={d?.specialtyId}>{m.specialties.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div className="field"><label>شماره نظام پزشکی *</label><input className="input ltr" name="medicalCode" defaultValue={d?.medicalCode || ''} disabled={!!d} /></div>
        <div className="field"><label>مدرک / عنوان</label><input className="input" name="degree" defaultValue={d?.degree || ''} placeholder="متخصص ..." /></div>
        <div className="field"><label>سابقه (سال)</label><input className="input ltr" name="experience" defaultValue={d?.experience ?? ''} /></div>
        <div className="field"><label>هزینه‌ی ویزیت (تومان)</label><input className="input ltr" name="fee" defaultValue={d?.fee ?? 250000} /></div>
        <div className="field"><label>جنسیت</label><select className="select" name="gender" defaultValue={d?.gender === 'f' ? 'f' : 'm'}><option value="m">آقا</option><option value="f">خانم</option></select></div>
        <div className="field full"><label>مراکز درمانی *</label><div className="chips-select">{m.centers.map(c => <label key={c.id}><input type="checkbox" data-multi name="centerIds" value={c.id} defaultChecked={d?.centerIds?.includes(c.id)} /><span>{c.name}</span></label>)}</div></div>
        <div className="field full"><label>بیمه‌ها</label><div className="chips-select">{m.insurances.map(i => <label key={i}><input type="checkbox" data-multi name="insurances" value={i} defaultChecked={d?.insurances?.includes(i)} /><span>{i}</span></label>)}</div></div>
        <div className="field full"><label>بیوگرافی</label><textarea className="textarea" name="bio" defaultValue={d?.bio || ''} /></div>
        {!d && <div className="field"><label>رمز عبور اولیه</label><input className="input ltr" name="password" defaultValue="123456" /></div>}
      </form>
    </Modal>
  );
}

/* ======================= کاربران ======================= */
const RL = { patient: ['بیمار', 'blue'], doctor: ['پزشک', 'teal'], admin: ['مدیر', 'purple'] };
export function Users() {
  const [role, setRole] = useState('');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { const t = setTimeout(() => setQ(text), 300); return () => clearTimeout(t); }, [text]);
  const res = useAsync(() => get('/admin/users', { role, q }), [role, q]);
  const reload = () => res.reload({ silent: true });
  const block = async u => {
    if (!await confirmDialog(u.active ? `حساب «${u.name}» مسدود شود؟ کاربر از سیستم خارج خواهد شد.` : `حساب «${u.name}» فعال شود؟`, { danger: u.active })) return;
    try { await put('/admin/users/' + u.id, { active: !u.active }); toast('وضعیت کاربر تغییر کرد.', 'success'); reload(); } catch (err) { toast(err.message, 'error'); }
  };
  const edit = u => openModal(({ close }) => <UserModal u={u} close={close} done={reload} />);
  return <>
    <div className="page-head"><div><h1>مدیریت کاربران</h1><p>بیماران، پزشکان و مدیران سامانه</p></div><button className="btn" onClick={() => edit(null)}><Icon name="user-plus" size="sm" /> کاربر جدید</button></div>
    <div className="card">
      <div className="toolbar"><Tabs value={role} onChange={setRole} tabs={[['', 'همه'], ['patient', 'بیماران'], ['doctor', 'پزشکان'], ['admin', 'مدیران']]} />
        <div className="input-icon" style={{ width: 260, marginInlineStart: 'auto' }}><Icon name="search" /><input className="input sm" value={text} onChange={e => setText(e.target.value)} placeholder="نام، موبایل یا کد ملی" /></div></div>
      {!res.data ? <Loader /> : <div className="table-wrap"><table className="table"><thead><tr><th>کاربر</th><th>نقش</th><th>کد ملی</th><th>سن</th><th>شهر / بیمه</th><th>نوبت‌ها</th><th>عضویت</th><th>وضعیت</th><th></th></tr></thead><tbody>
        {res.data.slice(0, 200).map(u => (
          <tr key={u.id}><td><div className="row"><Avatar name={u.name} size="sm" /><div><b className="small">{u.name}</b><div className="xs muted">{fa(u.mobile)}</div></div></div></td>
            <td><span className={`badge ${RL[u.role][1]}`}>{RL[u.role][0]}</span></td><td className="small">{u.nationalCode ? fa(u.nationalCode) : '—'}</td>
            <td>{u.birthYear ? fa(new Date().getFullYear() - u.birthYear) : '—'}</td><td className="small">{u.city || ''}<div className="xs muted">{u.insurance || ''}</div></td>
            <td>{fa(u.appointments)}</td><td className="xs muted">{J.short(J.isoToYmd(u.createdAt))}</td>
            <td>{u.active ? <span className="badge green"><span className="dot" />فعال</span> : <span className="badge red"><span className="dot" />مسدود</span>}</td>
            <td className="actions"><button className="btn xs ghost" onClick={() => edit(u)}><Icon name="edit" size="sm" /></button><button className={`btn xs ${u.active ? 'danger-soft' : 'soft'}`} onClick={() => block(u)}>{u.active ? 'مسدود' : 'فعال‌سازی'}</button></td></tr>))}
      </tbody></table></div>}
    </div>
  </>;
}
function UserModal({ u, close, done }) {
  const { meta } = useApp();
  const [busy, save] = useSave('usrf', x => (u ? put('/admin/users/' + u.id, x) : post('/admin/users', x)), { close, done, transform: x => { if (!x.password) delete x.password; return x; } });
  return (
    <Modal title={u ? 'ویرایش کاربر' : 'کاربر جدید'} onClose={close} footer={<FormFooter close={close} busy={busy} onSave={save} />}>
      <form id="usrf" className="form-grid" onSubmit={e => e.preventDefault()}>
        <div className="field full"><label>نام و نام خانوادگی</label><input className="input" name="name" defaultValue={u?.name || ''} /></div>
        <div className="field"><label>موبایل</label><input className="input ltr" name="mobile" defaultValue={u?.mobile || ''} /></div>
        {!u && <div className="field"><label>نقش</label><select className="select" name="role"><option value="patient">بیمار</option><option value="admin">مدیر</option></select></div>}
        <div className="field"><label>سال تولد (میلادی)</label><input className="input ltr" name="birthYear" defaultValue={u?.birthYear || ''} /></div>
        <div className="field"><label>شهر</label><input className="input" name="city" defaultValue={u?.city || ''} /></div>
        <div className="field"><label>بیمه</label><select className="select" name="insurance" defaultValue={u?.insurance || ''}><option value="">آزاد</option>{meta.insurances.map(i => <option key={i}>{i}</option>)}</select></div>
        <div className="field"><label>{u ? 'رمز جدید (اختیاری)' : 'رمز عبور'}</label><input className="input ltr" name="password" placeholder={u ? 'بدون تغییر' : '123456'} /></div>
      </form>
    </Modal>
  );
}

/* ======================= تخصص‌ها ======================= */
const SPEC_ICONS = ['heart', 'stethoscope', 'baby', 'female', 'sparkle', 'bone', 'eye', 'ear', 'brain', 'mind', 'tooth', 'user', 'apple', 'kidney', 'pill', 'drop', 'activity', 'shield'];
export function Specialties() {
  const { meta, refreshMeta } = useApp();
  const res = useAsync(() => get('/admin/specialties'), []);
  const reload = () => res.reload({ silent: true });
  if (!res.data) return <Loader />;
  const counts = Object.fromEntries(meta.specialties.map(s => [s.id, s.count]));
  const edit = s => openModal(({ close }) => <SpecModal s={s} close={close} done={reload} />);
  const remove = async id => {
    if (!await confirmDialog('این تخصص حذف شود؟', { danger: true, ok: 'حذف' })) return;
    try { await del('/admin/specialties/' + id); toast('حذف شد.', 'success'); await refreshMeta(); reload(); } catch (err) { toast(err.message, 'error'); }
  };
  return <>
    <div className="page-head"><div><h1>تخصص‌های پزشکی</h1><p>{fa(res.data.length)} تخصص</p></div><button className="btn" onClick={() => edit(null)}><Icon name="plus" size="sm" /> تخصص جدید</button></div>
    <div className="grid g4">{res.data.map(s => (
      <div key={s.id} className="card pad" style={s.active === false ? { opacity: 0.55 } : undefined}>
        <div className="row between"><div className="ic blue" style={{ width: 50, height: 50, borderRadius: 14, display: 'grid', placeItems: 'center' }}><Icon name={SPEC_ICON(s.icon)} size="lg" /></div>
          <div className="row" style={{ gap: 4 }}><button className="btn xs ghost" onClick={() => edit(s)}><Icon name="edit" size="sm" /></button><button className="btn xs danger-soft" onClick={() => remove(s.id)}><Icon name="trash" size="sm" /></button></div></div>
        <h3 className="mt2" style={{ fontSize: 16 }}>{s.name}</h3><p className="small t2">{s.description || ''}</p>
        <div className="row between mt1"><span className="badge blue">{fa(counts[s.id] || 0)} پزشک</span>{s.active === false && <span className="badge red">غیرفعال</span>}</div>
      </div>))}</div>
  </>;
}
function SpecModal({ s, close, done }) {
  const [busy, save] = useSave('spcf', x => (s ? put('/admin/specialties/' + s.id, x) : post('/admin/specialties', x)), { close, done });
  return (
    <Modal title={s ? 'ویرایش تخصص' : 'تخصص جدید'} onClose={close} footer={<FormFooter close={close} busy={busy} onSave={save} />}>
      <form id="spcf" className="col" style={{ gap: 14 }} onSubmit={e => e.preventDefault()}>
        <div className="field"><label>نام تخصص</label><input className="input" name="name" defaultValue={s?.name || ''} /></div>
        <div className="field"><label>توضیحات</label><input className="input" name="description" defaultValue={s?.description || ''} /></div>
        <div className="field"><label>آیکن</label><div className="chips-select">{SPEC_ICONS.map(i => <label key={i}><input type="radio" name="icon" value={i} defaultChecked={(s?.icon || 'stethoscope') === i} /><span style={{ padding: 8 }}><Icon name={i} /></span></label>)}</div></div>
        {s && <label className="check"><input type="checkbox" name="active" defaultChecked={s.active !== false} /> فعال</label>}
      </form>
    </Modal>
  );
}

/* ======================= مراکز درمانی ======================= */
export function Centers() {
  const { refreshMeta } = useApp();
  const res = useAsync(() => get('/admin/centers'), []);
  const reload = () => res.reload({ silent: true });
  if (!res.data) return <Loader />;
  const edit = c => openModal(({ close }) => <CenterModal c={c} close={close} done={reload} />);
  const remove = async id => {
    if (!await confirmDialog('این مرکز حذف شود؟', { danger: true, ok: 'حذف' })) return;
    try { await del('/admin/centers/' + id); toast('حذف شد.', 'success'); await refreshMeta(); reload(); } catch (err) { toast(err.message, 'error'); }
  };
  return <>
    <div className="page-head"><div><h1>مراکز درمانی</h1><p>{fa(res.data.length)} مرکز</p></div><button className="btn" onClick={() => edit(null)}><Icon name="plus" size="sm" /> مرکز جدید</button></div>
    <div className="grid g3">{res.data.map(c => (
      <div key={c.id} className="card pad" style={c.active === false ? { opacity: 0.55 } : undefined}>
        <div className="row"><div className="avatar sq" style={{ background: c.color || 'var(--primary)' }}><Icon name="building" /></div><div className="grow"><b>{c.name}</b><div className="small muted">{c.type} • {c.city}</div></div>
          <button className="btn xs ghost" onClick={() => edit(c)}><Icon name="edit" size="sm" /></button><button className="btn xs danger-soft" onClick={() => remove(c.id)}><Icon name="trash" size="sm" /></button></div>
        <p className="small t2 mt2"><Icon name="pin" size="sm" /> {c.address}</p><p className="small t2 ltr" style={{ textAlign: 'right' }}><Icon name="phone" size="sm" /> {fa(c.phone || '')}</p>
        <div className="row wrap mt1" style={{ gap: 6 }}>{(c.facilities || []).map(f => <span key={f} className="chip" style={{ padding: '2px 10px', fontSize: 12 }}>{f}</span>)}</div>
        <a href={`#/display/${c.id}`} target="_blank" className="btn sm ghost block mt2"><Icon name="tv" size="sm" /> نمایشگر صف</a>
      </div>))}</div>
  </>;
}
function CenterModal({ c, close, done }) {
  const [busy, save] = useSave('cntf', x => (c ? put('/admin/centers/' + c.id, x) : post('/admin/centers', x)), { close, done, transform: x => ({ ...x, facilities: splitList(x.facilities) }) });
  return (
    <Modal title={c ? 'ویرایش مرکز' : 'مرکز جدید'} size="lg" onClose={close} footer={<FormFooter close={close} busy={busy} onSave={save} />}>
      <form id="cntf" className="form-grid" onSubmit={e => e.preventDefault()}>
        <div className="field"><label>نام مرکز *</label><input className="input" name="name" defaultValue={c?.name || ''} /></div>
        <div className="field"><label>نوع *</label><select className="select" name="type" defaultValue={c?.type}>{['بیمارستان', 'کلینیک', 'درمانگاه', 'مطب', 'مرکز تصویربرداری'].map(t => <option key={t}>{t}</option>)}</select></div>
        <div className="field"><label>شهر *</label><input className="input" name="city" defaultValue={c?.city || ''} /></div>
        <div className="field"><label>تلفن</label><input className="input ltr" name="phone" defaultValue={c?.phone || ''} /></div>
        <div className="field full"><label>آدرس *</label><input className="input" name="address" defaultValue={c?.address || ''} /></div>
        <div className="field full"><label>امکانات (با کاما جدا کنید)</label><input className="input" name="facilities" defaultValue={(c?.facilities || []).join('، ')} /></div>
        <div className="field"><label>رنگ شاخص</label><input className="input" type="color" name="color" defaultValue={c?.color || '#2563eb'} style={{ padding: 4 }} /></div>
        {c && <label className="check"><input type="checkbox" name="active" defaultChecked={c.active !== false} /> فعال</label>}
        <div className="field full"><label>توضیحات</label><textarea className="textarea" name="description" defaultValue={c?.description || ''} /></div>
      </form>
    </Modal>
  );
}
