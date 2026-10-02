// ابزارهای مشترک پنل پزشک و مدیر: پرونده‌ی ویزیت، سوابق بیمار، نوبت حضوری، مدیریت برنامه‌ی کاری
import { useEffect, useState } from 'react';
import { get, post, put, del } from '../../lib/api.js';
import * as J from '../../lib/jalali.js';
import { fa, formData, PRIO, PRIO_CHOICES } from '../../lib/format.js';
import { useAsync, useBusy } from '../../lib/hooks.js';
import { Icon, Avatar, StatusBadge, PrioBadge, Loader, Spinner, ErrorBox } from '../../components/ui.jsx';
import { toast, openModal, Modal, confirmDialog } from '../../components/overlay.jsx';
import { DateField } from '../../components/shared.jsx';

export const ageTxt = p => (p?.age != null ? fa(p.age) + ' ساله' : '');
const toMin = t => +t.slice(0, 2) * 60 + +t.slice(3);

/* ---------------- پرونده‌ی ویزیت ---------------- */
export function openVisit(a, done) { openModal(({ close }) => <VisitModal a={a} close={close} done={done} />); }
function VisitModal({ a, close, done }) {
  const [busy, run] = useBusy();
  const save = finish => run(async () => {
    try {
      await put(`/dr/appointments/${a.id}/visit`, { ...formData(document.getElementById('vf')), finish });
      close();
      toast(finish ? 'ویزیت به پایان رسید و پرونده برای بیمار ارسال شد.' : 'پرونده ذخیره شد.', 'success');
      done && done();
    } catch (err) { toast(err.message, 'error'); }
  });
  return (
    <Modal size="lg" onClose={close} title={<><Icon name="file" /> پرونده‌ی ویزیت — {a.patient?.name}</>}
      footer={<><button className="btn ghost" disabled={busy} onClick={() => save(false)}><Icon name="check" size="sm" /> ذخیره</button>
        {a.status !== 'done' && <button className="btn success" disabled={busy} onClick={() => save(true)}>{busy ? <Spinner /> : <><Icon name="check-circle" size="sm" /> ذخیره و پایان ویزیت</>}</button>}</>}>
      <div className="row wrap mb2" style={{ gap: 8 }}>
        <span className="chip"><Icon name="calendar" size="sm" />{J.withDay(a.date)} {fa(a.time)}</span>
        <span className="chip"><Icon name="user" size="sm" />{ageTxt(a.patient) || 'سن نامشخص'}</span>
        <span className="chip"><Icon name="shield" size="sm" />{a.patient?.insurance || 'آزاد'}</span>
        <PrioBadge p={a.priority} />{a.reason && <span className="chip">علت: {a.reason}</span>}
      </div>
      <form id="vf" className="form-grid" onSubmit={e => e.preventDefault()}>
        <div className="field full"><label>تشخیص</label><input className="input" name="diagnosis" defaultValue={a.diagnosis || ''} placeholder="مثلاً: فشار خون بالا" /></div>
        <div className="field full"><label>نسخه (هر دارو در یک خط)</label><textarea className="textarea" name="prescription" rows={4} placeholder="آملودیپین ۵ میلی‌گرم – روزی یک عدد" defaultValue={(a.prescription || []).join('\n')} /></div>
        <div className="field full"><label>توضیحات و توصیه‌ها</label><textarea className="textarea" name="note" defaultValue={a.note || ''} /></div>
        <div className="field"><label>تاریخ مراجعه‌ی بعدی</label><DateField name="followUp" defaultValue={a.followUp || ''} min={J.ymd()} /></div>
      </form>
    </Modal>
  );
}

/* ---------------- سوابق بیمار ---------------- */
export function openHistory(id) { openModal(({ close }) => <HistoryModal id={id} close={close} />); }
function HistoryModal({ id, close }) {
  const res = useAsync(() => get('/dr/patients/' + id), [id]);
  const r = res.data, p = r?.patient;
  return (
    <Modal title="سوابق بیمار" size="lg" onClose={close}>
      {res.error ? <ErrorBox error={res.error} /> : !r ? <Loader /> : <>
        <div className="row wrap" style={{ gap: 16 }}><Avatar name={p.name} size="lg" />
          <div className="grow"><h3>{p.name}</h3><div className="small t2">{fa(p.mobile)} • {ageTxt(p)} • {p.insurance || 'آزاد'}</div></div>
          {p.bloodType && <span className="badge red"><Icon name="drop" size="sm" /> {p.bloodType}</span>}
          {p.allergies && <span className="badge orange">حساسیت: {p.allergies}</span>}
        </div>
        <div className="divider" />
        <div className="timeline">{r.history.map(a => (
          <div key={a.id} className="tl-item">
            <div className="row between"><b className="small">{J.withDay(a.date, true)} — {fa(a.time)}</b><StatusBadge status={a.status} /></div>
            {a.diagnosis && <div className="small mt1"><span className="badge cyan">تشخیص</span> {a.diagnosis}</div>}
            {a.prescription?.length > 0 && <ul className="rx mt1">{a.prescription.map((x, i) => <li key={i}><Icon name="pill" size="sm" />{x}</li>)}</ul>}
            {a.note && <p className="small t2 mt1">{a.note}</p>}
          </div>))}</div>
      </>}
    </Modal>
  );
}

/* ---------------- تغییر اولویت ---------------- */
export function openPriority(id, done) { openModal(({ close }) => <PrioModal id={id} close={close} done={done} />); }
function PrioModal({ id, close, done }) {
  const [p, setP] = useState(null);
  const save = async () => { if (!p) return; await post(`/dr/appointments/${id}/priority`, { priority: p }); close(); toast('اولویت به‌روز شد و ترتیب صف بازمحاسبه گردید.', 'success'); done(); };
  return (
    <Modal title="تغییر اولویت بیمار" size="sm" onClose={close} footer={<button className="btn" onClick={save}>ثبت</button>}>
      <div className="chips-select">{Object.entries(PRIO).map(([k, v]) => <label key={k}><input type="radio" name="p" checked={p === k} onChange={() => setP(k)} /><span><Icon name={v[2]} size="sm" />{v[0]}</span></label>)}</div>
    </Modal>
  );
}

/* ---------------- نوبت حضوری / تلفنی ---------------- */
export function openWalkin(doctorId, done, doctors = null) { openModal(({ close }) => <WalkinModal {...{ doctorId, done, doctors, close }} />); }
function WalkinModal({ doctorId, done, doctors, close }) {
  const [docId, setDocId] = useState(doctors ? doctors[0]?.id : doctorId);
  const [date, setDate] = useState(J.ymd());
  const [time, setTime] = useState('');
  const [day, setDay] = useState(null);
  const [busy, run] = useBusy();
  useEffect(() => {
    setDay(null); setTime('');
    let alive = true;
    get(`/doctors/${docId}/slots`, { date }).then(r => alive && setDay(r)).catch(() => alive && setDay({ slots: [] }));
    return () => { alive = false; };
  }, [docId, date]);
  const save = () => run(async () => {
    const d = formData(document.getElementById('walkf'));
    if (!time) return toast('ساعت نوبت را انتخاب کنید.', 'warn');
    try { const a = await post('/appointments', { ...d, date, time, doctorId: docId }); close(); toast(`نوبت ثبت شد. کد رهگیری: ${fa(a.code)}`, 'success', 7000); done && done(); } catch (err) { toast(err.message, 'error'); }
  });
  return (
    <Modal size="lg" onClose={close} title={<><Icon name="user-plus" /> ثبت نوبت حضوری / تلفنی</>}
      footer={<><button className="btn ghost" onClick={close}>انصراف</button><button className="btn" disabled={busy} onClick={save}>{busy ? <Spinner /> : <><Icon name="check" size="sm" /> ثبت نوبت</>}</button></>}>
      <form id="walkf" className="form-grid" onSubmit={e => e.preventDefault()}>
        {doctors && <div className="field full"><label>پزشک</label><select className="select" value={docId} onChange={e => setDocId(+e.target.value)}>{doctors.map(d => <option key={d.id} value={d.id}>{d.name} — {d.specialty}</option>)}</select></div>}
        <div className="field"><label>موبایل بیمار</label><input className="input ltr" name="patientMobile" placeholder="09xxxxxxxxx" required /></div>
        <div className="field"><label>نام بیمار (در صورت جدید بودن)</label><input className="input" name="patientName" /></div>
        <div className="field"><label>تاریخ</label><DateField value={date} onChange={setDate} min={J.ymd()} /></div>
        <div className="field"><label>اولویت</label><select className="select" name="priority" defaultValue="normal">{PRIO_CHOICES.map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</select></div>
        <div className="field full"><label>ساعت</label><div className="slots">
          {!day ? <Spinner /> : day.leave ? <span className="small muted">پزشک در مرخصی است</span> : day.slots.length ? day.slots.map(s => (
            <button type="button" key={s.time + s.centerName} className={`slot ${s.free ? '' : 'taken'} ${time === s.time ? 'sel' : ''}`} disabled={!s.free} onClick={() => setTime(s.time)}>{fa(s.time)}{s.capacity > 1 && <small>{fa(s.free)} خالی</small>}</button>
          )) : <span className="small muted">زمان آزادی در این روز نیست</span>}
        </div></div>
        <div className="field full"><label>علت مراجعه</label><input className="input" name="reason" /></div>
      </form>
    </Modal>
  );
}

/* ---------------- مدیریت برنامه‌ی کاری و مرخصی ---------------- */
/** اگر سرور به‌خاطر نوبت‌های تحت تأثیر 409 برگرداند، از کاربر تأیید گرفته و با force دوباره ارسال می‌شود */
async function withForce(fn) {
  try { return await fn(false); } catch (err) {
    if (err.status === 409 && err.data?.affected) {
      if (!await confirmDialog(<>{err.message}<br /><b>آیا ادامه می‌دهید؟</b></>, { title: 'نوبت‌های تحت تأثیر', danger: true, ok: 'بله، ادامه بده' })) return null;
      return await fn(true);
    }
    throw err;
  }
}
const slotsOf = s => Math.floor((toMin(s.end) - toMin(s.start)) / s.slotMinutes) * s.capacity;

export function ScheduleManager({ doctorId = null, centers }) {
  const q = doctorId ? { doctorId } : {};
  const res = useAsync(() => get('/dr/schedules', q), [doctorId]);
  if (res.error) return <ErrorBox error={res.error} retry={res.reload} />;
  if (!res.data) return <Loader />;
  const r = res.data;
  const reload = () => res.reload({ silent: true });
  const cs = centers.filter(c => r.centerIds.includes(c.id));
  const weekCap = r.schedules.filter(s => s.active !== false).reduce((a, s) => a + slotsOf(s), 0);
  const shift = s => openModal(({ close }) => <ShiftModal s={s} cs={cs} doctorId={doctorId} close={close} done={reload} />);
  const leave = () => openModal(({ close }) => <LeaveModal doctorId={doctorId} close={close} done={reload} />);
  const delLeave = async id => {
    if (!await confirmDialog('مرخصی حذف شود؟ روزهای آن دوباره برای رزرو باز می‌شوند.', { danger: true, ok: 'حذف' })) return;
    await del('/dr/leaves/' + id); toast('مرخصی حذف شد.', 'success'); reload();
  };
  return <>
    <div className="row between wrap mb2"><div className="small t2"><Icon name="info" size="sm" /> ظرفیت هفتگی: <b>{fa(weekCap)} نوبت</b> در {fa(r.schedules.length)} شیفت</div><button className="btn" onClick={() => shift(null)}><Icon name="plus" size="sm" /> افزودن شیفت</button></div>
    <div className="card mb3"><div className="card-b"><div className="week-table" style={{ alignItems: 'start' }}>{J.WEEK_ORDER.map(w => {
      const list = r.schedules.filter(s => s.weekday === w).sort((a, b) => a.start.localeCompare(b.start));
      return <div key={w} className={`d ${list.length ? 'on' : ''}`} style={{ minHeight: 130 }}><b>{J.WEEKDAYS[w]}</b>
        {list.length ? list.map(s => (
          <div key={s.id} className="card" onClick={() => shift(s)} style={{ padding: 8, marginTop: 6, textAlign: 'right', cursor: 'pointer', opacity: s.active === false ? 0.5 : 1 }}>
            <div className="semi ltr" style={{ textAlign: 'right' }}>{fa(s.start)} - {fa(s.end)}</div><div className="xs muted">{s.centerName}</div>
            <div className="xs">{fa(s.slotMinutes)}′ • ظرفیت {fa(s.capacity)} • {fa(slotsOf(s))} نوبت</div>
            {s.booked > 0 && <span className="badge blue" style={{ fontSize: 10.5 }}>{fa(s.booked)} رزرو آینده</span>}
          </div>)) : <div className="muted xs mt1">بدون شیفت</div>}
      </div>;
    })}</div></div></div>
    <div className="card"><div className="card-h"><h3><Icon name="calendar" /> مرخصی‌ها و روزهای تعطیل</h3><button className="btn sm soft" onClick={leave}><Icon name="plus" size="sm" /> ثبت مرخصی</button></div>
      <div className="table-wrap"><table className="table"><thead><tr><th>از تاریخ</th><th>تا تاریخ</th><th>مدت</th><th>علت</th><th></th></tr></thead><tbody>
        {r.leaves.length ? r.leaves.map(l => (
          <tr key={l.id}><td>{J.withDay(l.from, true)}</td><td>{J.withDay(l.to, true)}</td><td>{fa(J.diffDays(l.from, l.to) + 1)} روز</td><td>{l.reason || '—'}</td>
            <td className="actions">{l.to >= J.ymd() ? <button className="btn xs danger-soft" onClick={() => delLeave(l.id)}><Icon name="trash" size="sm" /></button> : <span className="badge">گذشته</span>}</td></tr>))
          : <tr><td colSpan={5} className="muted small" style={{ textAlign: 'center' }}>مرخصی ثبت نشده است.</td></tr>}
      </tbody></table></div></div>
  </>;
}

function ShiftModal({ s, cs, doctorId, close, done }) {
  const [f, setF] = useState({ weekday: s?.weekday ?? 6, centerId: s?.centerId ?? cs[0]?.id, start: s?.start || '09:00', end: s?.end || '13:00', slotMinutes: s?.slotMinutes || 20, capacity: s?.capacity || 1, active: s ? s.active !== false : true });
  const set = k => e => setF(x => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const [busy, run] = useBusy();
  const n = Math.max(0, Math.floor((toMin(f.end) - toMin(f.start)) / +f.slotMinutes)) * +f.capacity || 0;
  const payload = () => { const d = { ...f }; if (!s) delete d.active; if (doctorId) d.doctorId = doctorId; return d; };
  const save = () => run(async () => {
    try {
      const r = await withForce(force => (s ? put('/dr/schedules/' + s.id, { ...payload(), force }) : post('/dr/schedules', payload())));
      if (r) { close(); toast('شیفت ذخیره شد.', 'success'); done(); }
    } catch (err) { toast(err.message, 'error'); }
  });
  const remove = () => run(async () => {
    try {
      const r = await withForce(force => del('/dr/schedules/' + s.id, { force }));
      if (r) { close(); toast(`شیفت حذف شد${r.cancelled ? ` و ${fa(r.cancelled)} نوبت لغو گردید` : ''}.`, 'success'); done(); }
    } catch (err) { toast(err.message, 'error'); }
  });
  return (
    <Modal title={s ? 'ویرایش شیفت' : 'افزودن شیفت جدید'} onClose={close}
      footer={<>{s && <button className="btn danger-soft" disabled={busy} onClick={remove} style={{ marginInlineEnd: 'auto' }}><Icon name="trash" size="sm" /> حذف شیفت</button>}
        <button className="btn ghost" onClick={close}>انصراف</button><button className="btn" disabled={busy} onClick={save}>{busy ? <Spinner /> : <><Icon name="check" size="sm" /> ذخیره</>}</button></>}>
      <div className="form-grid">
        <div className="field"><label>روز هفته</label><select className="select" value={f.weekday} onChange={set('weekday')}>{J.WEEK_ORDER.map(w => <option key={w} value={w}>{J.WEEKDAYS[w]}</option>)}</select></div>
        <div className="field"><label>مرکز درمانی</label><select className="select" value={f.centerId} onChange={set('centerId')}>{cs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="field"><label>ساعت شروع</label><input className="input ltr" type="time" value={f.start} onChange={set('start')} required /></div>
        <div className="field"><label>ساعت پایان</label><input className="input ltr" type="time" value={f.end} onChange={set('end')} required /></div>
        <div className="field"><label>مدت هر نوبت (دقیقه)</label><select className="select" value={f.slotMinutes} onChange={set('slotMinutes')}>{[10, 15, 20, 30, 45, 60].map(x => <option key={x} value={x}>{x}</option>)}</select></div>
        <div className="field"><label>ظرفیت هر نوبت (نفر)</label><input className="input ltr" type="number" min="1" max="10" value={f.capacity} onChange={set('capacity')} /></div>
        {s && <label className="check full"><input type="checkbox" checked={f.active} onChange={set('active')} /> شیفت فعال است</label>}
        <div className="full alert info"><Icon name="info" size="sm" /><div>این شیفت <b>{fa(n)} نوبت</b> در هر {J.WEEKDAYS[+f.weekday]} ایجاد می‌کند. سیستم از تداخل با سایر شیفت‌های شما (حتی در مراکز دیگر) جلوگیری می‌کند.</div></div>
      </div>
    </Modal>
  );
}

function LeaveModal({ doctorId, close, done }) {
  const [busy, run] = useBusy();
  const save = () => run(async () => {
    const d = formData(document.getElementById('lvf'));
    if (doctorId) d.doctorId = doctorId;
    try {
      const r = await withForce(force => post('/dr/leaves', { ...d, force }));
      if (r) { close(); toast(`مرخصی ثبت شد${r.cancelled ? ` و ${fa(r.cancelled)} نوبت لغو و اطلاع‌رسانی شد` : ''}.`, 'success'); done(); }
    } catch (err) { toast(err.message, 'error'); }
  });
  return (
    <Modal title="ثبت مرخصی" onClose={close} footer={<><button className="btn ghost" onClick={close}>انصراف</button><button className="btn" disabled={busy} onClick={save}>{busy ? <Spinner /> : 'ثبت مرخصی'}</button></>}>
      <form id="lvf" className="form-grid" onSubmit={e => e.preventDefault()}>
        <div className="field"><label>از تاریخ</label><DateField name="from" defaultValue={J.ymd()} min={J.ymd()} /></div>
        <div className="field"><label>تا تاریخ</label><DateField name="to" defaultValue={J.ymd()} min={J.ymd()} /></div>
        <div className="field full"><label>علت (نمایش به بیماران)</label><input className="input" name="reason" placeholder="مثلاً: شرکت در کنگره" /></div>
        <div className="full alert warn"><Icon name="alert" size="sm" /><div className="small">در صورت وجود نوبت در این بازه، نوبت‌ها لغو و به بیماران پیامک همراه با <b>پیشنهاد نزدیک‌ترین زمان آزاد</b> ارسال می‌شود.</div></div>
      </form>
    </Modal>
  );
}
