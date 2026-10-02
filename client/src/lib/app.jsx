// وضعیت سراسری برنامه (Context): اطلاعات پایه، کاربر واردشده، تعداد اعلان‌ها و تم
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { get, post, auth } from './api.js';
import { navigate } from './router.js';
import { toast } from '../components/overlay.jsx';

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

/* ---------------- تم روشن/تیره ---------------- */
function readTheme() {
  try { const t = localStorage.getItem('noban_theme'); if (t) return t; } catch { }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function AppProvider({ children }) {
  const [meta, setMeta] = useState(null);
  const [user, setUser] = useState(null);
  const [booted, setBooted] = useState(false);
  const [bootError, setBootError] = useState(null);
  const [theme, setTheme] = useState(readTheme);
  const lastTopId = useRef(null);
  const userRef = useRef(null);
  userRef.current = user;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('noban_theme', theme); } catch { }
  }, [theme]);
  const toggleTheme = useCallback(() => setTheme(t => (t === 'dark' ? 'light' : 'dark')), []);

  const refreshMeta = useCallback(async () => { const m = await get('/meta'); setMeta(m); return m; }, []);
  const setUnread = useCallback(n => setUser(u => (u ? { ...u, unread: n } : u)), []);
  const patchUser = useCallback(p => setUser(u => (u ? { ...u, ...p } : u)), []);

  /** همگام‌سازی تعداد اعلان‌ها؛ در صورت announce اعلان‌های تازه به‌صورت toast نمایش داده می‌شوند */
  const refreshUnread = useCallback(async (announce = false) => {
    if (!userRef.current) return;
    try {
      const me = await get('/me');
      if (announce && me.unread > (userRef.current?.unread || 0)) {
        const list = await get('/notifications');
        list.filter(n => !n.read && (lastTopId.current === null || n.id > lastTopId.current)).slice(0, 2)
          .forEach(n => toast(<><b>{n.title}</b><div className="small t2">{n.body}</div></>, n.type === 'cancelled' ? 'warn' : 'info', 7000));
        if (list[0]) lastTopId.current = list[0].id;
      }
      setUnread(me.unread);
    } catch { }
  }, [setUnread]);

  const login = useCallback(async data => {
    auth.set(data.token);
    const me = await get('/me');
    const list = await get('/notifications').catch(() => []);
    lastTopId.current = list[0]?.id ?? 0;
    setUser(me);
    return me;
  }, []);

  const logout = useCallback(async () => {
    try { await post('/auth/logout'); } catch { }
    auth.set(null);
    setUser(null);
    toast('با موفقیت از حساب خارج شدید.', 'success');
    navigate('/');
  }, []);

  /* راه‌اندازی اولیه */
  useEffect(() => {
    (async () => {
      try { setMeta(await get('/meta')); } catch (e) { setBootError(e); return; }
      if (auth.token) {
        try {
          setUser(await get('/me'));
          const l = await get('/notifications');
          lastTopId.current = l[0]?.id ?? 0;
        } catch { auth.set(null); }
      }
      setBooted(true);
    })();
    const expired = () => { setUser(null); toast('نشست شما منقضی شد. لطفاً دوباره وارد شوید.', 'warn'); navigate('/login'); };
    window.addEventListener('auth:expired', expired);
    const t = setInterval(() => refreshUnread(true), 15000);
    return () => { window.removeEventListener('auth:expired', expired); clearInterval(t); };
  }, [refreshUnread]);

  const value = { meta, user, booted, bootError, theme, toggleTheme, refreshMeta, login, logout, setUnread, refreshUnread, patchUser, siteName: meta?.settings.siteName || 'نوبان' };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
