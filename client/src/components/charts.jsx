// نمودارهای SVG اختصاصی (بدون کتابخانه): ستونی، خطی، دونات و میله‌ای افقی
import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fa } from '../lib/format.js';
import { useWidth } from '../lib/hooks.js';

const niceMax = v => { if (v <= 5) return 5; const p = 10 ** Math.floor(Math.log10(v)); return Math.ceil(v / p) * p; };

/** راهنمای شناور نمودار */
function useTip() {
  const [tip, setTip] = useState(null);
  const bind = content => ({
    onMouseMove: e => setTip({ x: e.clientX, y: e.clientY, content }),
    onMouseLeave: () => setTip(null)
  });
  const el = tip && createPortal(
    <div className="chart-tip" style={{ display: 'block', left: Math.min(tip.x + 14, innerWidth - 180), top: tip.y - 40 }}>{tip.content}</div>,
    document.body
  );
  return [bind, el];
}
const TipLines = ({ title, rows }) => <><b>{title}</b>{rows.map((r, i) => <div key={i}>{r}</div>)}</>;

function Legend({ series }) {
  if (series.length < 2) return null;
  return <div className="legend mt1" style={{ justifyContent: 'center' }}>{series.map(s => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}</div>;
}
function GridLines({ W, H, pl, pr, pt, pb, max }) {
  return [0, 1, 2, 3, 4].map(i => {
    const y = pt + (H - pt - pb) * (i / 4);
    return <g key={i}><line className="grid-line" x1={pl} x2={W - pr} y1={y} y2={y} /><text x={pl - 8} y={y + 4} textAnchor="end">{fa(Math.round(max * (1 - i / 4)))}</text></g>;
  });
}

/** نمودار ستونی پشته‌ای — series: [{name, color, values}] */
export function BarChart({ labels, series, height = 260, highlight = -1 }) {
  const box = useRef();
  const W = Math.max(useWidth(box), 300), H = height, pl = 36, pb = 34, pt = 12, pr = 8;
  const [tipProps, tipEl] = useTip();
  const totals = labels.map((_, i) => series.reduce((s, x) => s + (x.values[i] || 0), 0));
  const max = niceMax(Math.max(1, ...totals));
  const cw = (W - pl - pr) / labels.length, bw = Math.min(28, cw * 0.62);
  const step = Math.ceil(labels.length / Math.max(1, Math.floor((W - pl) / 46)));
  return (
    <div ref={box}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} height={H}>
        <GridLines {...{ W, H, pl, pr, pt, pb, max }} />
        {labels.map((l, i) => {
          const x = pl + cw * i + (cw - bw) / 2;
          let y = H - pb;
          const tp = tipProps(<TipLines title={l} rows={series.map(s => `${s.name}: ${fa(s.values[i] || 0)}`)} />);
          return (
            <g key={i}>
              {series.map((s, si) => {
                const v = s.values[i] || 0;
                if (!v) return null;
                const h = (H - pt - pb) * (v / max);
                y -= h;
                const top = series.slice(si + 1).every(x => !x.values[i]);
                return <rect key={si} className="bar-rect" {...tp} x={x} y={y} width={bw} height={h} rx={top ? 5 : 0} fill={s.color} opacity={highlight >= 0 && i !== highlight ? 0.55 : 1} />;
              })}
              {totals[i] === 0 && <rect {...tp} x={x} y={H - pb - 2} width={bw} height={2} fill="var(--border)" />}
              {i % step === 0 && <text x={x + bw / 2} y={H - 12} textAnchor="middle" style={i === highlight ? { fill: 'var(--primary)', fontWeight: 700 } : undefined}>{l}</text>}
            </g>
          );
        })}
      </svg>
      <Legend series={series} />
      {tipEl}
    </div>
  );
}

/** نمودار خطی با منحنی نرم و ناحیه‌ی رنگی */
export function LineChart({ labels, series, height = 240 }) {
  const box = useRef();
  const uid = useId().replace(/:/g, '');
  const W = Math.max(useWidth(box), 300), H = height, pl = 36, pb = 34, pt = 14, pr = 10;
  const [tipProps, tipEl] = useTip();
  const max = niceMax(Math.max(1, ...series.flatMap(s => s.values)));
  const X = i => pl + (W - pl - pr) * (labels.length === 1 ? 0.5 : i / (labels.length - 1));
  const Y = v => pt + (H - pt - pb) * (1 - v / max);
  const step = Math.ceil(labels.length / Math.max(1, Math.floor((W - pl) / 50)));
  const colW = (W - pl) / labels.length;
  return (
    <div ref={box}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} height={H}>
        <defs>{series.map((s, i) => <linearGradient key={i} id={`lg${uid}${i}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={s.color} stopOpacity=".28" /><stop offset="1" stopColor={s.color} stopOpacity="0" /></linearGradient>)}</defs>
        <GridLines {...{ W, H, pl, pr, pt, pb, max }} />
        {series.map((s, si) => {
          const pts = s.values.map((v, i) => [X(i), Y(v)]);
          const d = pts.map((p, i) => {
            if (!i) return `M${p[0]},${p[1]}`;
            const [px, py] = pts[i - 1]; const cx = (px + p[0]) / 2;
            return `C${cx},${py} ${cx},${p[1]} ${p[0]},${p[1]}`;
          }).join('');
          return <g key={si}>
            {s.area !== false && <path d={`${d}L${X(labels.length - 1)},${H - pb}L${X(0)},${H - pb}Z`} fill={`url(#lg${uid}${si})`} />}
            <path d={d} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={s.dash ? '5 5' : undefined} />
          </g>;
        })}
        {labels.map((l, i) => (
          <g key={i}>
            {i % step === 0 && <text x={X(i)} y={H - 12} textAnchor="middle">{l}</text>}
            <rect {...tipProps(<TipLines title={l} rows={series.map(s => `${s.name}: ${fa(s.values[i])}`)} />)} x={X(i) - colW / 2} y={pt} width={colW} height={H - pt - pb} fill="transparent" />
            {series.map((s, si) => <circle key={si} cx={X(i)} cy={Y(s.values[i])} r="3" fill="var(--surface)" stroke={s.color} strokeWidth="2" pointerEvents="none" />)}
          </g>
        ))}
      </svg>
      <Legend series={series} />
      {tipEl}
    </div>
  );
}

/** نمودار دونات با راهنما */
export function Donut({ items, size = 180, center = '', sub = '' }) {
  const [tipProps, tipEl] = useTip();
  const total = items.reduce((s, x) => s + x.value, 0) || 1;
  const r = 70, c = 2 * Math.PI * r;
  let off = 0;
  return (
    <div className="row" style={{ gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
      <svg viewBox="0 0 180 180" width={size} height={size} className="chart">
        <circle r={r} cx="90" cy="90" fill="none" stroke="var(--surface-2)" strokeWidth="22" />
        {items.map(it => {
          const len = (it.value / total) * c;
          const el = <circle key={it.label} {...tipProps(`${it.label}: ${fa(it.value)} (${fa(Math.round((it.value / total) * 100))}٪)`)} r={r} cx="90" cy="90" fill="none" stroke={it.color} strokeWidth="22" strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-off} transform="rotate(-90 90 90)" style={{ cursor: 'pointer' }} />;
          off += len;
          return el;
        })}
        <text x="90" y="88" textAnchor="middle" style={{ fontSize: 26, fontWeight: 800, fill: 'var(--text)' }}>{center}</text>
        <text x="90" y="110" textAnchor="middle" style={{ fontSize: 11 }}>{sub}</text>
      </svg>
      <div className="donut-legend">{items.map(it => <div key={it.label}><i style={{ background: it.color }} /><span className="grow">{it.label}</span><b>{fa(it.value)}</b></div>)}</div>
      {tipEl}
    </div>
  );
}

/** میله‌های افقی */
export function HBars({ items, color, max }) {
  const m = max || Math.max(1, ...items.map(i => i.value));
  return (
    <div className="col" style={{ gap: 12 }}>
      {items.map((it, i) => (
        <div key={i}>
          <div className="row between small"><span>{it.label}</span><b>{fa(it.value)}{it.suffix || ''}</b></div>
          <div className="bar blue mt1" style={{ height: 9 }}><i style={{ width: `${(it.value / m) * 100}%`, ...(it.color || color ? { background: it.color || color } : {}) }} /></div>
        </div>
      ))}
    </div>
  );
}
