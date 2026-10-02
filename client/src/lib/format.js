// قالب‌بندی اعداد، مبالغ و برچسب‌های وضعیت/اولویت
import { fa, en } from './jalali.js';
import { PATHS } from './icons.js';

export { fa, en };
export const money = n => fa(Number(n || 0).toLocaleString('en-US').replace(/,/g, '٬')) + ' تومان';
export const num = n => fa(Number(n || 0).toLocaleString('en-US').replace(/,/g, '٬'));
export const pct = n => fa(n) + '٪';

export const STATUS = {
  booked: ['رزرو شده', 'blue'], checked_in: ['پذیرش شده', 'purple'], in_visit: ['در حال ویزیت', 'teal'],
  done: ['انجام شده', 'green'], cancelled: ['لغو شده', 'red'], no_show: ['عدم مراجعه', 'orange'],
  waiting: ['در انتظار', 'orange'], promoted: ['نوبت گرفت', 'green'], expired: ['منقضی', ''], open: ['باز', 'orange'], answered: ['پاسخ داده شد', 'green']
};
export const PRIO = {
  urgent: ['اورژانسی', 'red', 'flame'], disabled: ['معلولیت', 'purple', 'user'], pregnant: ['بارداری', 'purple', 'heart'],
  elderly: ['سالمند', 'orange', 'user'], child: ['کودک', 'cyan', 'baby'], normal: ['عادی', '', 'user']
};
/** اولویت‌هایی که بیمار هنگام رزرو انتخاب می‌کند (کودک خودکار تشخیص داده می‌شود) */
export const PRIO_CHOICES = Object.entries(PRIO).filter(([k]) => k !== 'child');
export const SPEC_ICON = n => (PATHS[n] ? n : 'stethoscope');
export const ROLE_LABEL = { patient: 'بیمار', doctor: 'پزشک', admin: 'مدیر سامانه' };
export const homeFor = role => ({ patient: '/panel', doctor: '/dr', admin: '/admin' }[role] || '/');

const GRADS = [['#2563eb', '#0fb5a6'], ['#7c3aed', '#db2777'], ['#0891b2', '#22c55e'], ['#ea580c', '#f59e0b'], ['#4f46e5', '#06b6d4'], ['#be185d', '#f97316'], ['#0f766e', '#84cc16'], ['#1d4ed8', '#9333ea']];
function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
export const gradientOf = name => GRADS[hash(name) % GRADS.length];
export function initials(name = '') {
  const parts = String(name).replace(/^دکتر\s+/, '').trim().split(/\s+/);
  return (parts[0]?.[0] || '') + (parts[1] ? '‌' + parts[1][0] : '');
}

/** خواندن مقادیر یک فرم (اعداد فارسی به لاتین تبدیل می‌شوند) */
export function formData(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') {
      if (el.dataset.multi !== undefined) { o[el.name] = o[el.name] || []; if (el.checked) o[el.name].push(el.value); }
      else o[el.name] = el.checked;
    } else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
    else o[el.name] = en(el.value.trim());
  }
  return o;
}
export const splitList = s => String(s || '').split(/[،,]/).map(x => x.trim()).filter(Boolean);
