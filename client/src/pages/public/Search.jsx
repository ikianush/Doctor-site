// جست‌وجوی پیشرفته‌ی پزشک با فیلتر و مرتب‌سازی
import { useEffect, useState } from 'react';
import { useApp } from '../../lib/app.jsx';
import { get } from '../../lib/api.js';
import { fa, en } from '../../lib/format.js';
import { navigate, setQuery } from '../../lib/router.js';
import { useAsync } from '../../lib/hooks.js';
import { Icon, Empty, ChipRadio } from '../../components/ui.jsx';
import { DoctorRow } from '../../components/shared.jsx';

const EMPTY = { q: '', specialty: '', city: '', center: '', gender: '', insurance: '', available: '', minRating: '', sort: 'rating' };
const SORTS = [['rating', 'بیشترین امتیاز'], ['earliest', 'زودترین نوبت'], ['popular', 'پرمراجعه‌ترین'], ['experience', 'باسابقه‌ترین'], ['fee', 'کمترین هزینه']];

export default function Search({ query }) {
  const { meta: m } = useApp();
  const [f, setF] = useState(() => ({ ...EMPTY, ...query }));
  const [text, setText] = useState(f.q); // متن جست‌وجو با تأخیر اعمال می‌شود
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));

  useEffect(() => { const t = setTimeout(() => set('q', en(text.trim())), 400); return () => clearTimeout(t); }, [text]);
  useEffect(() => setQuery(f), [f]);
  const res = useAsync(() => get('/doctors', f), [JSON.stringify(f)]);

  const spec = m.specialties.find(s => s.id === +f.specialty);
  const sel = (name, label, options) => (
    <div className="field"><label>{label}</label>
      <select className="select" value={f[name]} onChange={e => set(name, e.target.value)}><option value="">همه</option>{options}</select></div>
  );
  return (
    <div className="container" style={{ padding: '30px 0 20px' }}>
      <div className="page-head"><div><h1>{spec ? 'پزشکان متخصص ' + spec.name : 'جست‌وجوی پزشک و دریافت نوبت'}</h1><p>{res.data ? `${fa(res.data.total)} پزشک یافت شد` : 'در حال جست‌وجو...'}</p></div></div>
      <div className="search-layout">
        <aside className="card filters">
          <div className="card-h"><h3><Icon name="filter" /> فیلترها</h3><button className="btn xs ghost" onClick={() => { setText(''); setF(EMPTY); navigate('/search', true); }}>حذف فیلترها</button></div>
          <form className="card-b" onSubmit={e => e.preventDefault()}>
            <div className="input-icon"><Icon name="search" /><input className="input" value={text} onChange={e => setText(e.target.value)} placeholder="نام پزشک یا تخصص" /></div>
            {sel('specialty', 'تخصص', m.specialties.map(s => <option key={s.id} value={s.id}>{s.name}</option>))}
            {sel('city', 'شهر', m.cities.map(c => <option key={c}>{c}</option>))}
            {sel('center', 'مرکز درمانی', m.centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>))}
            {sel('insurance', 'بیمه‌ی طرف قرارداد', m.insurances.map(c => <option key={c}>{c}</option>))}
            <div className="field"><label>جنسیت پزشک</label><ChipRadio name="gender" value={f.gender} onChange={v => set('gender', v)} options={[['', 'فرقی ندارد'], ['m', 'آقا'], ['f', 'خانم']]} /></div>
            <div className="field"><label>زمان نوبت خالی</label><ChipRadio name="available" value={f.available} onChange={v => set('available', v)} options={[['', 'همه'], ['today', 'امروز'], ['week', 'این هفته']]} /></div>
            <div className="field"><label>حداقل امتیاز</label><ChipRadio name="minRating" value={f.minRating} onChange={v => set('minRating', v)} options={[['', 'همه'], ['4', '۴+'], ['4.5', '۴٫۵+']]} /></div>
          </form>
        </aside>
        <div>
          <div className="row between wrap mb2"><div className="sort-bar">{SORTS.map(([k, l]) => <button key={k} className={f.sort === k ? 'on' : ''} onClick={() => set('sort', k)}>{l}</button>)}</div></div>
          <div className="col" style={{ gap: 14 }}>
            {res.loading ? [1, 2, 3].map(i => <div key={i} className="skel" style={{ height: 150, borderRadius: 18 }} />)
              : res.data?.items.length ? res.data.items.map(d => <DoctorRow key={d.id} d={d} />)
                : <Empty title="پزشکی با این مشخصات یافت نشد" text="فیلترها را تغییر دهید یا عبارت دیگری جست‌وجو کنید." icon="search" />}
          </div>
        </div>
      </div>
    </div>
  );
}
