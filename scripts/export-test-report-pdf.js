const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const root = path.resolve(__dirname, '..');
const resultsPath = path.join(root, 'test-results', 'results.json');
const docsDir = path.join(root, 'docs');
const outputPdf = path.join(docsDir, 'playwright-test-report.pdf');

function collectSpecs(suites, specs = []) {
  for (const suite of suites) {
    if (suite.specs?.length) {
      for (const spec of suite.specs) {
        specs.push({
          suite: suite.title,
          title: spec.title,
          ok: spec.ok,
          duration: spec.tests?.[0]?.results?.[0]?.duration ?? null,
        });
      }
    }
    if (suite.suites?.length) {
      collectSpecs(suite.suites, specs);
    }
  }
  return specs;
}

function buildHtmlReport(data) {
  const specs = collectSpecs(data.suites || []);
  const passed = specs.filter((spec) => spec.ok).length;
  const failed = specs.length - passed;
  const generatedAt = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

  const rows = specs
    .map(
      (spec) => `
      <tr>
        <td>${escapeHtml(spec.suite)}</td>
        <td>${escapeHtml(spec.title)}</td>
        <td class="${spec.ok ? 'pass' : 'fail'}">${spec.ok ? 'PASS' : 'FAIL'}</td>
        <td>${spec.duration != null ? `${spec.duration} ms` : '-'}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>Playwright Test Report</title>
  <style>
    body { font-family: "Hiragino Sans", "Noto Sans JP", sans-serif; color: #1b2a38; margin: 32px; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .meta { color: #5e7081; font-size: 13px; margin-bottom: 24px; }
    .summary { display: flex; gap: 16px; margin-bottom: 24px; }
    .card { border: 1px solid #e2eaf0; border-radius: 12px; padding: 16px 20px; min-width: 120px; }
    .card strong { display: block; font-size: 28px; margin-top: 6px; }
    .pass { color: #0f766e; font-weight: 700; }
    .fail { color: #b91c1c; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border: 1px solid #e2eaf0; padding: 10px 12px; text-align: left; vertical-align: top; }
    th { background: #f2f7fa; }
  </style>
</head>
<body>
  <h1>Playwright テストレポート</h1>
  <p class="meta">一般社団法人 国際ヘルスケアAI管理推進協会 / お問い合わせフォーム<br>生成日時: ${escapeHtml(generatedAt)} (JST)</p>
  <div class="summary">
    <div class="card">総件数<strong>${specs.length}</strong></div>
    <div class="card">成功<strong class="pass">${passed}</strong></div>
    <div class="card">失敗<strong class="${failed ? 'fail' : 'pass'}">${failed}</strong></div>
  </div>
  <table>
    <thead>
      <tr><th>グループ</th><th>テスト名</th><th>結果</th><th>実行時間</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function main() {
  if (!fs.existsSync(resultsPath)) {
    console.error('test-results/results.json がありません。先に npm test を実行してください。');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  const html = buildHtmlReport(data);
  const tempHtml = path.join(os.tmpdir(), `playwright-report-${Date.now()}.html`);
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(tempHtml, html, 'utf8');

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`file://${tempHtml}`, { waitUntil: 'load' });
  await page.pdf({
    path: outputPdf,
    format: 'A4',
    printBackground: true,
    margin: { top: '16mm', bottom: '16mm', left: '12mm', right: '12mm' },
  });
  await browser.close();
  fs.unlinkSync(tempHtml);

  console.log(`PDF saved: ${outputPdf}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
