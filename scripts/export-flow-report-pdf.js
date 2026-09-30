const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const root = path.resolve(__dirname, '..');
const screenshotDir = path.join(root, 'test-results', 'flow-screenshots');
const manifestPath = path.join(screenshotDir, 'manifest.json');
const docsDir = path.join(root, 'docs');
const outputPdf = path.join(docsDir, 'contact-flow-report.pdf');
const outputHtml = path.join(docsDir, 'contact-flow-report.html');

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function buildHtmlReport(manifest) {
  const generatedAt = new Date(manifest.generatedAt).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
  });

  const stepsHtml = manifest.steps
    .map((step) => {
      const imagePath = path.join(screenshotDir, step.image);
      const imageData = fs.readFileSync(imagePath).toString('base64');

      return `
      <section class="step">
        <div class="step-head">
          <span class="step-no">Step ${step.step}</span>
          <h2>${escapeHtml(step.title)}</h2>
        </div>
        <p class="comment">${escapeHtml(step.comment)}</p>
        <figure>
          <img src="data:image/png;base64,${imageData}" alt="${escapeHtml(step.title)}">
        </figure>
      </section>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(manifest.title)}</title>
  <style>
    body { font-family: "Hiragino Sans", "Noto Sans JP", sans-serif; color: #1b2a38; margin: 28px; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .meta { color: #5e7081; font-size: 13px; margin-bottom: 28px; line-height: 1.7; }
    .step { page-break-inside: avoid; margin-bottom: 36px; padding-bottom: 24px; border-bottom: 1px solid #e2eaf0; }
    .step:last-child { border-bottom: 0; }
    .step-head { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
    .step-no { background: #0b3b66; color: #fff; font-size: 12px; font-weight: 700; padding: 6px 10px; border-radius: 999px; }
    .step h2 { font-size: 18px; margin: 0; }
    .comment { font-size: 14px; line-height: 1.8; color: #334155; margin: 0 0 14px; }
    figure { margin: 0; }
    img { width: 100%; border: 1px solid #e2eaf0; border-radius: 10px; box-shadow: 0 8px 24px -16px rgba(11,59,102,.35); }
  </style>
</head>
<body>
  <h1>${escapeHtml(manifest.title)}</h1>
  <p class="meta">
    一般社団法人 国際ヘルスケアAI管理推進協会<br>
    生成日時: ${escapeHtml(generatedAt)} (JST)<br>
    全 ${manifest.steps.length} ステップ（Formspree / スプレッドシート同期はテスト用モック）
  </p>
  ${stepsHtml}
</body>
</html>`;
}

async function main() {
  if (!fs.existsSync(manifestPath)) {
    console.error('test-results/flow-screenshots/manifest.json がありません。');
    console.error('先に npm run test:flow-pdf を実行するか、contact-flow.spec.js を実行してください。');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const html = buildHtmlReport(manifest);
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(outputHtml, html, 'utf8');

  const tempHtml = path.join(os.tmpdir(), `contact-flow-report-${Date.now()}.html`);
  fs.writeFileSync(tempHtml, html, 'utf8');

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`file://${tempHtml}`, { waitUntil: 'load' });
  await page.pdf({
    path: outputPdf,
    format: 'A4',
    printBackground: true,
    margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' },
  });
  await browser.close();
  fs.unlinkSync(tempHtml);

  console.log(`HTML saved: ${outputHtml}`);
  console.log(`PDF saved: ${outputPdf}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
