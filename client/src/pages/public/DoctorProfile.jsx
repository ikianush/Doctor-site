// پروفایل عمومی پزشک + ویجت رزرو نوبت
import { get } from '../../lib/api.js';
import * as J from '../../lib/jalali.js';
import { fa, money } from '../../lib/format.js';
import { useAsync } from '../../lib/hooks.js';
import { Icon, Avatar, Stars, RatingPill, Loader, Empty, ErrorBox } from '../../components/ui.jsx';
import { toast } from '../../components/overlay.jsx';
import { BookingWidget } from '../../components/shared.jsx';

const Info = ({ icon, label, value }) => <div className="info-item"><div className="ic"><Icon name={icon} /></div><div><small>{label}</small><b>{value}</b></div></div>;

export default function DoctorProfile({ params }) {
  const { data: d, error, reload } = useAsync(() => get('/doctors/' + params.id), [params.id]);
  if (error) return <div className="container"><ErrorBox error={error} retry={reload} /></div>;
  if (!d) return <Loader />;
  const total = d.reviewCount || 1;
  const share = () => { navigator.clipboard?.writeText(location.href); toast('لینک صفحه‌ی پزشک کپی شد.', 'success'); };
  return <>
    <div className="profile-cover"><div className="hero-pattern" /></div>
    <div className="container">
      <div className="profile-head">
        <Avatar name={d.name} size="xl" verified={d.verified} />
        <div className="grow" style={{ paddingBottom: 6 }}>
          <div className="row wrap" style={{ gap: 10 }}><h1>{d.name}</h1>
            {d.verified && <span className="badge blue"><Icon name="shield" size="sm" /> هویت تأیید شده</span>}
            {d.accepting ? <span className="badge green"><span className="dot" />پذیرش نوبت فعال</span> : <span className="badge red">عدم پذیرش موقت</span>}</div>
          <div className="t2">{d.degree} • <b style={{ color: 'var(--primary)' }}>{d.specialty}</b></div>
          <div className="row wrap mt1" style={{ gap: 14 }}>
            <RatingPill rating={d.rating} count={d.reviewCount} />
            <span className="small t2"><Icon name="users" size="sm" /> {fa(d.visits)} ویزیت موفق</span>
            <span className="small t2"><Icon name="pin" size="sm" /> {d.city}</span>
            {d.avgVisit && <span className="small t2"><Icon name="clock" size="sm" /> میانگین ویزیت {fa(d.avgVisit)} دقیقه</span>}
          </div>
        </div>
        <div className="row" style={{ paddingBottom: 8 }}><button className="btn ghost sm" onClick={share}><Icon name="copy" size="sm" /> اشتراک‌گذاری</button></div>
      </div>
      <div className="profile-layout">
        <div className="col" style={{ gap: 20 }}>
          <div className="card"><div className="card-h"><h3><Icon name="user" /> درباره‌ی پزشک</h3></div><div className="card-b">
            <p className="t2">{d.bio || 'اطلاعاتی ثبت نشده است.'}</p>
            <div className="info-list mt3">
              <Info icon="award" label="سابقه‌ی کار" value={`${fa(d.experience)} سال`} />
              <Info icon="id" label="شماره‌ی نظام پزشکی" value={fa(d.medicalCode)} />
              <Info icon="wallet" label="هزینه‌ی ویزیت" value={money(d.fee)} />
              <Info icon="hourglass" label="افراد در صف انتظار" value={`${fa(d.waitCount)} نفر`} />
            </div>
            {d.tags.length > 0 && <div className="row wrap mt2" style={{ gap: 6 }}>{d.tags.map(t => <span key={t} className="badge teal"><Icon name="check" size="sm" />{t}</span>)}</div>}
            <div className="mt2"><div className="label" style={{ marginBottom: 8 }}>بیمه‌های طرف قرارداد</div>
              <div className="row wrap" style={{ gap: 6 }}>{d.insurances.length ? d.insurances.map(i => <span key={i} className="chip"><Icon name="shield" size="sm" />{i}</span>) : <span className="muted small">آزاد</span>}</div></div>
          </div></div>

          <div className="card"><div className="card-h"><h3><Icon name="clock" /> برنامه‌ی هفتگی حضور</h3></div><div className="card-b">
            <div className="week-table">{J.WEEK_ORDER.map(w => {
              const sh = d.schedules.filter(s => s.weekday === w);
              return <div key={w} className={`d ${sh.length ? 'on' : ''}`}><b>{J.WEEKDAYS[w]}</b>{sh.length ? sh.map(s => <div key={s.id ?? s.start}>{fa(s.start)}–{fa(s.end)}</div>) : <div className="muted">تعطیل</div>}</div>;
            })}</div>
          </div></div>

          <div className="card"><div className="card-h"><h3><Icon name="building" /> محل‌های حضور</h3></div><div className="card-b col">
            {d.centersFull.map(c => <a key={c.id} href={`#/center/${c.id}`} className="info-item"><div className="ic" style={{ color: c.color }}><Icon name="building" /></div><div className="grow"><b>{c.name}</b><small>{c.address}</small></div><span className="small ltr t2">{fa(c.phone)}</span></a>)}
          </div></div>

          <div className="card"><div className="card-h"><h3><Icon name="star" /> نظرات بیماران</h3><span className="small muted">{fa(d.reviewCount)} نظر</span></div><div className="card-b">
            <div className="row top wrap" style={{ gap: 30 }}>
              <div style={{ textAlign: 'center', minWidth: 140 }}><div style={{ fontSize: 48, fontWeight: 900, lineHeight: 1.2 }}>{fa(d.rating || '—')}</div><Stars value={d.rating} /><div className="small muted">از {fa(5)} — {fa(d.reviewCount)} رأی</div></div>
              <div className="rate-bars grow">{[5, 4, 3, 2, 1].map(s => <div key={s} className="rate-bar"><span>{fa(s)} ★</span><div className="bar"><i style={{ width: `${(d.ratingDist[s - 1] / total) * 100}%` }} /></div><span className="muted">{fa(d.ratingDist[s - 1])}</span></div>)}</div>
            </div>
            <div className="divider" />
            {d.reviews.length ? d.reviews.slice(0, 8).map(r => (
              <div key={r.id} className="review">
                <div className="row between"><div className="row"><Avatar name={r.patientName} size="sm" /><div><b className="small">{r.patientName}</b><div className="xs muted">{J.ago(r.createdAt)}</div></div></div><Stars value={r.rating} /></div>
                <p className="small mt1">{r.comment}</p>
                {r.reply && <div className="reply"><b>پاسخ پزشک:</b> {r.reply}</div>}
              </div>)) : <Empty title="هنوز نظری ثبت نشده" icon="message" />}
          </div></div>
        </div>
        <aside className="booking-panel"><div className="card">
          <div className="card-h"><h3><Icon name="calendar" /> دریافت نوبت اینترنتی</h3><span className="badge green">رایگان</span></div>
          <div className="card-b">{d.accepting ? <BookingWidget doctor={d} /> : <Empty title="پذیرش نوبت موقتاً متوقف است" text="این پزشک در حال حاضر نوبت جدید نمی‌پذیرد." icon="lock" />}</div>
        </div></aside>
      </div>
    </div>
  </>;
}
