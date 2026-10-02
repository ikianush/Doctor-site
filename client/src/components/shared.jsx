// کامپوننت‌های مشترک صفحات: کارت پزشک و مرکز، ویجت رزرو، رسید نوبت، انتخابگر تاریخ شمسی
import { useEffect, useState } from 'react';
import { useApp } from '../lib/app.jsx';
import { get, post } from '../lib/api.js';
import * as J from '../lib/jalali.js';
import { fa, money, PRIO_CHOICES, SPEC_ICON } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { useBusy } from '../lib/hooks.js';
import { Icon, Avatar, RatingPill, StatusBadge, PrioBadge, Loader, Empty, Barcode, SubmitButton, AsyncButton } from './ui.jsx';
import { toast, openModal, Modal } from './overlay.jsx';

/* ======================= کارت‌ها ======================= */
export function Earliest({ e }) {
  if (!e) return <div className="earliest none"><Icon name="calendar" size="sm" /> فعلاً نوبت خالی ندارد — عضویت در صف انتظار</div>;
  return <div className="earliest"><Icon name="zap" size="sm" /> اولین نوبت خالی: <b>{J.relative(e.date)}</b> ساعت {fa(e.time)}</div>;
}

export function DoctorCard({ d }) {
  return (
    <a href={`#/doctor/${d.id}`} className="doc-card">
      <div className="row top">
        <Avatar name={d.name} size="lg" verified={d.verified} />
        <div className="grow">
          <h3>{d.name}</h3>
          <div className="small t2">{d.degree}</div>
          <div className="row mt1" style={{ gap: 8 }}><RatingPill rating={d.rating} count={d.reviewCount} /><span className="badge blue"><Icon name={SPEC_ICON(d.specialtyIcon)} size="sm" />{d.specialty}</span></div>
        </div>
      </div>
      <div className="meta">
        <span><Icon name="pin" size="sm" />{d.centers.map(c => c.name).join('، ')}</span>
        <span><Icon name="award" size="sm" />{fa(d.experience)} سال سابقه</span>
        <span><Icon name="users" size="sm" />{fa(d.visits)} ویزیت موفق</span>
      </div>
      <Earliest e={d.earliest} />
    </a>
  );
}

const chipSm = { padding: '2px 10px', fontSize: 12 };
export function DoctorRow({ d }) {
  return (
    <div className="doc-card"><div className="doc-row">
      <Avatar name={d.name} size="lg" verified={d.verified} />
      <div className="grow">
        <div className="row wrap" style={{ gap: 8 }}><h3>{d.name}</h3><RatingPill rating={d.rating} count={d.reviewCount} />{!d.accepting && <span className="badge red">عدم پذیرش</span>}</div>
        <div className="small t2">{d.degree} • <span className="semi" style={{ color: 'var(--primary)' }}>{d.specialty}</span> • کد نظام پزشکی <span className="ltr">{fa(d.medicalCode)}</span></div>
        <div className="meta mt1">
          <span><Icon name="pin" size="sm" />{d.city} — {d.centers.map(c => c.name).join('، ')}</span>
          <span><Icon name="award" size="sm" />{fa(d.experience)} سال سابقه</span>
          <span><Icon name="wallet" size="sm" />ویزیت {money(d.fee)}</span>
        </div>
        <div className="row wrap mt1" style={{ gap: 6 }}>
          {(d.insurances || []).slice(0, 4).map(i => <span key={i} className="chip" style={chipSm}>{i}</span>)}
          {d.insurances?.length > 4 && <span className="chip" style={chipSm}>+{fa(d.insurances.length - 4)}</span>}
        </div>
      </div>
      <div className="col" style={{ minWidth: 230 }}>
        <Earliest e={d.earliest} />
        <a href={`#/doctor/${d.id}`} className="btn"><Icon name="calendar" size="sm" /> دریافت نوبت</a>
      </div>
    </div></div>
  );
}

export function CenterCard({ c }) {
  return (
    <a href={`#/center/${c.id}`} className="card pad hover-lift" style={{ display: 'block', transition: '.2s' }}>
      <div className="row"><div className="avatar sq" style={{ background: c.color || 'var(--primary)' }}><Icon name="building" /></div><div className="grow"><b>{c.name}</b><div className="small muted">{c.type} • {c.city}</div></div></div>
      <p className="small t2 mt2"><Icon name="pin" size="sm" /> {c.address}</p>
      <div className="row wrap mt1" style={{ gap: 6 }}>{(c.facilities || []).slice(0, 3).map(f => <span key={f} className="chip" style={chipSm}>{f}</span>)}</div>
      <div className="row between mt2 small"><span className="t2"><Icon name="users" size="sm" /> {fa(c.doctorCount ?? '')} پزشک فعال</span><span style={{ color: 'var(--primary)' }} className="semi">مشاهده <Icon name="arrow-left" size="sm" /></span></div>
    </a>
  );
}

export function QueueLive({ q }) {
  if (q.state === 'in_visit') return <div className="queue-live"><span className="badge teal pulse"><span className="dot" />نوبت شماست</span><b>لطفاً به اتاق پزشک مراجعه کنید</b></div>;
  return (
    <div className="queue-live"><Icon name="queue" />
      <span>شماره‌ی نوبت شما: <b>{fa(q.turn)}</b></span><span>در حال ویزیت: <b>{q.current ? fa(q.current) : '—'}</b></span>
      <span>نفرات جلوتر: <b>{fa(q.ahead)}</b></span><span>انتظار تقریبی: <b>~{fa(q.eta)} دقیقه</b></span>
      {q.state === 'checked_in' && <span className="badge purple">پذیرش شده</span>}
    </div>
  );
}

/* ======================= تقویم شلوغی ======================= */
function loadClass(c) {
  if (c.leave) return 'leave';
  if (c.off) return 'dis';
  if (c.free === 0) return 'full';
  if (c.load >= 0.8) return 'high';
  if (c.load >= 0.5) return 'mid';
  return 'low';
}
const WeekHead = () => J.WEEK_ORDER.map(w => <div key={'w' + w} className="wd">{J.WD_SHORT[w]}</div>);
const Blanks = ({ n }) => Array.from({ length: n }, (_, i) => <div key={'b' + i} className="cal-day blank" />);

export function LoadCalendar({ days, selected, monthOffset, onMonth, onPick }) {
  const byDate = Object.fromEntries(days.map(d => [d.date, d]));
  const today = J.ymd();
  const t = J.jOf(today);
  let jy = t.jy, jm = t.jm + monthOffset;
  while (jm > 12) { jm -= 12; jy++; }
  const first = J.fromJ(jy, jm, 1);
  const len = J.monthLength(jy, jm);
  const lead = J.WEEK_ORDER.indexOf(J.weekday(first));
  const lastDay = days[days.length - 1]?.date;
  const canNext = lastDay && lastDay >= J.fromJ(jm === 12 ? jy + 1 : jy, jm === 12 ? 1 : jm + 1, 1);
  const cells = [];
  for (let d = 1; d <= len; d++) {
    const date = J.fromJ(jy, jm, d);
    const c = byDate[date];
    const pickable = c && !c.off && !c.leave;
    const sub = !c ? '' : c.leave ? 'مرخصی' : c.off ? '' : c.free === 0 ? 'تکمیل' : fa(c.free) + ' خالی';
    cells.push(<div key={date} className={`cal-day ${c ? loadClass(c) : 'dis'} ${date === selected ? 'sel' : ''} ${date === today ? 'today' : ''}`} title={c?.leave || ''} onClick={pickable ? () => onPick(date) : undefined}>{fa(d)}<small>{sub}</small></div>);
  }
  return (
    <div className="cal">
      <div className="cal-head">
        <button className="btn icon-only sm ghost" disabled={monthOffset <= 0} onClick={() => onMonth(-1)}><Icon name="chev-right" /></button>
        <b>{J.MONTHS[jm - 1]} {fa(jy)}</b>
        <button className="btn icon-only sm ghost" disabled={!canNext} onClick={() => onMonth(1)}><Icon name="chev-left" /></button>
      </div>
      <div className="cal-grid"><WeekHead /><Blanks n={lead} />{cells}</div>
      <div className="legend mt2">
        <span><i style={{ background: 'var(--success-50)', border: '1px solid var(--success)' }} />خلوت</span>
        <span><i style={{ background: 'var(--warning-50)', border: '1px solid var(--warning)' }} />متوسط</span>
        <span><i style={{ background: '#ffe8d9', border: '1px solid #c2410c' }} />شلوغ</span>
        <span><i style={{ background: 'var(--danger-50)', border: '1px solid var(--danger)' }} />تکمیل (صف انتظار)</span>
      </div>
    </div>
  );
}

/* ======================= ویجت رزرو نوبت ======================= */
const monthOffsetOf = date => { const a = J.jOf(J.ymd()), b = J.jOf(date); return (b.jy - a.jy) * 12 + b.jm - a.jm; };
const partOf = time => (time < '12:00' ? 'صبح' : time < '16:00' ? 'ظهر' : 'عصر');

/**
 * ویجت کامل رزرو: تقویم ← انتخاب ساعت ← تأیید ← رسید
 * reschedule: نوبت فعلی (برای جابه‌جایی) ، onDone: پس از ثبت
 */
export function BookingWidget({ doctor, reschedule, onDone }) {
  const { meta, user } = useApp();
  const [days, setDays] = useState(null);
  const [month, setMonth] = useState(0);
  const [date, setDate] = useState(null);
  const [day, setDay] = useState(null); // {slots, leave, waitCount}
  const [slot, setSlot] = useState(null);
  const [step, setStep] = useState(1);
  const [appt, setAppt] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [suggest, setSuggest] = useState(null); // {where, data}
  const [busy, run] = useBusy();

  async function loadDay(d) {
    setDay(null);
    if (!d) { setDay({ slots: [] }); return null; }
    const r = await get(`/doctors/${doctor.id}/slots`, { date: d });
    setDay(r);
    return r;
  }
  useEffect(() => {
    (async () => {
      const list = await get(`/doctors/${doctor.id}/calendar`, { days: meta.settings.bookingWindowDays });
      setDays(list);
      const d = list.find(x => x.free > 0)?.date || null;
      setDate(d);
      if (d) setMonth(monthOffsetOf(d));
      loadDay(d);
    })();
  }, [doctor.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function chooseSlot(s) {
    if (!user) {
      toast('برای ثبت نوبت ابتدا وارد حساب کاربری شوید.', 'warn');
      return navigate(`/login?next=${encodeURIComponent('/doctor/' + doctor.id)}`);
    }
    if (user.role !== 'patient' && !reschedule) return toast('رزرو آنلاین فقط برای حساب بیمار فعال است. پزشکان و مدیران از پنل خود نوبت حضوری ثبت می‌کنند.', 'warn');
    setSlot(s); setConflict(null); setStep(2);
  }
  function pickDate(d) { setDate(d); setSlot(null); setSuggest(null); loadDay(d); }
  async function pickSuggestion(d, time) {
    setDate(d); setMonth(monthOffsetOf(d)); setStep(1); setSuggest(null);
    const r = await loadDay(d);
    const s = r?.slots.find(x => x.time === time && x.free > 0);
    if (s) chooseSlot(s);
  }
  async function showSuggest(where, d, time) {
    setSuggest({ where, data: null });
    const data = await get(`/doctors/${doctor.id}/suggest`, { date: d, time });
    setSuggest({ where, data });
  }
  function submit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    run(async () => {
      try {
        const a = reschedule
          ? await post(`/appointments/${reschedule.id}/reschedule`, { date, time: slot.time })
          : await post('/appointments', { doctorId: doctor.id, date, time: slot.time, reason: fd.get('reason'), priority: fd.get('priority') });
        setAppt(a); setStep(3);
        onDone && onDone(a);
      } catch (err) {
        setConflict(err.message);
        showSuggest('conflict', date, slot.time);
      }
    });
  }

  if (!days) return <Loader pad={40} />;
  const suggestBox = where => suggest?.where === where && <SuggestBox data={suggest.data} onPick={pickSuggestion} />;
  const stepper = <div className="stepper">{[1, 2, 3].map(i => <div key={i} className={i <= step ? 'on' : ''} />)}</div>;

  if (step === 3) return <>{stepper}<BookingSuccess a={appt} re={!!reschedule} /></>;

  if (step === 2) return <>
    {stepper}
    <div className="alert info"><Icon name="calendar" /><div><b>{J.withDay(date, true)} — ساعت {fa(slot.time)}</b><p>{slot.centerName}</p></div></div>
    <form className="col mt2" style={{ gap: 16 }} onSubmit={submit}>
      {!reschedule && <>
        <div className="field"><label>علت مراجعه (اختیاری)</label><input className="input" name="reason" placeholder="مثلاً: چکاپ دوره‌ای، پیگیری آزمایش..." maxLength={200} /></div>
        <div className="field"><label>شرایط ویژه (اولویت‌بندی در صف)</label>
          <div className="chips-select">{PRIO_CHOICES.map(([k, v]) => <label key={k}><input type="radio" name="priority" value={k} defaultChecked={k === 'normal'} /><span><Icon name={v[2]} size="sm" />{v[0]}</span></label>)}</div>
          <span className="hint">بیماران اورژانسی، باردار، سالمند و دارای معلولیت در صف پذیرش و صف انتظار اولویت دارند. سالمندی به‌صورت خودکار از سن تشخیص داده می‌شود.</span>
        </div>
      </>}
      <div className="card pad" style={{ background: 'var(--surface-2)' }}>
        <div className="row between small"><span className="t2">پزشک</span><b>{doctor.name}</b></div>
        <div className="row between small mt1"><span className="t2">هزینه‌ی ویزیت</span><b>{money(doctor.fee)}</b></div>
        <div className="row between small mt1"><span className="t2">قانون لغو</span><span>تا {fa(meta.settings.cancelDeadlineHours)} ساعت قبل از نوبت</span></div>
      </div>
      <div className="row">
        <button type="button" className="btn ghost" onClick={() => { setStep(1); setConflict(null); }}><Icon name="arrow-right" size="sm" /> بازگشت</button>
        <SubmitButton busy={busy} className="btn grow"><Icon name="check" size="sm" /> {reschedule ? 'تأیید جابه‌جایی نوبت' : 'تأیید و ثبت نهایی نوبت'}</SubmitButton>
      </div>
    </form>
    {conflict && <><div className="alert error mt2"><Icon name="alert" /><div><b>{conflict}</b><p>می‌توانید یکی از زمان‌های پیشنهادی زیر را انتخاب کنید.</p></div></div><div className="mt1">{suggestBox('conflict')}</div></>}
  </>;

  return <>
    {stepper}
    <LoadCalendar days={days} selected={date} monthOffset={month} onMonth={d => setMonth(m => m + d)} onPick={pickDate} />
    <div className="divider" />
    <div>
      {!day ? <Loader pad={30} /> : <DaySlots date={date} day={day} slot={slot} onChoose={chooseSlot}
        waitlistCta={<div className="suggest-box mt2">
          <div className="row"><Icon name="hourglass" /><b>ظرفیت این روز تکمیل است</b></div>
          <p className="small t2 mt1">در صف انتظار ثبت‌نام کنید؛ با لغو هر نوبت، سیستم به‌صورت <b>خودکار</b> و بر اساس اولویت پزشکی، نوبت را برای شما رزرو می‌کند.{day.waitCount ? ` (${fa(day.waitCount)} نفر در صف)` : ''}</p>
          <div className="row wrap mt1"><button className="btn sm accent" onClick={() => joinWaitlistModal(doctor, date, user)}><Icon name="hourglass" size="sm" /> عضویت در صف انتظار</button><button className="btn sm ghost" onClick={() => showSuggest('wait', date, '10:00')}><Icon name="zap" size="sm" /> پیشنهاد هوشمند زمان</button></div>
          {suggestBox('wait')}
        </div>} />}
    </div>
    <div className="mt2 row"><button className="btn ghost sm" onClick={() => showSuggest('any', date || J.ymd(), slot?.time || '10:00')}><Icon name="zap" size="sm" /> پیشنهاد کم‌ترافیک‌ترین زمان‌ها</button></div>
    {suggestBox('any')}
  </>;
}

function DaySlots({ date, day, slot, onChoose, waitlistCta }) {
  if (!date) return <Empty title="روزی انتخاب نشده" text="از تقویم بالا یک روز را انتخاب کنید." icon="calendar" />;
  if (day.leave) return <div className="alert warn"><Icon name="alert" /><div>پزشک در این روز در مرخصی است.</div></div>;
  if (!day.slots.length) return <div className="alert info"><Icon name="info" /><div>برای این روز نوبت قابل رزروی باقی نمانده است.</div></div>;
  const groups = {};
  day.slots.forEach(s => { const k = s.centerName + '|' + partOf(s.time); (groups[k] = groups[k] || []).push(s); });
  const free = day.slots.filter(s => s.free > 0).length;
  return <>
    <div className="row between"><b>{J.withDay(date)}</b><span className={`badge ${free ? 'green' : 'red'}`}>{free ? fa(free) + ' زمان آزاد' : 'تکمیل ظرفیت'}</span></div>
    {Object.entries(groups).map(([k, list]) => {
      const [center, part] = k.split('|');
      return <div key={k}>
        <div className="slot-group-title"><Icon name={part === 'صبح' ? 'sun' : 'moon'} size="sm" /> {part} — {center}</div>
        <div className="slots">{list.map(s => (
          <button key={s.time + s.centerName} className={`slot ${s.free <= 0 ? 'taken' : ''} ${slot?.time === s.time ? 'sel' : ''}`} disabled={s.free <= 0} onClick={() => onChoose(s)}>
            {fa(s.time)}{s.capacity > 1 && <small>{fa(s.free)} از {fa(s.capacity)}</small>}
          </button>))}
        </div>
      </div>;
    })}
    {!free && waitlistCta}
  </>;
}

function SuggestBox({ data, onPick }) {
  if (!data) return <Loader pad={20} />;
  const tone = l => (l < 50 ? ['green', 'خلوت'] : l < 80 ? ['orange', 'متوسط'] : ['red', 'شلوغ']);
  return (
    <div className="suggest-box mt2">
      <div className="row"><Icon name="zap" /><b>زمان‌های پیشنهادی هوشمند</b></div>
      <p className="xs t2">بر اساس نزدیکی به زمان دلخواه شما و میزان خلوتی روز</p>
      {data.slots.length ? data.slots.map(s => (
        <div key={s.date + s.time} className="suggest-item" onClick={() => onPick(s.date, s.time)}>
          <span><Icon name="calendar" size="sm" /> {J.relative(s.date)} — ساعت <b>{fa(s.time)}</b></span>
          <span className={`badge ${tone(s.load)[0]}`}>{tone(s.load)[1]}</span>
        </div>)) : <p className="small mt1">زمان آزادی در روزهای نزدیک یافت نشد.</p>}
      {data.alternatives.length > 0 && <>
        <div className="mt2 small semi">پزشکان هم‌تخصص با نوبت خالی:</div>
        {data.alternatives.map(a => <a key={a.doctorId} className="suggest-item" href={`#/doctor/${a.doctorId}`}><span><Icon name="stethoscope" size="sm" /> {a.name}</span><span className="small">{J.relative(a.date)} {fa(a.time)}</span></a>)}
      </>}
    </div>
  );
}

function BookingSuccess({ a, re }) {
  return <>
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: 74, height: 74, borderRadius: '50%', background: 'var(--success-50)', color: 'var(--success)', display: 'grid', placeItems: 'center', margin: '0 auto 10px' }}><Icon name="check-circle" size="xl" /></div>
      <h3>{re ? 'نوبت با موفقیت جابه‌جا شد' : 'نوبت شما با موفقیت ثبت شد'}</h3><p className="small t2">پیامک تأیید و یادآوری برای شما ارسال خواهد شد.</p>
    </div>
    <div className="mt2"><Ticket a={a} /></div>
    <TicketActions a={a} className="row wrap mt2" />
    <a href="#/panel/appointments" className="btn block mt1"><Icon name="calendar" size="sm" /> مشاهده‌ی نوبت‌های من</a>
  </>;
}

/* ======================= صف انتظار ======================= */
export function joinWaitlistModal(doctor, date, user) {
  if (!user) { toast('برای عضویت در صف انتظار وارد شوید.', 'warn'); return navigate(`/login?next=${encodeURIComponent('/doctor/' + doctor.id)}`); }
  if (user.role !== 'patient') return toast('صف انتظار مخصوص بیماران است.', 'warn');
  openModal(({ close }) => <WaitlistModal doctor={doctor} date={date} close={close} />);
}
function WaitlistModal({ doctor, date, close }) {
  const [busy, run] = useBusy();
  const submit = e => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    run(async () => {
      try {
        const w = await post('/waitlist', { doctorId: doctor.id, date, ...fd });
        close();
        if (w.status === 'promoted') toast('ظرفیت آزاد بود و نوبت شما به‌صورت خودکار رزرو شد! 🎉', 'success', 7000);
        else toast(`در صف انتظار ثبت شدید. جایگاه شما: نفر ${fa(w.position)}`, 'success', 6000);
      } catch (err) { toast(err.message, 'error'); }
    });
  };
  return (
    <Modal title={<><Icon name="hourglass" /> عضویت در صف انتظار</>} onClose={close}
      footer={<><button className="btn ghost" onClick={close}>انصراف</button><SubmitButton form="wf" busy={busy} className="btn accent"><Icon name="check" size="sm" /> ثبت در صف</SubmitButton></>}>
      <div className="alert info"><Icon name="info" /><div><b>{doctor.name} — {J.withDay(date, true)}</b><p>به محض آزاد شدن ظرفیت (لغو نوبت دیگران)، نوبت به‌صورت خودکار برای شما رزرو و پیامک می‌شود. ترتیب صف بر اساس «اولویت پزشکی» و سپس «زمان ثبت» است.</p></div></div>
      <form id="wf" className="col mt2" style={{ gap: 14 }} onSubmit={submit}>
        <div className="field"><label>شرایط ویژه</label><div className="chips-select">{PRIO_CHOICES.map(([k, v]) => <label key={k}><input type="radio" name="priority" value={k} defaultChecked={k === 'normal'} /><span>{v[0]}</span></label>)}</div></div>
        <div className="form-grid"><div className="field"><label>از ساعت (اختیاری)</label><input className="input ltr" name="fromTime" type="time" /></div><div className="field"><label>تا ساعت (اختیاری)</label><input className="input ltr" name="toTime" type="time" /></div></div>
        <div className="field"><label>توضیحات</label><input className="input" name="note" placeholder="مثلاً: ترجیحاً ساعات صبح" /></div>
      </form>
    </Modal>
  );
}

/* ======================= رسید نوبت ======================= */
export function Ticket({ a }) {
  const { siteName } = useApp();
  return (
    <div className="ticket print-area">
      <div className="row between"><b>{siteName} | رسید نوبت</b><StatusBadge status={a.status} /></div>
      <div style={{ textAlign: 'center' }} className="mt1"><div className="xs muted">کد رهگیری</div><div className="code" style={{ fontSize: 26 }}>{fa(a.code)}</div><Barcode code={a.code} /></div>
      <div className="ticket-row"><span>پزشک</span><b>{a.doctorName}</b></div>
      <div className="ticket-row"><span>تخصص</span><b>{a.specialty || ''}</b></div>
      <div className="ticket-row"><span>تاریخ</span><b>{J.withDay(a.date, true)}</b></div>
      <div className="ticket-row"><span>ساعت</span><b>{fa(a.time)}</b></div>
      <div className="ticket-row"><span>مرکز</span><b>{a.centerName || ''}</b></div>
      {a.centerAddress && <div className="ticket-row"><span>آدرس</span><b className="small" style={{ maxWidth: '60%', textAlign: 'left' }}>{a.centerAddress}</b></div>}
      {a.priority && a.priority !== 'normal' && <div className="ticket-row"><span>اولویت</span><PrioBadge p={a.priority} /></div>}
      <p className="xs muted mt1" style={{ textAlign: 'center' }}>لطفاً ۱۵ دقیقه قبل از نوبت در مرکز حضور داشته باشید و در روز نوبت دکمه‌ی «رسیدم» را بزنید.</p>
    </div>
  );
}
export function TicketActions({ a, className = 'row' }) {
  return <div className={className}>
    <button className="btn soft grow" onClick={() => window.print()}><Icon name="printer" size="sm" /> چاپ رسید</button>
    <button className="btn ghost grow" onClick={() => downloadIcs(a)}><Icon name="download" size="sm" /> افزودن به تقویم</button>
  </div>;
}
export function showTicket(a) {
  openModal(({ close }) => (
    <Modal title="رسید نوبت" onClose={close} footer={<><button className="btn ghost" onClick={() => downloadIcs(a)}><Icon name="download" size="sm" /> افزودن به تقویم</button><button className="btn" onClick={() => window.print()}><Icon name="printer" size="sm" /> چاپ</button></>}>
      <Ticket a={a} />
    </Modal>
  ));
}
/** ساخت فایل تقویم استاندارد (ICS) با هشدار ۲ ساعت قبل */
export function downloadIcs(a) {
  const p = n => String(n).padStart(2, '0');
  const dt = (d, t, add = 0) => { const x = J.parse(d); const [h, mi] = t.split(':').map(Number); x.setHours(h, mi + add); return `${x.getFullYear()}${p(x.getMonth() + 1)}${p(x.getDate())}T${p(x.getHours())}${p(x.getMinutes())}00`; };
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Noban//FA', 'BEGIN:VEVENT', `UID:noban-${a.code}`, `DTSTART:${dt(a.date, a.time)}`, `DTEND:${dt(a.date, a.time, a.duration || 20)}`, `SUMMARY:نوبت ${a.doctorName}`, `LOCATION:${a.centerName || ''} - ${a.centerAddress || ''}`, `DESCRIPTION:کد رهگیری ${a.code}`, 'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:یادآوری نوبت', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const l = document.createElement('a'); l.href = url; l.download = `noban-${a.code}.ics`; l.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ======================= انتخابگر تاریخ شمسی ======================= */
export function datePicker({ value, min = null, max = null, title = 'انتخاب تاریخ' } = {}) {
  return new Promise(resolve => {
    let picked = false;
    openModal(({ close }) => <DatePickerModal {...{ value, min, max, title, close }} onPick={d => { picked = true; close(); resolve(d); }} />,
      { onClose: () => !picked && resolve(null) });
  });
}
function DatePickerModal({ value, min, max, title, close, onPick }) {
  const [cur, setCur] = useState(() => J.jOf(value || J.ymd()));
  const move = n => setCur(c => { let jm = c.jm + n, jy = c.jy; if (jm > 12) { jm = 1; jy++; } if (jm < 1) { jm = 12; jy--; } return { ...c, jy, jm }; });
  const len = J.monthLength(cur.jy, cur.jm);
  const lead = J.WEEK_ORDER.indexOf(J.weekday(J.fromJ(cur.jy, cur.jm, 1)));
  const today = J.ymd();
  const cells = [];
  for (let d = 1; d <= len; d++) {
    const date = J.fromJ(cur.jy, cur.jm, d);
    const dis = (min && date < min) || (max && date > max);
    cells.push(<div key={date} className={`cal-day ${dis ? 'dis' : ''} ${date === value ? 'sel' : ''} ${date === today ? 'today' : ''}`} onClick={dis ? undefined : () => onPick(date)}>{fa(d)}</div>);
  }
  return (
    <Modal title={title} size="sm" onClose={close}>
      <div className="cal">
        <div className="cal-head"><button className="btn icon-only sm ghost" onClick={() => move(-1)}><Icon name="chev-right" /></button><b>{J.MONTHS[cur.jm - 1]} {fa(cur.jy)}</b><button className="btn icon-only sm ghost" onClick={() => move(1)}><Icon name="chev-left" /></button></div>
        <div className="cal-grid"><WeekHead /><Blanks n={lead} />{cells}</div>
        <div className="row mt2"><button className="btn sm soft grow" onClick={() => onPick(today)}>امروز</button><button className="btn sm ghost grow" onClick={() => onPick(J.addDays(today, 1))}>فردا</button></div>
      </div>
    </Modal>
  );
}
/** فیلد تاریخ شمسی (مقدار در input مخفی با نام name قرار می‌گیرد تا در فرم ارسال شود) */
export function DateField({ name, defaultValue = '', value: controlled, onChange, min, placeholder = 'انتخاب تاریخ', small }) {
  const [inner, setInner] = useState(defaultValue);
  const value = controlled !== undefined ? controlled : inner;
  const open = async () => {
    const d = await datePicker({ value: value || null, min: min || null });
    if (!d) return;
    setInner(d);
    onChange && onChange(d);
  };
  return <>
    <button type="button" className={`input ${small ? 'sm' : ''}`} onClick={open} style={{ textAlign: 'right', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
      <Icon name="calendar" size="sm" /><span>{value ? J.withDay(value, true) : <span className="muted">{placeholder}</span>}</span>
    </button>
    <input type="hidden" name={name} value={value || ''} />
  </>;
}

export { AsyncButton };
