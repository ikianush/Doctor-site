// ورود (رمز عبور / کد یکبارمصرف) و ثبت‌نام بیماران
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../lib/app.jsx';
import { post } from '../../lib/api.js';
import * as J from '../../lib/jalali.js';
import { formData, homeFor } from '../../lib/format.js';
import { navigate } from '../../lib/router.js';
import { useBusy } from '../../lib/hooks.js';
import { Icon, SubmitButton, Tabs } from '../../components/ui.jsx';
import { toast } from '../../components/overlay.jsx';

function AuthShell({ children }) {
  const { siteName } = useApp();
  return (
    <div className="auth">
      <div className="auth-side"><div className="hero-pattern" />
        <a href="#/" className="logo" style={{ color: '#fff', position: 'relative' }}><span className="logo-mark" style={{ background: 'rgba(255,255,255,.18)' }}><Icon name="logo" /></span>{siteName}</a>
        <div style={{ position: 'relative' }}><h2>سلامتی شما،<br />فقط یک کلیک فاصله دارد</h2>
          <div className="col mt3" style={{ gap: 14 }}>{[['zap', 'رزرو آنی نوبت در کمتر از یک دقیقه'], ['hourglass', 'صف انتظار هوشمند با رزرو خودکار'], ['bell', 'یادآوری پیامکی پیش از نوبت'], ['file', 'پرونده‌ی سلامت و نسخه‌های الکترونیک']].map(([i, t]) => <div key={t} className="row"><Icon name={i} /><span>{t}</span></div>)}</div></div>
        <div style={{ position: 'relative', opacity: 0.8 }} className="small"><Icon name="lock" size="sm" /> اطلاعات شما با رمزنگاری امن نگهداری می‌شود.</div>
      </div>
      <div className="auth-form"><div className="box">{children}</div></div>
    </div>
  );
}

/** پس از ورود موفق: ذخیره‌ی نشست و هدایت به پنل یا صفحه‌ی قبلی */
function useAfterLogin(query) {
  const { login } = useApp();
  return async data => {
    await login(data);
    toast(`${data.user.name} عزیز، خوش آمدید 👋`, 'success');
    navigate(query.next && data.user.role === 'patient' ? query.next : homeFor(data.user.role));
  };
}

export function Login({ query }) {
  const { user } = useApp();
  const afterLogin = useAfterLogin(query);
  const [mode, setMode] = useState('pw');
  const [otp, setOtp] = useState(null); // {demoCode}
  const [digits, setDigits] = useState(['', '', '', '', '']);
  const [busy, run] = useBusy();
  const form = useRef();
  const otpRefs = useRef([]);

  useEffect(() => {
    if (user) navigate(query.next && !query.next.startsWith('/login') ? query.next : homeFor(user.role), true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (otp) otpRefs.current[0]?.focus(); }, [otp]);

  const switchMode = m => { setMode(m); setOtp(null); setDigits(['', '', '', '', '']); };
  const submit = (e, override) => {
    e?.preventDefault();
    const d = override || formData(form.current);
    run(async () => {
      try {
        if (mode === 'pw' || override) return await afterLogin(await post('/auth/login', d));
        if (!otp) { const r = await post('/auth/otp', { mobile: d.mobile }); setOtp({ demoCode: r.demoCode }); return; }
        await afterLogin(await post('/auth/otp/verify', { mobile: d.mobile, code: digits.join('') }));
      } catch (err) { toast(err.message, 'error'); }
    });
  };
  const typeDigit = (i, v) => {
    v = J.en(v).replace(/\D/g, '').slice(-1);
    const next = digits.map((x, k) => (k === i ? v : x));
    setDigits(next);
    if (v && otpRefs.current[i + 1]) otpRefs.current[i + 1].focus();
    if (next.every(Boolean)) setTimeout(() => form.current.requestSubmit(), 0);
  };
  const demo = mobile => { if (mode !== 'pw') switchMode('pw'); submit(null, { mobile, password: '123456' }); };

  return (
    <AuthShell>
      <a href="#/" className="small t2"><Icon name="arrow-right" size="sm" /> بازگشت به سایت</a>
      <h1 className="mt2" style={{ fontSize: 26 }}>ورود به حساب کاربری</h1><p className="t2 mb3">بیماران، پزشکان و مدیران از این صفحه وارد شوند.</p>
      <Tabs className="mb3 tabs-grow" style={{ width: '100%' }} value={mode} onChange={switchMode}
        tabs={[['pw', <><Icon name="lock" size="sm" /> با رمز عبور</>], ['otp', <><Icon name="mobile" size="sm" /> با کد یکبارمصرف</>]]} />
      <form ref={form} className="col" style={{ gap: 16 }} onSubmit={submit}>
        <div className="field"><label>شماره موبایل</label><div className="input-icon"><Icon name="mobile" /><input className="input ltr" name="mobile" inputMode="numeric" placeholder="09xxxxxxxxx" required autoComplete="username" /></div></div>
        {mode === 'pw' && <div className="field"><label>رمز عبور</label><div className="input-icon"><Icon name="lock" /><input className="input ltr" type="password" name="password" placeholder="••••••" autoComplete="current-password" /></div></div>}
        {otp && <div>
          <div className="alert success"><Icon name="message" /><div><b>کد تأیید پیامک شد</b><p>نسخه‌ی نمایشی — کد شما: <span className="code">{otp.demoCode}</span></p></div></div>
          <div className="otp mt2">{digits.map((v, i) => <input key={i} ref={el => (otpRefs.current[i] = el)} maxLength={1} inputMode="numeric" value={v}
            onChange={e => typeDigit(i, e.target.value)} onKeyDown={e => e.key === 'Backspace' && !v && otpRefs.current[i - 1]?.focus()} />)}</div>
        </div>}
        <SubmitButton busy={busy} className="btn lg block">
          {mode === 'pw' ? <><Icon name="login" /> ورود</> : otp ? <><Icon name="check" /> تأیید و ورود</> : <><Icon name="send" /> ارسال کد تأیید</>}
        </SubmitButton>
      </form>
      <p className="small t2 mt2" style={{ textAlign: 'center' }}>حساب کاربری ندارید؟ <a href={`#/register${query.next ? '?next=' + encodeURIComponent(query.next) : ''}`} style={{ color: 'var(--primary)', fontWeight: 700 }}>ثبت‌نام کنید</a></p>
      <div className="divider" />
      <div className="small semi" style={{ marginBottom: 10 }}><Icon name="zap" size="sm" /> ورود سریع با حساب‌های نمایشی:</div>
      <div className="demo-accounts">
        <button type="button" onClick={() => demo('09120000003')}><Icon name="user" size="lg" />بیمار</button>
        <button type="button" onClick={() => demo('09120000002')}><Icon name="stethoscope" size="lg" />پزشک</button>
        <button type="button" onClick={() => demo('09120000001')}><Icon name="shield" size="lg" />مدیر</button>
      </div>
    </AuthShell>
  );
}

export function Register({ query }) {
  const { user, meta } = useApp();
  const afterLogin = useAfterLogin(query);
  const [busy, run] = useBusy();
  useEffect(() => { if (user) navigate(homeFor(user.role), true); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = e => {
    e.preventDefault();
    const d = formData(e.target);
    if (d.birthYear && +d.birthYear < 1500) d.birthYear = J.toGregorian(+d.birthYear, 6, 1).gy; // تبدیل سال شمسی به میلادی
    run(async () => { try { await afterLogin(await post('/auth/register', d)); } catch (err) { toast(err.message, 'error'); } });
  };
  return (
    <AuthShell>
      <a href="#/login" className="small t2"><Icon name="arrow-right" size="sm" /> بازگشت به ورود</a>
      <h1 className="mt2" style={{ fontSize: 26 }}>ساخت حساب کاربری</h1><p className="t2 mb3">ثبت‌نام بیماران — کمتر از یک دقیقه</p>
      <form className="form-grid" onSubmit={submit}>
        <div className="field full"><label>نام و نام خانوادگی *</label><input className="input" name="name" required /></div>
        <div className="field"><label>شماره موبایل *</label><input className="input ltr" name="mobile" placeholder="09xxxxxxxxx" required /></div>
        <div className="field"><label>کد ملی</label><input className="input ltr" name="nationalCode" maxLength={10} placeholder="اختیاری" /></div>
        <div className="field"><label>سال تولد (میلادی یا شمسی)</label><input className="input ltr" name="birthYear" placeholder="مثلاً ۱۳۷۰" /></div>
        <div className="field"><label>جنسیت</label><div className="chips-select"><label><input type="radio" name="gender" value="m" defaultChecked /><span>آقا</span></label><label><input type="radio" name="gender" value="f" /><span>خانم</span></label></div></div>
        <div className="field"><label>شهر</label><select className="select" name="city">{meta.cities.map(c => <option key={c}>{c}</option>)}</select></div>
        <div className="field"><label>بیمه</label><select className="select" name="insurance"><option value="">آزاد</option>{meta.insurances.map(c => <option key={c}>{c}</option>)}</select></div>
        <div className="field full"><label>رمز عبور * (حداقل ۶ کاراکتر)</label><input className="input ltr" type="password" name="password" required minLength={6} /></div>
        <label className="check full"><input type="checkbox" required /> <span className="small">قوانین و حریم خصوصی سامانه را می‌پذیرم.</span></label>
        <SubmitButton busy={busy} className="btn lg full"><Icon name="user-plus" /> ثبت‌نام و ورود</SubmitButton>
      </form>
    </AuthShell>
  );
}
