// تابع سرورلس Vercel: همه‌ی درخواست‌های /api/* (طبق rewrite در vercel.json) به این تابع می‌رسند
// و به همان سرور Node نوبان سپرده می‌شوند.
const handler = require('../server/server.js');

module.exports = (req, res) => {
  // rewrite آدرس را به /api/index?__path=... تبدیل می‌کند؛ آدرس اصلی را بازسازی می‌کنیم
  const url = new URL(req.url, 'http://x');
  const p = url.searchParams.get('__path');
  if (p !== null) {
    url.searchParams.delete('__path');
    const qs = url.searchParams.toString();
    req.url = '/api/' + p + (qs ? '?' + qs : '');
  }
  return handler(req, res);
};
