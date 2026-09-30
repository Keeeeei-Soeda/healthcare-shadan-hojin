const FORMSPREE_URL = 'https://formspree.io/f/xgojnqbg';
const SHEET_SYNC_URL =
  'https://script.google.com/macros/s/AKfycbw_Mw6DxMjTwShSN3ppdj4jHq-Z3hZV1D5OuJyBeDax-t3L_ORg8ia1cCtTL83yIx0i/exec';

async function mockExternalApis(page, { formspreeOk = true } = {}) {
  await page.route(FORMSPREE_URL, (route) => {
    if (formspreeOk) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
      return;
    }

    route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({
        error: '送信に失敗しました。時間をおいて再度お試しください。',
      }),
    });
  });

  await page.route(SHEET_SYNC_URL, (route) => {
    route.fulfill({ status: 200, body: 'ok' });
  });
}

module.exports = { mockExternalApis };
