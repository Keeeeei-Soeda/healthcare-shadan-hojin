// 本番 entry-live/・kanrishi-live/（投影資料用ウェイティングリスト）の画面撮影（docs/entry-waitlist-test-report.md）
//   node scripts/live-prod-shots.js                                       … 送信しない範囲（シートへの書き込みなし）
//   HOSPITAL_EMAIL=a@example.com KANRISHI_EMAIL=b@example.com node scripts/live-prod-shots.js
//                                                                        … 両ページで1件ずつ送信（テストデータ消去が必要）
const { chromium } = require('playwright');

const BASE = 'https://www.iha-as.com';
const OUT = 'docs/entry-screenshots';
const PAGES = [
  { path: '/entry-live/', key: 'hospital', email: process.env.HOSPITAL_EMAIL },
  { path: '/kanrishi-live/', key: 'kanrishi', email: process.env.KANRISHI_EMAIL },
];

async function open(page, path) {
  await page.goto(BASE + path + '?t=' + Date.now(), { waitUntil: 'networkidle' });
}

async function fill(page, email) {
  await page.fill('#name', 'テスト 花子');
  await page.fill('#facility', 'テスト病院');
  await page.fill('#email', email);
  await page.check('#agree');
}

async function shot(page, name) {
  await page.waitForTimeout(700);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log('saved', name + '.png');
}

async function send(page) {
  await page.click('#nextBtn');
  await page.click('#sendBtn');
  await page.waitForSelector('#waitResult.visible, #closed.visible, #sendError.visible, #formError.visible', { timeout: 40000 });
  return page.evaluate(() => {
    const vis = id => document.getElementById(id).classList.contains('visible');
    return {
      panel: ['waitResult', 'closed'].find(vis) || (vis('formError') ? 'formError' : 'sendError'),
      label: document.querySelector('#waitResult .ticket-label').textContent,
      tag: document.querySelector('#waitResult .prog-tag').textContent,
      pos: document.getElementById('waitPos').textContent,
      code: document.getElementById('waitCode').textContent,
      repeat: vis('waitRepeatBadge'),
      error: document.getElementById('formError').textContent || document.getElementById('sendError').textContent,
      focus: document.activeElement.id,
    };
  });
}

(async () => {
  const browser = await chromium.launch();
  const log = (k, v) => console.log(k.padEnd(26), typeof v === 'string' ? v : JSON.stringify(v));

  for (const pg of PAGES) {
    const name = `live-${pg.key}`;
    for (const vp of [{ n: 'mobile', w: 390, h: 844 }, { n: 'mobile360', w: 360, h: 800 }, { n: 'desktop', w: 1280, h: 900 }]) {
      const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
      await open(page, pg.path);
      log(`${name} ${vp.n} h-scroll`, String(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
      if (vp.n === 'mobile360') { await page.close(); continue; }
      await shot(page, `${name}-${vp.n}-01-input`);

      if (vp.n === 'mobile') {
        await fill(page, 'test@gmial.com');
        log(`${name} gmial.com`, await send(page));
        await shot(page, `${name}-mobile-02-error-typo`);
      }

      await fill(page, 'hanako@example.jp');
      await page.click('#nextBtn');
      await shot(page, `${name}-${vp.n}-03-confirm`);

      if (vp.n === 'mobile' && pg.email) {
        await open(page, pg.path);
        await fill(page, pg.email);
        log(`${name} submit`, await send(page));
        await shot(page, `${name}-mobile-04-result`);
        await open(page, pg.path);
        await fill(page, pg.email);
        log(`${name} repeat`, await send(page));
        await shot(page, `${name}-mobile-05-result-repeat`);
      }
      await page.close();
    }
  }
  await browser.close();
})();
