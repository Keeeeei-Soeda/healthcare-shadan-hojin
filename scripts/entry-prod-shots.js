// 本番 entry/ の画面撮影（docs/entry-ticket-test-report.md）
//   node scripts/entry-prod-shots.js                          … 送信しない範囲（シートへの書き込みなし）
//   SUBMIT_EMAIL=you@example.com node scripts/entry-prod-shots.js … 実際に1件送信（テストデータ消去が必要）
const { chromium } = require('playwright');

const URL = 'https://www.iha-as.com/entry/';
const OUT = 'docs/entry-screenshots';
const SUBMIT_EMAIL = process.env.SUBMIT_EMAIL || '';

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 900 },
];

async function fill(page, email) {
  await page.fill('#name', 'テスト 太郎');
  await page.fill('#facility', 'テスト病院 事務部');
  await page.fill('#email', email);
  await page.check('#agree');
}

async function shot(page, vp, name) {
  await page.waitForTimeout(700);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}/${vp.name}-${name}.png`, fullPage: true });
  console.log('saved', `${vp.name}-${name}.png`);
}

(async () => {
  const browser = await chromium.launch();
  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto(URL + '?t=' + Date.now(), { waitUntil: 'networkidle' });
    const hscroll = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    console.log(vp.name, 'h-scroll:', hscroll);
    await shot(page, vp, '01-input');

    await page.click('#nextBtn');
    await shot(page, vp, '02-error-empty');

    await fill(page, 'test@no-such-domain-iha-as.com');
    await page.click('#nextBtn');
    await shot(page, vp, '03-confirm');

    if (vp.name === 'mobile') {
      await page.click('#sendBtn');
      await page.waitForSelector('#formError.visible', { timeout: 30000 });
      console.log('domain error:', await page.textContent('#formError'));
      await shot(page, vp, '04-error-domain');

      if (SUBMIT_EMAIL) {
        await fill(page, SUBMIT_EMAIL);
        await page.click('#nextBtn');
        await page.click('#sendBtn');
        await page.waitForSelector('#result.visible, #waitResult.visible, #closed.visible, #sendError.visible', { timeout: 40000 });
        const state = await page.evaluate(() => ['result', 'waitResult', 'closed'].find(id => document.getElementById(id).classList.contains('visible'))
          || 'sendError:' + document.getElementById('sendError').textContent);
        console.log('submit result:', state, await page.textContent('#ticketNo'), await page.textContent('#ticketCode'));
        await shot(page, vp, '05-ticket');

        await page.reload({ waitUntil: 'networkidle' });
        await fill(page, SUBMIT_EMAIL);
        await page.click('#nextBtn');
        await page.click('#sendBtn');
        await page.waitForSelector('#result.visible, #waitResult.visible, #sendError.visible', { timeout: 40000 });
        console.log('repeat badge:', await page.$eval('#repeatBadge', e => e.classList.contains('visible')), await page.textContent('#ticketNo'));
        await shot(page, vp, '06-ticket-repeat');
      }
    }
    await page.close();
  }
  await browser.close();
})();
