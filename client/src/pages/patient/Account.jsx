// صفحات حساب کاربری مشترک بیمار و پزشک: اعلان‌ها و پروفایل/امنیت
import { useApp } from '../../lib/app.jsx';
import { get, post, put } from '../../lib/api.js';
import * as J from '../../lib/jalali.js';
import { fa, formData } from '../../lib/format.js';
import { navigate } from '../../lib/router.js';
import { useAsync, useBusy } from '../../lib/hooks.js';
import { Icon, Loader, Empty, AsyncButton, SubmitButton } from '../../components/ui.jsx';
import { toast } from '../../components/overlay.jsx';
import { NotifItem } from '../../layouts/Layouts.jsx';

export function Notifications() {
  const { setUnread, refreshUnread } = useApp();
  const res = useAsync(() => get('/notifications'), []);
  if (!res.data) return <Loader />;
  const list = res.data;
  const readAll = async () => { await post('/notifications/read-all'); setUnread(0); res.setData(l => l.map(n => ({ ...n, read: true }))); };
  const open = async n => {
    await post(`/notifications/${n.id}/read`);
    refreshUnread();
    if (n.link) navigate(n.link);
    else res.setData(l => l.map(x => (x.id === n.id ? { ...x, read: true } : x)));
  };
  return <>
    <div className="page-head"><div><h1>اعلان‌ها</h1><p>{fa(list.filter(n => !n.read).length)} اعلان خوانده‌نشده</p></div>
      <AsyncButton className="btn ghost" onClick={readAll}><Icon name="check" size="sm" /> علامت‌گذاری همه به‌عنوان خوانده‌شده</AsyncButton></div>
    <div className="card">{list.length ? list.map(n => <NotifItem key={n.id} n={n} onClick={() => open(n)} />) : <Empty title="اعلانی ندارید" icon="bell" />}</div>
  </>;
}

/** فرم اطلاعات شخصی + تغییر رمز (embedded: بدون سربرگ صفحه، برای پروفایل پزشک) */
export function Profile({ embedded = false }) {
  const { meta: m, patchUser } = useApp();
  const res = useAsync(() => get('/me'), []);
  const [saving, runSave] = useBusy();
  const [changing, runPw] = useBusy();
  if (!res.data) return <Loader />;
  const u = res.data;
  const isPatient = u.role === 'patient';
  const save = e => {
    e.preventDefault();
    const d = formData(e.target);
    runSave(async () => { try { const r = await put('/me', d); patchUser(r); toast('اطلاعات با موفقیت ذخیره شد.', 'success'); } catch (err) { toast(err.message, 'error'); } });
  };
  const changePw = e => {
    e.preventDefault();
    const f = e.target;
    runPw(async () => { try { await put('/me/password', formData(f)); f.reset(); toast('رمز عبور تغییر کرد.', 'success'); } catch (err) { toast(err.message, 'error'); } });
  };
  return <>
    {!embedded && <div className="page-head"><div><h1>پروفایل و امنیت</h1><p>اطلاعات حساب کاربری خود را به‌روز نگه دارید.</p></div></div>}
    <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr', alignItems: 'start' }}>
      <form className="card" onSubmit={save}><div className="card-h"><h3><Icon name="user" /> اطلاعات شخصی</h3></div><div className="card-b form-grid">
        <div className="field full"><label>نام و نام خانوادگی</label><input className="input" name="name" defaultValue={u.name} /></div>
        <div className="field"><label>شماره موبایل</label><input className="input ltr" defaultValue={u.mobile} disabled /></div>
        <div className="field"><label>کد ملی</label><input className="input ltr" name="nationalCode" defaultValue={u.nationalCode || ''} /></div>
        <div className="field"><label>سال تولد (میلادی)</label><input className="input ltr" name="birthYear" defaultValue={u.birthYear || ''} /></div>
        <div className="field"><label>جنسیت</label><select className="select" name="gender" defaultValue={u.gender === 'f' ? 'f' : 'm'}><option value="m">آقا</option><option value="f">خانم</option></select></div>
        <div className="field"><label>شهر</label><input className="input" name="city" defaultValue={u.city || ''} /></div>
        {isPatient && <>
          <div className="field"><label>بیمه</label><select className="select" name="insurance" defaultValue={u.insurance || ''}><option value="">آزاد</option>{m.insurances.map(i => <option key={i}>{i}</option>)}</select></div>
          <div className="field"><label>گروه خونی</label><select className="select" name="bloodType" defaultValue={u.bloodType || ''}><option value="">نامشخص</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(b => <option key={b}>{b}</option>)}</select></div>
          <div className="field"><label>تماس اضطراری</label><input className="input" name="emergencyContact" defaultValue={u.emergencyContact || ''} placeholder="نام و شماره" /></div>
          <div className="field full"><label>حساسیت دارویی / غذایی</label><input className="input" name="allergies" defaultValue={u.allergies || ''} placeholder="مثلاً: پنی‌سیلین" /></div>
        </>}
        <div className="full"><SubmitButton busy={saving}><Icon name="check" size="sm" /> ذخیره‌ی تغییرات</SubmitButton></div>
      </div></form>
      <div className="col" style={{ gap: 18 }}>
        <form className="card" onSubmit={changePw}><div className="card-h"><h3><Icon name="lock" /> تغییر رمز عبور</h3></div><div className="card-b col">
          <div className="field"><label>رمز فعلی</label><input className="input ltr" type="password" name="current" required /></div>
          <div className="field"><label>رمز جدید</label><input className="input ltr" type="password" name="next" required minLength={6} /></div>
          <SubmitButton busy={changing} className="btn soft"><Icon name="lock" size="sm" /> تغییر رمز</SubmitButton>
        </div></form>
        <div className="card pad"><div className="row"><Icon name="shield" /><b>امنیت حساب</b></div><p className="small t2 mt1">رمزهای عبور با الگوریتم scrypt و salt اختصاصی هش می‌شوند. پس از ۵ تلاش ناموفق، ورود به مدت ۵ دقیقه مسدود می‌شود.</p><div className="xs muted mt1">عضویت از: {J.long(J.isoToYmd(u.createdAt))}</div></div>
      </div>
    </div>
  </>;
}
