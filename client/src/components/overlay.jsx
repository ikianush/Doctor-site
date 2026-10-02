// لایه‌های شناور: اعلان کوتاه (toast)، مودال، دیالوگ تأیید و منوی کشویی
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './ui.jsx';

/* ---------------- مخزن ساده با الگوی subscribe ---------------- */
function createStore(initial) {
  let value = initial;
  const subs = new Set();
  return {
    get: () => value,
    set(fn) { value = fn(value); subs.forEach(s => s(value)); },
    use() {
      const [v, setV] = useState(value);
      useEffect(() => { subs.add(setV); setV(value); return () => subs.delete(setV); }, []);
      return v;
    }
  };
}
let uid = 0;

/* ---------------- Toast ---------------- */
const toasts = createStore([]);
const TOAST_IC = { success: 'check-circle', error: 'x-circle', warn: 'alert', info: 'info' };
export function toast(msg, type = 'info', ms = 4200) {
  const id = ++uid;
  toasts.set(l => [...l, { id, msg, type, out: false }]);
  const close = () => {
    toasts.set(l => l.map(t => (t.id === id ? { ...t, out: true } : t)));
    setTimeout(() => toasts.set(l => l.filter(t => t.id !== id)), 250);
  };
  setTimeout(close, ms);
  return close;
}
export function ToastHost() {
  const list = toasts.use();
  if (!list.length) return null;
  return (
    <div className="toasts">
      {list.map(t => (
        <div key={t.id} className={`toast ${t.type} ${t.out ? 'out' : ''}`} onClick={() => toasts.set(l => l.filter(x => x.id !== t.id))}>
          <Icon name={TOAST_IC[t.type] || 'info'} /><div className="grow">{t.msg}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Modal ---------------- */
const modals = createStore([]);
/**
 * باز کردن مودال: openModal(({close}) => <Modal ...>...</Modal>, {onClose})
 * خروجی: تابع بستن
 */
export function openModal(render, { onClose } = {}) {
  const id = ++uid;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    modals.set(l => l.filter(m => m.id !== id));
    onClose && onClose();
  };
  modals.set(l => [...l, { id, render, close }]);
  return close;
}
export function ModalHost() {
  const list = modals.use();
  return list.map(m => <ModalSlot key={m.id} m={m} />);
}
function ModalSlot({ m }) { return m.render({ close: m.close }); }

export function Modal({ title, size = '', footer, onClose, children, width }) {
  const ref = useRef();
  useEffect(() => {
    const esc = e => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    const first = ref.current?.querySelector('.modal-b input:not([type=hidden]):not([disabled]),.modal-b select,.modal-b textarea');
    const t = first && setTimeout(() => first.focus(), 50);
    return () => { document.removeEventListener('keydown', esc); clearTimeout(t); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return createPortal(
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`modal ${size}`} role="dialog" aria-modal="true" style={width ? { width } : undefined}>
        <div className="modal-h"><h3>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="بستن"><Icon name="x" /></button></div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/** دیالوگ تأیید؛ در صورت input مقدار متن را برمی‌گرداند: {value} */
export function confirmDialog(message, { title = 'تأیید', ok = 'تأیید', danger = false, input = null } = {}) {
  return new Promise(resolve => {
    let done = false;
    openModal(({ close }) => <ConfirmBody {...{ message, title, ok, danger, input, close }} onOk={v => { done = true; close(); resolve(input ? { value: v } : true); }} />,
      { onClose: () => !done && resolve(false) });
  });
}
function ConfirmBody({ message, title, ok, danger, input, close, onOk }) {
  const [v, setV] = useState('');
  return (
    <Modal title={title} size="sm" onClose={close}
      footer={<><button className="btn ghost" onClick={close}>انصراف</button><button className={`btn ${danger ? 'danger' : ''}`} onClick={() => onOk(v)}>{ok}</button></>}>
      <p className="t2">{message}</p>
      {input && <div className="field mt2"><label>{input}</label><input className="input" value={v} onChange={e => setV(e.target.value)} placeholder="اختیاری" /></div>}
    </Modal>
  );
}

/* ---------------- منوی کشویی ---------------- */
/** <Popover anchor={element} onClose={...} width={250}>...</Popover> */
export function Popover({ anchor, onClose, width, className = '', children }) {
  const ref = useRef();
  const [pos, setPos] = useState({ top: -9999, left: 0 });
  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const w = width || ref.current.offsetWidth;
    let left = r.left;
    if (left + w > innerWidth - 10) left = innerWidth - w - 10;
    if (left < 10) left = 10;
    setPos({ top: r.bottom + scrollY + 8, left });
  }, [anchor, width]);
  useEffect(() => {
    const h = e => {
      if (anchor.contains(e.target)) return; // کلیک روی دکمه‌ی بازکننده را خود دکمه مدیریت می‌کند
      if (!ref.current?.contains(e.target) || e.target.closest('a,[data-dd-close]')) onClose();
    };
    const t = setTimeout(() => document.addEventListener('click', h), 0);
    return () => { clearTimeout(t); document.removeEventListener('click', h); };
  }, [anchor, onClose]);
  return createPortal(<div ref={ref} className={`dropdown ${className}`} style={{ ...pos, ...(width ? { width } : {}) }}>{children}</div>, document.body);
}
