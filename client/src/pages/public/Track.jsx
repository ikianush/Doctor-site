// پیگیری نوبت با کد رهگیری و نمایش زنده‌ی صف
import { useEffect, useState } from 'react';
import { get } from '../../lib/api.js';
import { formData } from '../../lib/format.js';
import { useBusy, useInterval } from '../../lib/hooks.js';
import { Icon, SubmitButton } from '../../components/ui.jsx';
import { Ticket, TicketActions, QueueLive } from '../../components/shared.jsx';

export default function Track({ query }) {
  const [q, setQ] = useState(query.code && query.mobile ? { code: query.code, mobile: query.mobile } : null);
  const [res, setRes] = useState(null);
  const [busy, run] = useBusy();

  async function track(p = q) {
    if (!p) return;
    try { setRes({ a: await get('/track/' + p.code, { mobile: p.mobile }) }); }
    catch (e) { setRes({ error: e.message }); }
  }
  useEffect(() => { track(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useInterval(() => res?.a?.queue && track(), 15000); // به‌روزرسانی خودکار جایگاه در صف

  const submit = e => { e.preventDefault(); const p = formData(e.target); setQ(p); run(() => track(p)); };
  return (
    <div className="container" style={{ padding: '40px 0', maxWidth: 620 }}>
      <div style={{ textAlign: 'center' }} className="mb3">
        <div className="avatar lg sq" style={{ background: 'var(--hero)', margin: '0 auto 14px' }}><Icon name="ticket" size="lg" /></div>
        <h1>پیگیری نوبت</h1><p className="t2">با وارد کردن کد رهگیری و شماره موبایل، وضعیت نوبت و جایگاه خود در صف را ببینید.</p>
      </div>
      <div className="card pad"><form className="form-grid" onSubmit={submit}>
        <div className="field"><label>کد رهگیری</label><input className="input ltr" name="code" defaultValue={query.code || ''} placeholder="مثلاً ۴۸۲۹۱۳" required /></div>
        <div className="field"><label>شماره موبایل</label><input className="input ltr" name="mobile" defaultValue={query.mobile || ''} placeholder="۰۹۱۲۱۲۳۴۵۶۷" required /></div>
        <SubmitButton busy={busy} className="btn full"><Icon name="search" size="sm" /> پیگیری</SubmitButton>
      </form></div>
      <div className="mt3">
        {res?.error && <div className="alert error"><Icon name="alert" /><div>{res.error}</div></div>}
        {res?.a && <>
          {res.a.queue && <QueueLive q={res.a.queue} />}
          <div className="mt2"><Ticket a={res.a} /></div>
          <TicketActions a={res.a} className="row mt2" />
        </>}
      </div>
    </div>
  );
}
