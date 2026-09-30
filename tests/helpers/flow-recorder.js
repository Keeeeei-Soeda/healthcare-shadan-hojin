const fs = require('node:fs');
const path = require('node:path');

const screenshotDir = path.join(process.cwd(), 'test-results', 'flow-screenshots');

function createFlowRecorder(page, { title }) {
  fs.mkdirSync(screenshotDir, { recursive: true });

  const manifest = {
    title,
    generatedAt: new Date().toISOString(),
    steps: [],
  };

  async function capture(stepTitle, comment) {
    const step = manifest.steps.length + 1;
    const fileName = `step-${String(step).padStart(2, '0')}.png`;
    const filePath = path.join(screenshotDir, fileName);

    await page.screenshot({ path: filePath, fullPage: false });

    manifest.steps.push({
      step,
      title: stepTitle,
      comment,
      image: fileName,
    });
  }

  function save() {
    manifest.generatedAt = new Date().toISOString();
    fs.writeFileSync(path.join(screenshotDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    return manifest;
  }

  return { capture, save };
}

module.exports = { createFlowRecorder, screenshotDir };
