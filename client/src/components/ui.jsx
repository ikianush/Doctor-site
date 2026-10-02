// کامپوننت‌های پایه‌ی رابط کاربری
import { useState } from 'react';
import { PATHS } from '../lib/icons.js';
import { fa, STATUS, PRIO, gradientOf, initials } from '../lib/format.js';
import { useBusy } from '../lib/hooks.js';

export function Icon({ name, size = '', className = '', style }) {
  return <svg className={`icon ${size} ${className}`} viewBox="0 0 24 24" aria-hidden="true" style={style} dangerouslySetInnerHTML={{ __html: PATHS[name] || PATHS.info }} />;
}

export function Avatar({ name, size = '', verified = false }) {
  const [a, b] = gradientOf(name || '?');
  return (
    <div className={`avatar ${size}`} style={{ background: `linear-gradient(135deg,${a},${b})` }}>
      {initials(name)}
      {verified && <span className="v" title="تأیید شده"><Icon name="verified" /></span>}
    </div>
  );
}

export function Stars({ value, max = 5 }) {
  return <span className="stars">{Array.from({ length: max }, (_, i) => <span key={i} className={i + 1 <= Math.round(value || 0) ? '' : 'off'}><Icon name="star" /></span>)}</span>;
}

export function RatingPill({ rating, count }) {
  if (!rating) return <span className="badge">بدون امتیاز</span>;
  return <span className="rating-pill"><Icon name="star" />{fa(rating)}{count !== undefined && <small className="muted" style={{ fontWeight: 500 }}>({fa(count)})</small>}</span>;
}

export function StatusBadge({ status }) {
  const [l, c] = STATUS[status] || [status, ''];
  return <span className={`badge ${c} ${status === 'in_visit' ? 'pulse' : ''}`}><span className="dot" />{l}</span>;
}

export function PrioBadge({ p, fallback = null }) {
  if (!p || p === 'normal') return fallback;
  const [l, c, ic] = PRIO[p] || [p, '', 'user'];
  return <span className={`badge ${c}`}><Icon name={ic} size="sm" />{l}</span>;
}

export const Loader = ({ pad }) => <div className="page-loader" style={pad ? { padding: pad } : undefined}><div className="spinner" /></div>;
export const Spinner = () => <span className="spinner" />;

export function Empty({ title, text = '', icon = 'calendar', children }) {
  return (
    <div className="empty">
      <div className="ic"><Icon name={icon} size="xl" /></div>
      <h4>{title}</h4>
      {text && <p>{text}</p>}
      {children && <div className="mt2">{children}</div>}
    </div>
  );
}

export function ErrorBox({ error, retry }) {
  return (
    <div className="empty">
      <div className="ic">⚠️</div><h4>خطا در بارگذاری</h4><p>{error?.message || ''}</p>
      {retry && <button className="btn mt2" onClick={() => retry()}>تلاش مجدد</button>}
    </div>
  );
}

/** دکمه‌ای که تابع async را اجرا و تا پایان، لودر نشان می‌دهد */
export function AsyncButton({ onClick, children, className = 'btn', type = 'button', ...rest }) {
  const [busy, run] = useBusy();
  return <button type={type} className={className} disabled={busy || rest.disabled} {...rest} onClick={e => run(() => onClick(e))}>{busy ? <Spinner /> : children}</button>;
}
/** دکمه‌ی submit یک فرم با وضعیت busy بیرونی */
export function SubmitButton({ busy, children, className = 'btn', ...rest }) {
  return <button type="submit" className={className} disabled={busy} {...rest}>{busy ? <Spinner /> : children}</button>;
}

export function Switch({ checked, onChange, name, defaultChecked }) {
  return <span className="switch"><input type="checkbox" name={name} checked={checked} defaultChecked={defaultChecked} onChange={onChange} /><span /></span>;
}

/** بارکد تزئینی از روی کد رهگیری */
export function Barcode({ code }) {
  const bars = [];
  for (const ch of String(code) + 'NB' + String(code).split('').reverse().join('')) {
    const n = ch.charCodeAt(0);
    for (let i = 0; i < 3; i++) bars.push(<i key={bars.length} style={{ width: ((n >> i) & 1) + 1, marginLeft: ((n >> (i + 2)) & 1) + 1 }} />);
  }
  return <div className="barcode">{bars}</div>;
}

/** گروه انتخاب تکی به شکل چیپ */
export function ChipRadio({ name, options, value, defaultValue, onChange }) {
  return (
    <div className="chips-select">
      {options.map(([v, label]) => (
        <label key={v}>
          <input type="radio" name={name} value={v} {...(value !== undefined ? { checked: value === v, onChange: () => onChange(v) } : { defaultChecked: defaultValue === v })} />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}

/** تب‌ها */
export function Tabs({ tabs, value, onChange, className = '', style }) {
  return (
    <div className={`tabs ${className}`} style={style}>
      {tabs.map(([k, label]) => <button type="button" key={k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{label}</button>)}
    </div>
  );
}

/** نوار آمار KPI */
export function Kpi({ icon, color, value, label, sub, compact }) {
  return (
    <div className="card kpi" style={compact ? { padding: 16 } : undefined}>
      <div className={`ic ${color}`} style={compact ? { width: 44, height: 44 } : undefined}><Icon name={icon} size={compact ? '' : 'lg'} /></div>
      <div><b style={compact ? { fontSize: 20 } : undefined}>{value}</b><span>{label}</span>{sub && <div className="xs muted">{sub}</div>}</div>
    </div>
  );
}

export function useToggle(init = false) { const [v, s] = useState(init); return [v, () => s(x => !x), s]; }
