// entry-waitlist.gs を Apps Script のモック上で実行する回帰テスト（node scripts/gas-mock/entry-waitlist.test.js）
const fs = require('fs');
const assert = require('assert');

function makeSheet() {
  const data = [];
  return {
    data,
    getLastRow: () => { for (let i = data.length; i > 0; i--) if ((data[i - 1] || []).some(v => v !== '' && v != null)) return i; return 0; },
    getRange: (r, c, nr = 1, nc = 1) => ({
      setValues(vals) { for (let i = 0; i < nr; i++) { data[r - 1 + i] = data[r - 1 + i] || []; for (let j = 0; j < nc; j++) data[r - 1 + i][c - 1 + j] = vals[i][j]; } return this; },
      setValue(v) { return this.setValues([[v]]); },
      getDisplayValues() { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (data[r - 1 + i] || [])[c - 1 + j]; row.push(v == null ? '' : String(v)); } out.push(row); } return out; },
      setNumberFormat() { return this; }, setFontWeight() { return this; }, setBackground() { return this; }, setFontColor() { return this; },
    }),
    setFrozenRows() {}, setColumnWidths() {}, setColumnWidth() {},
  };
}
const sheets = {};
const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = makeSheet()) };
const props = {};
const mails = [];
const g = {
  SpreadsheetApp: { openById: () => ss, flush() {} },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null }) },
  UrlFetchApp: {
    fetch(url) {
      const body = /no-such-domain/.test(url) ? { Status: 3 } : { Status: 0, Answer: [{ type: /type=A$/.test(url) ? 1 : 15 }] };
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify(body) };
    },
  },
  MailApp: { sendEmail: (to, subject) => mails.push({ to, subject }) },
  Utilities: { formatDate: () => '2026-10-04 10:00:00', base64EncodeWebSafe: s => Buffer.from(s).toString('base64'), sleep() {} },
  ContentService: { createTextOutput: s => ({ setMimeType() { return JSON.parse(s); } }), MimeType: { JSON: 'json' } },
  ScriptApp: {},
  console,
};
const src = fs.readFileSync(__dirname + '/../../google-apps-script/entry-waitlist.gs', 'utf8');
const api = new Function(...Object.keys(g), src + '\nreturn { setupWaitlist, doGet, doPost };')(...Object.values(g));
const post = body => api.doPost({ postData: { contents: JSON.stringify(Object.assign({ name: '山田', facility: '病院', agree: true }, body)) } });
const ok = (label, cond) => { assert.ok(cond, label); console.log('OK ', label); };

// 会場配布用のタブ（確認コード AAAA〜 を使用中）を再現
const dist = ss.insertSheet('1004_整理券');
dist.getRange(1, 1).setValue('整理番号');
const CH = 'ACDEFHJKMNPQRTUVWXY3479';
let n = 0;
for (const a of CH) for (const b of CH) for (const c of CH) { if (n >= 12000) break; dist.getRange(n + 2, 1, 1, 2).setValues([[String(n + 1), a + b + c + 'A']]); n++; }
const distBefore = JSON.stringify(dist.data);

ok('notready before setup', post({ email: 'a@example.jp', program: 'hospital' }).message.includes('受付準備中'));
api.setupWaitlist();
ok('two tabs created', !!sheets['1004_投影_病院向け_ウェイティング'] && !!sheets['1004_投影_管理士_ウェイティング']);
api.setupWaitlist();

const h1 = post({ email: 'Taro＠Example.jp', program: 'hospital' });
ok('hospital #1', h1.ok && h1.waitlist && h1.position === 1 && !h1.ticket);
ok('mail subject', mails.at(-1).subject.startsWith('【投影資料用ウェイティングリスト 1番目】病院向けAI研修'));
ok('code not used by distribution', !h1.code.endsWith('A') || !JSON.stringify(dist.data).includes('"' + h1.code + '"'));
const mc = mails.length;
const h1r = post({ email: 'taro@example.jp', program: 'hospital' });
ok('repeat same position & code, no mail', h1r.repeat && h1r.position === 1 && h1r.code === h1.code && mails.length === mc);
ok('hospital #2', post({ email: 'jiro@example.jp', program: 'hospital' }).position === 2);

const k1 = post({ email: 'taro@example.jp', program: 'kanrishi' });
ok('kanrishi #1 independent tab', k1.position === 1 && sheets['1004_投影_管理士_ウェイティング'].getLastRow() === 2 && sheets['1004_投影_病院向け_ウェイティング'].getLastRow() === 3);
ok('codes unique', new Set([h1.code, k1.code]).size === 2);
ok('distribution tab untouched', JSON.stringify(dist.data) === distBefore);

ok('typo domain', post({ email: 'x@gmial.com', program: 'kanrishi' }).field === 'email');
ok('nx domain', post({ email: 'x@no-such-domain.com', program: 'kanrishi' }).message.includes('見つかりません'));
ok('formula email', post({ email: '=x@example.jp', program: 'kanrishi' }).field === 'email');
props.ACCEPTING_KANRISHI = 'false';
ok('kanrishi closed', post({ email: 'y@example.jp', program: 'kanrishi' }).closed === true);
delete props.ACCEPTING_KANRISHI;

const st = api.doGet();
ok('doGet stats', st.service === 'entry-waitlist' && st.programs.hospital.registered === 2 && st.programs.kanrishi.registered === 1);
console.log(JSON.stringify(st));
console.log('ALL PASSED');
