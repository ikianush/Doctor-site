// هوک‌های عمومی: بارگذاری داده، تایمر دوره‌ای، دکمه‌ی در حال اجرا
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * بارگذاری داده‌ی غیرهمزمان با جلوگیری از رقابت پاسخ‌ها
 * reload({silent:true}) داده‌ی فعلی را نگه می‌دارد و بی‌صدا تازه می‌کند (برای polling)
 */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: undefined, error: null, loading: true });
  const seq = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const run = useCallback(async ({ silent = false } = {}) => {
    const id = ++seq.current;
    if (!silent) setState(s => ({ ...s, loading: true, error: null }));
    try {
      const data = await fnRef.current();
      if (id === seq.current) setState({ data, error: null, loading: false });
      return data;
    } catch (error) {
      if (id === seq.current) setState(s => ({ data: silent ? s.data : undefined, error: silent ? s.error : error, loading: false }));
    }
  }, []);
  useEffect(() => { run(); return () => { seq.current++; }; }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  const setData = useCallback(up => setState(s => ({ ...s, data: typeof up === 'function' ? up(s.data) : up })), []);
  return { ...state, reload: run, setData };
}

/** اجرای دوره‌ای تابع (با آخرین نسخه‌ی تابع) */
export function useInterval(fn, ms) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!ms) return;
    const t = setInterval(() => ref.current(), ms);
    return () => clearInterval(t);
  }, [ms]);
}

/** وضعیت «در حال اجرا» برای دکمه‌ها: const [busy, run] = useBusy() */
export function useBusy() {
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const run = useCallback(async fn => {
    setBusy(true);
    try { return await fn(); } finally { if (alive.current) setBusy(false); }
  }, []);
  return [busy, run];
}

/** پهنای یک المان (برای نمودارهای واکنش‌گرا) */
export function useWidth(ref, fallback = 600) {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    setW(el.clientWidth || fallback);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || fallback));
    ro.observe(el);
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return w;
}
