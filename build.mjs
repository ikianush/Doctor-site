// ساخت باندل React با esbuild: client/src/main.jsx ← public/assets/js/app.js
// اجرا: npm run build   |   حالت توسعه (بازسازی خودکار با هر تغییر): npm run dev
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const options = {
  entryPoints: ['client/src/main.jsx'],
  bundle: true,
  outfile: 'public/assets/js/app.js',
  format: 'esm',
  jsx: 'automatic',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  target: ['es2020'],
  charset: 'utf8',
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
  logLevel: 'info'
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('در حال پایش تغییرات client/src ...');
} else {
  await esbuild.build(options);
}
