// entry-ticket.gs を Apps Script のモック上で実行する回帰テスト（node scripts/gas-mock/entry-ticket.test.js）
const fs = require('fs');
const assert = require('assert');

// ---- 最小限の Apps Script モック ----
function makeSheet(name) {
  const data = []; // 1-indexed rows via data[r-1]
  const sheet = {
    name, data,
    getLastRow: () => { for (let i = data.length; i > 0; i--) if ((data[i - 1] || []).some(v => v !== '' && v != null)) return i; return 0; },
    getRange: (r, c, nr = 1, nc = 1) => ({
      setValues(vals) { for (let i = 0; i < nr; i++) { data[r - 1 + i] = data[r - 1 + i] || []; for (let j = 0; j < nc; j++) data[r - 1 + i][c - 1 + j] = vals[i][j]; } return this; },
      setValue(v) { return this.setValues([[v]]); },
      getDisplayValues() { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (data[r - 1 + i] || [])[c - 1 + j]; row.push(v == null ? '' : String(v)); } out.push(row); } return out; },
      setNumberFormat() { return this; }, setFontWeight() { return this; }, setBackground() { return this; }, setFontColor() { return this; },
    }),
    setFrozenRows() {}, setColumnWidths() {}, setColumnWidth() {},
  };
  return sheet;
}
const sheets = {};
const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = makeSheet(n)) };
const props = {};
const mails = [];
const g = {
  SpreadsheetApp: { openById: () => ss, flush() {} },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null }) },
  UrlFetchApp: {
    fetch(url) {
      const nx = /no-such-domain/.test(url);
      const isA = /type=A$/.test(url);
      const body = nx ? { Status: 3 } : { Status: 0, Answer: [{ type: isA ? 1 : 15 }] };
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify(body) };
    },
  },
  MailApp: { sendEmail: (to, subject) => mails.push({ to, subject }) },
  Utilities: {
    formatDate: (d, tz, f) => f.includes('-') ? '2026-10-01 10:00:00' : '20261001100000',
    base64EncodeWebSafe: s => Buffer.from(s).toString('base64'), sleep() {},
  },
  ContentService: { createTextOutput: s => ({ setMimeType() { return JSON.parse(s); } }), MimeType: { JSON: 'json' } },
  ScriptApp: {},
  console,
};
const src = fs.readFileSync(__dirname + '/../../google-apps-script/entry-ticket.gs', 'utf8');
const api = new Function(...Object.keys(g), src + '\nreturn { setupTickets, doGet, doPost, showRemaining };')(...Object.values(g));

const post = body => api.doPost({ postData: { contents: JSON.stringify(Object.assign({ name: '山田', facility: '病院', agree: true }, body)) } });
const ok = (label, cond) => { assert.ok(cond, label); console.log('OK ', label); };

// 未セットアップ
ok('notready message', post({ email: 'a@example.jp', program: 'kanrishi' }).message.includes('受付準備中'));

// 既存の病院向けタブ（データあり）を再現してから setup
const hs = ss.insertSheet('1004_整理券');
hs.getRange(1, 1, 1, 3).setValues([['整理番号', '確認コード', '状態']]);
for (let i = 1; i <= 50; i++) hs.getRange(i + 1, 1, 1, 2).setValues([[String(i).padStart(3, '0'), 'H' + String(i).padStart(3, '0')]]);
ss.insertSheet('1004_キャンセル待ち').getRange(1, 1).setValue('受付順');
const before = JSON.stringify(hs.data);
api.setupTickets();
ok('hospital tab unchanged', JSON.stringify(hs.data) === before);
const ks = sheets['1004_管理士_整理券'];
ok('kanrishi K-001..K-050', ks.data[1][0] === 'K-001' && ks.data[50][0] === 'K-050' && ks.getLastRow() === 51);
ok('kanrishi wait tab created', !!sheets['1004_管理士_キャンセル待ち']);
api.setupTickets();
ok('setup idempotent', ks.getLastRow() === 51);

// 形式・打ち間違い・存在しないドメイン
ok('formula email rejected', post({ email: '=x@example.jp', program: 'kanrishi' }).field === 'email');
const typo = post({ email: 'test@gmial.com', program: 'kanrishi' });
ok('typo domain message', typo.field === 'email' && typo.message.includes('@gmail.com」の誤り'));
ok('nx domain', post({ email: 'a@no-such-domain-x.com', program: 'kanrishi' }).message.includes('見つかりません'));
ok('unknown program', post({ email: 'a@example.jp', program: 'xxx' }).ok === false);

// 発行
const k1 = post({ email: 'Taro＠Example.jp', program: 'kanrishi' });
ok('kanrishi K-001 issued', k1.ok && k1.ticket === 'K-001' && k1.program === 'kanrishi' && ks.data[1][2] === '発行済');
ok('mail subject', mails.at(-1).subject.startsWith('【整理番号 K-001】医療AIガバナンス管理士 会場配布資料用 整理券'));
const mailCount = mails.length;
const k1r = post({ email: 'taro@example.jp', program: 'kanrishi' });
ok('repeat same number, no mail', k1r.repeat && k1r.ticket === 'K-001' && k1r.code === k1.code && mails.length === mailCount);

// 回帰：program 未指定は病院向け
const h1 = post({ email: 'taro@example.jp' });
ok('hospital 001 without program', h1.ok && h1.ticket === '001' && hs.data[1][2] === '発行済' && ks.data[2][2] !== '発行済');
ok('codes unique across programs', h1.code !== k1.code);

// キャンセル待ち
for (let i = 3; i <= 51; i++) ks.data[i - 1][2] = '発行済';
const w1 = post({ email: 'hanako@example.jp', program: 'kanrishi' });
const kw = sheets['1004_管理士_キャンセル待ち'];
ok('kanrishi waitlist #1', w1.waitlist && w1.position === 1 && kw.data[1][2] === '待機中' && !sheets['1004_キャンセル待ち'].data[1]);
ok('wait mail subject', mails.at(-1).subject.startsWith('【キャンセル待ち 1番目】医療AIガバナンス管理士'));
ok('wait repeat', post({ email: 'hanako@example.jp', program: 'kanrishi' }).repeat === true);

// 受付停止
props.ACCEPTING_KANRISHI = 'false';
ok('kanrishi closed', post({ email: 'x@example.jp', program: 'kanrishi' }).closed === true);
ok('hospital still open', post({ email: 'x@example.jp' }).ok === true);
delete props.ACCEPTING_KANRISHI;

const st = api.doGet();
ok('doGet compat + programs', st.total === 50 && st.used === 2 && st.programs.kanrishi.total === 50 && st.programs.kanrishi.used === 50 && st.programs.kanrishi.waiting === 1);
api.showRemaining();
console.log('ALL PASSED');
