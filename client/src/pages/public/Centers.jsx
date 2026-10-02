// فهرست مراکز درمانی و صفحه‌ی هر مرکز
import { useState } from 'react';
import { useApp } from '../../lib/app.jsx';
import { get } from '../../lib/api.js';
import { fa } from '../../lib/format.js';
import { useAsync } from '../../lib/hooks.js';
import { Icon, Loader, Empty, Tabs, ErrorBox } from '../../components/ui.jsx';
import { CenterCard, DoctorCard } from '../../components/shared.jsx';

export function Centers() {
  const { meta: m } = useApp();
  const [city, setCity] = useState('');
  return (
    <div className="container" style={{ padding: '30px 0' }}>
      <div className="page-head"><div><h1>مراکز درمانی</h1><p>{fa(m.centers.length)} مرکز درمانی در {fa(m.cities.length)} شهر</p></div>
        <Tabs value={city} onChange={setCity} tabs={[['', 'همه'], ...m.cities.map(c => [c, c])]} /></div>
      <div className="grid g3">{m.centers.filter(c => !city || c.city === city).map(c => <CenterCard key={c.id} c={c} />)}</div>
    </div>
  );
}

export function CenterDetail({ params }) {
  const { data: c, error, reload } = useAsync(() => get('/centers/' + params.id), [params.id]);
  if (error) return <div className="container"><ErrorBox error={error} retry={reload} /></div>;
  if (!c) return <Loader />;
  return <>
    <div className="profile-cover" style={{ background: `linear-gradient(135deg,${c.color},var(--primary))` }}><div className="hero-pattern" /></div>
    <div className="container">
      <div className="profile-head">
        <div className="avatar xl sq" style={{ background: c.color }}><Icon name="building" size="xl" /></div>
        <div className="grow"><h1>{c.name}</h1><div className="t2">{c.type} • {c.city}</div></div>
        <a href={`#/display/${c.id}`} target="_blank" className="btn soft"><Icon name="tv" size="sm" /> نمایشگر صف این مرکز</a>
      </div>
      <div className="grid mt3" style={{ gridTemplateColumns: '1fr 2fr', alignItems: 'start' }}>
        <div className="card"><div className="card-b col" style={{ gap: 14 }}>
          <p className="t2 small">{c.description || ''}</p>
          <div className="info-item"><div className="ic"><Icon name="pin" /></div><div><small>آدرس</small><b className="small">{c.address}</b></div></div>
          <div className="info-item"><div className="ic"><Icon name="phone" /></div><div><small>تلفن</small><b className="ltr">{fa(c.phone)}</b></div></div>
          <div><div className="label" style={{ marginBottom: 8 }}>امکانات</div><div className="row wrap" style={{ gap: 6 }}>{(c.facilities || []).map(f => <span key={f} className="chip"><Icon name="check" size="sm" />{f}</span>)}</div></div>
        </div></div>
        <div><h3 className="mb2">پزشکان این مرکز ({fa(c.doctors.length)})</h3>
          {c.doctors.length ? <div className="grid g2">{c.doctors.map(d => <DoctorCard key={d.id} d={d} />)}</div> : <Empty title="پزشکی ثبت نشده" />}</div>
      </div>
    </div>
  </>;
}
