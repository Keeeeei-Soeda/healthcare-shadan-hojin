const { test, expect } = require('@playwright/test');
const { mockExternalApis } = require('./helpers/mock-apis');
const { createFlowRecorder } = require('./helpers/flow-recorder');

test.describe('お問い合わせ操作フロー（スクショ付き）', () => {
  test.describe.configure({ mode: 'serial' });

  test('トップから送信完了までの全手順', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockExternalApis(page);

    const flow = createFlowRecorder(page, {
      title: 'お問い合わせフォーム操作フロー',
    });

    await page.goto('/index.html');
    await expect(page.getByRole('link', { name: 'お問い合わせはこちら' })).toBeVisible();
    await flow.capture(
      'トップページを表示',
      'サイトトップ（index.html）を開きます。ヘッダーとページ下部のお問い合わせ導線を確認します。'
    );

    await page.locator('#contact').scrollIntoViewIfNeeded();
    await flow.capture(
      'お問い合わせセクションを表示',
      'ページ下部の CTA セクション（#contact）までスクロールし、「お問い合わせはこちら」ボタンを確認します。'
    );

    await page.getByRole('link', { name: 'お問い合わせはこちら' }).click();
    await expect(page).toHaveURL(/contact\.html/);
    await expect(page.locator('#contactForm')).toBeVisible();
    await flow.capture(
      '問い合わせページへ遷移',
      '「お問い合わせはこちら」をクリックし、contact.html のフォーム画面へ遷移します。'
    );

    await page.fill('#name', 'テスト太郎');
    await page.fill('#org', 'テスト病院');
    await page.fill('#email', 'test@example.com');
    await page.selectOption('#topic', '研修について');
    await page.fill('#message', 'Playwright による操作確認テストです。');
    await flow.capture(
      'フォームへ入力',
      '必須項目（お名前・法人名・メール・問い合わせ種別・内容）にテストデータを入力します。電話番号は任意のため空欄のままです。'
    );

    await page.check('#agree');
    await flow.capture(
      '個人情報の取り扱いに同意',
      '個人情報の取り扱いチェックボックスに同意し、送信可能な状態にします。'
    );

    await page.click('#submitBtn');
    await expect(page).toHaveURL(/contact\.html\?sent=1/);
    await expect(page.getByRole('heading', { name: '送信が完了しました' })).toBeVisible();
    await flow.capture(
      '送信完了画面を表示',
      'Formspree への送信（テストではモック）成功後、contact.html?sent=1 の完了画面が表示されます。'
    );

    flow.save();
  });
});
