// 本番 entry/ のキャンセル待ち画面撮影（全番号が「発行済」の状態で実行。テストデータ消去が必要）
//   SUBMIT_EMAIL=you@example.com node scripts/entry-wait-shot.js
const { chromium } = require('playwright');

const URL = 'https://www.iha-as.com/entry/';
const OUT = 'docs/entry-screenshots';
const EMAIL = process.env.SUBMIT_EMAIL;

async function submit(page) {
  await page.goto(URL + '?t=' + Date.now(), { waitUntil: 'networkidle' });
  await page.fill('#name', 'テスト 花子');
  await page.fill('#facility', 'テスト病院 医事課');
  await page.fill('#email', EMAIL);
  await page.check('#agree');
  await page.click('#nextBtn');
  await page.click('#sendBtn');
  await page.waitForSelector('#result.visible, #waitResult.visible, #closed.visible, #sendError.visible', { timeout: 40000 });
  await page.waitForTimeout(700);
  await page.evaluate(() => window.scrollTo(0, 0));
  return page.evaluate(() => ({
    panel: ['result', 'waitResult', 'closed'].find(id => document.getElementById(id).classList.contains('visible')) || 'sendError',
    pos: document.getElementById('waitPos').textContent,
    code: document.getElementById('waitCode').textContent,
    repeat: document.getElementById('waitRepeatBadge').classList.contains('visible'),
    error: document.getElementById('sendError').textContent,
  }));
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  console.log('first :', JSON.stringify(await submit(page)));
  await page.screenshot({ path: `${OUT}/mobile-07-waitlist.png`, fullPage: true });

  console.log('repeat:', JSON.stringify(await submit(page)));
  await page.screenshot({ path: `${OUT}/mobile-08-waitlist-repeat.png`, fullPage: true });

  await browser.close();
})();
