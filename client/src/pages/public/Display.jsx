// نمایشگر تلویزیونی سالن انتظار با اعلان صوتی هنگام فراخوانی
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../lib/app.jsx';
import { get } from '../../lib/api.js';
import * as J from '../../lib/jalali.js';
import { fa } from '../../lib/format.js';
import { navigate } from '../../lib/router.js';
import { useInterval } from '../../lib/hooks.js';
import { Icon, Empty, Loader } from '../../components/ui.jsx';

let audioCtx;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25].forEach((t, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = i ? 660 : 880; o.connect(g); g.connect(audioCtx.destination);
      g.gain.setValueAtTime(0.2, audioCtx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + t + 0.4);
      o.start(audioCtx.currentTime + t); o.stop(audioCtx.currentTime + t + 0.4);
    });
  } catch { }
}

export default function Display({ params }) {
  const { meta, siteName } = useApp();
  const [d, setD] = useState(undefined);
  const [flash, setFlash] = useState({});
  const prev = useRef({});

  async function load() {
    const r = await get('/display/' + params.id).catch(() => null);
    if (r) {
      const fl = {};
      r.rows.forEach(row => {
        const cur = row.current?.turn;
        if (prev.current[row.doctor] !== undefined && prev.current[row.doctor] !== cur && cur) { fl[row.doctor] = Date.now(); beep(); }
        prev.current[row.doctor] = cur;
      });
      if (Object.keys(fl).length) setFlash(fl);
    }
    setD(r);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useInterval(load, 5000);

  if (d === undefined) return <div className="display"><Loader /></div>;
  if (!d) return <div className="display"><Empty title="مرکز یافت نشد" /></div>;
  const now = new Date();
  return (
    <div className="display">
      <div className="display-head">
        <div className="row" style={{ gap: 16 }}><div className="logo-mark" style={{ width: 60, height: 60, borderRadius: 18 }}><Icon name="logo" size="lg" /></div>
          <div><h1>{d.center.name}</h1><div style={{ opacity: 0.7 }}>سامانه‌ی نوبت‌دهی {siteName} — {J.withDay(J.ymd(), true)}</div></div></div>
        <div className="row" style={{ gap: 20 }}>
          <select className="select" value={d.center.id} onChange={e => navigate('/display/' + e.target.value)} style={{ width: 'auto', backgroundColor: '#0f1d38', borderColor: '#1c2c4c', color: '#fff' }}>
            {meta.centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="display-clock">{fa(now.toTimeString().slice(0, 5))}</div>
        </div>
      </div>
      {d.rows.length ? <div className="display-grid">{d.rows.map(r => (
        <div key={r.doctor + (flash[r.doctor] || '')} className={`disp-card ${flash[r.doctor] ? 'flash' : ''}`}>
          <div className="row between">
            <div><div style={{ fontSize: 22, fontWeight: 800 }}>{r.doctor}</div><div style={{ opacity: 0.6 }}>{r.specialty}</div></div>
            {r.current ? <span className="badge teal pulse" style={{ background: '#0e2c2d' }}><span className="dot" />در حال ویزیت</span> : <span className="badge" style={{ background: '#16264a', color: '#93c5fd' }}>در انتظار فراخوانی</span>}
          </div>
          <div className="row between mt2" style={{ alignItems: 'flex-end' }}>
            <div><div style={{ opacity: 0.6, fontSize: 14 }}>شماره‌ی نوبت</div><div className="num" style={r.current ? undefined : { opacity: 0.35 }}>{r.current ? fa(r.current.turn) : '--'}</div></div>
            <div style={{ textAlign: 'left' }}><div style={{ opacity: 0.6, fontSize: 13 }}>نفرات بعدی</div>
              <div className="row" style={{ gap: 8, marginTop: 6, justifyContent: 'flex-end' }}>
                {r.next.length ? r.next.map(n => <span key={n.turn} style={{ background: n.priority !== 'normal' ? '#3b1419' : '#16264a', color: n.priority !== 'normal' ? '#fca5a5' : '#93c5fd', padding: '6px 14px', borderRadius: 12, fontWeight: 800, fontSize: 20 }}>{fa(n.turn)}</span>) : <span style={{ opacity: 0.5 }}>صف خالی</span>}
              </div></div>
          </div>
          <div className="bar mt2" style={{ background: '#16264a' }}><i style={{ width: `${(r.done / r.total) * 100}%`, background: '#2dd4bf' }} /></div>
          <div className="row between mt1" style={{ opacity: 0.6, fontSize: 13 }}><span>{fa(r.done)} از {fa(r.total)} ویزیت انجام شد</span><span>{fa(r.waiting)} نفر در سالن</span></div>
        </div>))}</div>
        : <div className="empty" style={{ color: '#8fa3c0' }}><div className="ic" style={{ background: '#0f1d38' }}><Icon name="tv" size="xl" /></div><h4 style={{ color: '#fff' }}>امروز در این مرکز صفی فعال نیست</h4></div>}
      <div className="marquee"><span><Icon name="info" size="sm" /> لطفاً پس از ورود به مرکز، از طریق اپلیکیشن دکمه‌ی «رسیدم» را بزنید یا به پذیرش مراجعه کنید. • بیماران اورژانسی، باردار، سالمند و دارای معلولیت در اولویت ویزیت هستند. • برای دریافت نوبت اینترنتی به سامانه‌ی {siteName} مراجعه کنید.</span></div>
    </div>
  );
}
