// کارت نوبت بیمار و عملیات آن (لغو، جابه‌جایی، پذیرش آنلاین، نظر)
import { useState } from 'react';
import { post } from '../../lib/api.js';
import * as J from '../../lib/jalali.js';
import { fa } from '../../lib/format.js';
import { useBusy } from '../../lib/hooks.js';
import { Icon, Avatar, Stars, StatusBadge, PrioBadge, AsyncButton, Spinner } from '../../components/ui.jsx';
import { toast, openModal, Modal, confirmDialog } from '../../components/overlay.jsx';
import { BookingWidget, QueueLive, showTicket, downloadIcs } from '../../components/shared.jsx';
import { SPEC_ICON } from '../../lib/format.js';

export const ACTIVE = ['booked', 'checked_in', 'in_visit'];

export function countdown(a) {
  const ms = J.parse(a.date).getTime() + (+a.time.slice(0, 2) * 60 + +a.time.slice(3)) * 60000 - Date.now();
  if (ms <= 0) return 'هم‌اکنون';
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return [d && fa(d) + ' روز', h && fa(h) + ' ساعت', !d && fa(m) + ' دقیقه'].filter(Boolean).join(' و ') + ' دیگر';
}

/** عملیات روی نوبت؛ reload پس از هر تغییر صدا زده می‌شود */
export function apptActions(a, reload) {
  return {
    ticket: () => showTicket(a),
    ics: () => downloadIcs(a),
    async cancel() {
      const r = await confirmDialog(`آیا از لغو نوبت ${a.doctorName} در ${J.withDay(a.date)} ساعت ${fa(a.time)} اطمینان دارید؟ ظرفیت آزادشده به نفر اول صف انتظار داده می‌شود.`, { title: 'لغو نوبت', ok: 'بله، لغو شود', danger: true, input: 'علت لغو' });
      if (!r) return;
      try { await post(`/appointments/${a.id}/cancel`, { reason: r.value }); toast('نوبت با موفقیت لغو شد.', 'success'); reload(); } catch (err) { toast(err.message, 'error'); }
    },
    async checkin() {
      try { const r = await post(`/appointments/${a.id}/checkin`); toast(`پذیرش شما ثبت شد. ${r.queue ? fa(r.queue.ahead) + ' نفر جلوتر از شما هستند.' : ''}`, 'success'); reload(); } catch (err) { toast(err.message, 'error'); }
    },
    reschedule() {
      openModal(({ close }) => (
        <Modal size="lg" onClose={close} title={<><Icon name="swap" /> تغییر زمان نوبت — {a.doctorName}</>}>
          <div className="alert warn mb2"><Icon name="info" /><div>زمان فعلی: <b>{J.withDay(a.date, true)} ساعت {fa(a.time)}</b>. زمان جدید را انتخاب کنید.</div></div>
          <BookingWidget doctor={{ id: a.doctorId, name: a.doctorName, fee: a.fee }} reschedule={a} onDone={reload} />
        </Modal>
      ));
    },
    review() { openModal(({ close }) => <ReviewModal a={a} close={close} reload={reload} />); }
  };
}

function ReviewModal({ a, close, reload }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, run] = useBusy();
  const save = () => run(async () => {
    try { await post(`/appointments/${a.id}/review`, { rating, comment }); close(); toast('نظر شما ثبت شد. سپاسگزاریم!', 'success'); reload(); } catch (err) { toast(err.message, 'error'); }
  });
  return (
    <Modal title="ثبت نظر و امتیاز" size="sm" onClose={close} footer={<><button className="btn ghost" onClick={close}>انصراف</button><button className="btn" disabled={busy} onClick={save}>{busy ? <Spinner /> : 'ثبت نظر'}</button></>}>
      <div style={{ textAlign: 'center' }}><Avatar name={a.doctorName} size="lg" /><b className="mt1" style={{ display: 'block' }}>{a.doctorName}</b><p className="small muted">تجربه‌ی ویزیت خود را با دیگران به اشتراک بگذارید</p>
        <div className="row mt2" style={{ justifyContent: 'center', gap: 4 }}>{[1, 2, 3, 4, 5].map(i => (
          <button key={i} className="btn icon-only ghost" style={{ border: 'none', color: '#f5b301' }} onClick={() => setRating(i)}><Icon name="star" size="lg" style={{ fill: i <= rating ? '#f5b301' : 'none' }} /></button>))}</div></div>
      <textarea className="textarea mt2" value={comment} onChange={e => setComment(e.target.value)} placeholder="نظر شما درباره‌ی برخورد، دقت در معاینه، زمان انتظار..." />
    </Modal>
  );
}

export function ApptCard({ a, reload }) {
  const md = J.monthDay(a.date);
  const past = !ACTIVE.includes(a.status);
  const act = apptActions(a, reload);
  return (
    <div className={`card appt ${past ? 'past' : ''}`}>
      <div className="appt-date"><small>{md.weekday}</small><b>{md.day}</b><small>{md.month}</small></div>
      <div className="grow">
        <div className="row wrap" style={{ gap: 8 }}><h4>{a.doctorName}</h4><StatusBadge status={a.status} /><PrioBadge p={a.priority} />{a.source === 'waitlist' && <span className="badge purple"><Icon name="hourglass" size="sm" />از صف انتظار</span>}</div>
        <div className="small t2"><Icon name={SPEC_ICON(a.specialtyIcon)} size="sm" /> {a.specialty} • <Icon name="clock" size="sm" /> ساعت <b>{fa(a.time)}</b> • <Icon name="pin" size="sm" /> {a.centerName}</div>
        <div className="xs muted mt1">کد رهگیری: <span className="code" style={{ letterSpacing: 1 }}>{fa(a.code)}</span>
          {!past && <> • <span style={{ color: 'var(--primary)' }}>{countdown(a)}</span></>}{a.cancelReason && <> • علت لغو: {a.cancelReason}</>}</div>
        {a.queue && <QueueLive q={a.queue} />}
      </div>
      <div className="row wrap" style={{ justifyContent: 'flex-end' }}>
        {a.canCheckin && <AsyncButton className="btn sm success" onClick={act.checkin}><Icon name="door" size="sm" /> رسیدم</AsyncButton>}
        {a.status === 'done' && !a.review && <button className="btn sm soft" onClick={act.review}><Icon name="star" size="sm" /> ثبت نظر</button>}
        {a.status === 'done' && a.review && <span className="small"><Stars value={a.review.rating} /></span>}
        {a.status === 'booked' && a.canCancel && <button className="btn sm ghost" onClick={act.reschedule}><Icon name="swap" size="sm" /> تغییر زمان</button>}
        {['booked', 'checked_in'].includes(a.status) && a.canCancel && <button className="btn sm danger-soft" onClick={act.cancel}><Icon name="x" size="sm" /> لغو</button>}
        {!past && <button className="btn sm ghost icon-only" title="رسید" onClick={act.ticket}><Icon name="ticket" size="sm" /></button>}
        {['cancelled', 'done', 'no_show'].includes(a.status) && <a className="btn sm ghost" href={`#/doctor/${a.doctorId}`}><Icon name="refresh" size="sm" /> رزرو مجدد</a>}
      </div>
    </div>
  );
}
