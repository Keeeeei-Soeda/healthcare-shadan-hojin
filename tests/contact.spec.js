const { test, expect } = require('@playwright/test');

const { mockExternalApis } = require('./helpers/mock-apis');

async function fillContactForm(page) {
  await page.fill('#name', 'テスト太郎');
  await page.fill('#org', 'テスト病院');
  await page.fill('#email', 'test@example.com');
  await page.selectOption('#topic', '研修について');
  await page.fill('#message', 'Playwright テスト送信です');
  await page.check('#agree');
}

test.describe('お問い合わせフォーム', () => {
  test('フォームと問い合わせ先メールが表示される', async ({ page }) => {
    await page.goto('/contact.html');

    await expect(page.getByRole('heading', { name: 'お問い合わせ', level: 1 })).toBeVisible();
    await expect(page.locator('#contactForm')).toBeVisible();
    await expect(page.getByRole('link', { name: 'info@iha-ac.com' })).toHaveAttribute(
      'href',
      'mailto:info@iha-ac.com'
    );
  });

  test('必須項目未入力では送信できない', async ({ page }) => {
    await page.goto('/contact.html');
    await page.click('#submitBtn');

    await expect(page).toHaveURL(/contact\.html$/);
    await expect(page.locator('#formError')).not.toHaveClass(/visible/);
  });

  test('送信成功で完了画面に遷移する', async ({ page }) => {
    await mockExternalApis(page);
    await page.goto('/contact.html');
    await fillContactForm(page);
    await page.click('#submitBtn');

    await expect(page).toHaveURL(/contact\.html\?sent=1/);
    await expect(page.getByRole('heading', { name: '送信が完了しました' })).toBeVisible();
    await expect(page.getByText('お問い合わせありがとうございます')).toBeVisible();
  });

  test('Formspree 失敗時にエラー表示される', async ({ page }) => {
    await mockExternalApis(page, { formspreeOk: false });
    await page.goto('/contact.html');
    await fillContactForm(page);
    await page.click('#submitBtn');

    await expect(page).toHaveURL(/contact\.html$/);
    await expect(page.locator('#formError')).toHaveClass(/visible/);
    await expect(page.locator('#formError')).toContainText('送信に失敗しました');
    await expect(page.locator('#submitBtn')).toBeEnabled();
  });

  test('トップページから問い合わせページへ遷移できる', async ({ page }) => {
    await page.goto('/index.html');
    await page.getByRole('link', { name: 'お問い合わせはこちら' }).click();

    await expect(page).toHaveURL(/contact\.html/);
    await expect(page.locator('#contactForm')).toBeVisible();
  });
});
