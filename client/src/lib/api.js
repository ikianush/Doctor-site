// کلاینت API با مدیریت توکن
const KEY = 'noban_token';
let token = null;
try { token = localStorage.getItem(KEY); } catch { /* حالت خصوصی */ }

export const auth = {
  get token() { return token; },
  set(t) { token = t; try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { } }
};

export class ApiError extends Error {
  constructor(message, status, data) { super(message); this.status = status; this.data = data; }
}

export async function api(path, { method = 'GET', body, query } = {}) {
  let url = '/api' + path;
  if (query) {
    const q = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v !== null && v !== undefined));
    if ([...q].length) url += '?' + q;
  }
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new ApiError('ارتباط با سرور برقرار نشد. اتصال را بررسی کنید.', 0, {});
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) { auth.set(null); window.dispatchEvent(new Event('auth:expired')); }
    throw new ApiError(data.error || 'خطای ناشناخته رخ داد.', res.status, data);
  }
  return data;
}
export const get = (p, query) => api(p, { query });
export const post = (p, body) => api(p, { method: 'POST', body: body || {} });
export const put = (p, body) => api(p, { method: 'PUT', body: body || {} });
export const del = (p, body) => api(p, { method: 'DELETE', body: body || {} });
