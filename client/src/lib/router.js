// مسیریاب سبک hash-based برای React (بدون کتابخانه)
import { useEffect, useState } from 'react';

const EVT = 'noban:location';

export function parseHash() {
  const raw = decodeURIComponent(location.hash.slice(1)) || '/';
  const [path, qs] = raw.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs || '')), raw };
}

/** هوک موقعیت فعلی؛ با تغییر hash دوباره رندر می‌شود */
export function useLocation() {
  const [loc, setLoc] = useState(parseHash);
  useEffect(() => {
    const h = () => { const n = parseHash(); setLoc(p => (p.raw === n.raw ? p : n)); };
    window.addEventListener('hashchange', h);
    window.addEventListener(EVT, h);
    h(); // افکت فرزندان (مثلاً Redirect) قبل از این افکت اجرا می‌شود؛ همگام‌سازی برای از دست نرفتن تغییر
    return () => { window.removeEventListener('hashchange', h); window.removeEventListener(EVT, h); };
  }, []);
  return loc;
}

export function navigate(path, replace = false) {
  const h = '#' + path;
  if (replace) { history.replaceState(null, '', h); window.dispatchEvent(new Event(EVT)); }
  else if (location.hash !== h) location.hash = h;
  else window.dispatchEvent(new Event(EVT));
}

/** به‌روزرسانی query string بدون رندر مجدد صفحه (برای فیلترها) */
export function setQuery(q) {
  const { path } = parseHash();
  const s = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== '' && v !== null && v !== undefined)).toString();
  history.replaceState(null, '', '#' + path + (s ? '?' + s : ''));
}

/** کامپایل الگوی مسیر مثل /doctor/:id */
export function compile(pattern) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$');
  return { re, keys };
}
export function match(routes, path) {
  for (const r of routes) {
    r._c = r._c || compile(r.path);
    const m = path.match(r._c.re);
    if (m) return { route: r, params: Object.fromEntries(r._c.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}
