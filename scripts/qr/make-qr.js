// 整理券・ウェイティングリスト・メディキャンバス問い合わせ用 QR コードを docs/entry-qr/ に生成し、読み取り結果を検証する
//   cd scripts/qr && npm install && node make-qr.js
const fs = require('fs');
const QRCode = require('qrcode');
const jsQR = require('jsqr');
const { PNG } = require('pngjs');

const OUT = __dirname + '/../../docs/entry-qr';
const TARGETS = [
  { name: 'entry-qr', url: 'https://www.iha-as.com/entry/' },
  { name: 'kanrishi-qr', url: 'https://www.iha-as.com/kanrishi/' },
  { name: 'entry-live-qr', url: 'https://www.iha-as.com/entry-live/' },
  { name: 'kanrishi-live-qr', url: 'https://www.iha-as.com/kanrishi-live/' },
  { name: 'medicanvas-qr', url: 'https://www.iha-as.com/medicanvas/' },
];
const opts = { errorCorrectionLevel: 'H', margin: 4, color: { dark: '#0B3B66', light: '#FFFFFF' } };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const t of TARGETS) {
    await QRCode.toFile(`${OUT}/${t.name}.png`, t.url, { ...opts, width: 1200 });
    fs.writeFileSync(`${OUT}/${t.name}.svg`, await QRCode.toString(t.url, { ...opts, type: 'svg' }));
    const png = PNG.sync.read(fs.readFileSync(`${OUT}/${t.name}.png`));
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    console.log(t.name, png.width + 'x' + png.height, decoded && decoded.data, decoded && decoded.data === t.url ? 'MATCH' : 'MISMATCH');
  }
})();
