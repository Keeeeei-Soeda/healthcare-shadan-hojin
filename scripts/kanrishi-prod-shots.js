// 本番 kanrishi/ の画面撮影＋病院向け entry/ の回帰確認（docs/kanrishi-test-report.md）
//   node scripts/kanrishi-prod-shots.js                     … 送信しない範囲（シートへの書き込みなし）
//   SUBMIT_EMAIL=a@example.com HOSPITAL_EMAIL=b@example.com node scripts/kanrishi-prod-shots.js
//                                                          … 管理士・病院向けに1件ずつ送信（テストデータ消去が必要）
//   WAIT_EMAIL=c@example.com node scripts/kanrishi-prod-shots.js
//                                                          … 管理士のキャンセル待ち（K-001〜K-050 が埋まった状態で実行）
const { chromium } = require('playwright');

const BASE = 'https://www.iha-as.com';
const OUT = 'docs/entry-screenshots';
const { SUBMIT_EMAIL, HOSPITAL_EMAIL, WAIT_EMAIL } = process.env;

async function open(page, path) {
  await page.goto(BASE + path + '?t=' + Date.now(), { waitUntil: 'networkidle' });
}

async function fill(page, email, agree = true) {
  await page.fill('#name', 'テスト 花子');
  await page.fill('#facility', 'テスト株式会社');
  await page.fill('#email', email);
  if (agree) await page.check('#agree');
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
  await page.waitForSelector('#result.visible, #waitResult.visible, #closed.visible, #sendError.visible, #formError.visible', { timeout: 40000 });
  return page.evaluate(() => {
    const vis = id => document.getElementById(id).classList.contains('visible');
    const panel = ['result', 'waitResult', 'closed'].find(vis) || (vis('formError') ? 'formError' : 'sendError');
    return {
      panel,
      ticket: document.getElementById('ticketNo').textContent,
      code: document.getElementById(panel === 'waitResult' ? 'waitCode' : 'ticketCode').textContent,
      pos: document.getElementById('waitPos').textContent,
      repeat: vis('repeatBadge') || vis('waitRepeatBadge'),
      error: document.getElementById('formError').textContent || document.getElementById('sendError').textContent,
      focus: document.activeElement.id,
    };
  });
}

(async () => {
  const browser = await chromium.launch();
  const log = (k, v) => console.log(k.padEnd(22), typeof v === 'string' ? v : JSON.stringify(v));

  if (WAIT_EMAIL) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await open(page, '/kanrishi/');
    await fill(page, WAIT_EMAIL);
    log('waitlist', await send(page));
    await shot(page, 'kanrishi-mobile-07-waitlist');
    await open(page, '/kanrishi/');
    await fill(page, WAIT_EMAIL);
    log('waitlist repeat', await send(page));
    await shot(page, 'kanrishi-mobile-08-waitlist-repeat');
    await browser.close();
    return;
  }

  for (const vp of [{ name: 'mobile', width: 390, height: 844 }, { name: 'mobile360', width: 360, height: 800 }, { name: 'desktop', width: 1280, height: 900 }]) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await open(page, '/kanrishi/');
    log(`${vp.name} h-scroll`, String(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
    if (vp.name === 'mobile360') { await page.close(); continue; }
    await shot(page, `kanrishi-${vp.name}-01-input`);

    await page.click('#nextBtn');
    await shot(page, `kanrishi-${vp.name}-02-error-empty`);

    if (vp.name === 'mobile') {
      await fill(page, '=x@example.jp');
      await page.click('#nextBtn');
      log('=x@example.jp', await page.textContent('#formError'));
      await shot(page, 'kanrishi-mobile-03-error-format');

      await page.fill('#email', 'test@gmial.com');
      log('gmial.com', await send(page));
      await shot(page, 'kanrishi-mobile-04-error-typo');

      await page.fill('#email', 'test@no-such-domain-iha-as.com');
      log('nx domain', await send(page));
    }

    await fill(page, 'hanako@example.jp');
    await page.click('#nextBtn');
    await shot(page, `kanrishi-${vp.name}-05-confirm`);

    if (vp.name === 'mobile' && SUBMIT_EMAIL) {
      await open(page, '/kanrishi/');
      await fill(page, SUBMIT_EMAIL);
      log('kanrishi submit', await send(page));
      await shot(page, 'kanrishi-mobile-06-ticket');
      await open(page, '/kanrishi/');
      await fill(page, SUBMIT_EMAIL);
      log('kanrishi repeat', await send(page));
      await shot(page, 'kanrishi-mobile-06b-ticket-repeat');
    }
    await page.close();
  }

  if (HOSPITAL_EMAIL) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await open(page, '/entry/');
    await fill(page, HOSPITAL_EMAIL);
    log('hospital regression', await send(page));
    await shot(page, 'kanrishi-regression-entry-ticket');
    await page.close();
  }
  await browser.close();
})();
