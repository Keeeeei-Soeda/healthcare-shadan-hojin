// apply.gs を Apps Script のモック上で実行する回帰テスト（node scripts/gas-mock/apply.test.js）
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
  MailApp: { sendEmail: (to, subject, text) => mails.push({ to, subject, text }) },
  Utilities: { formatDate: () => '2026-10-08 10:00:00', base64EncodeWebSafe: s => Buffer.from(s).toString('base64'), sleep() {} },
  ContentService: { createTextOutput: s => ({ setMimeType() { return JSON.parse(s); } }), MimeType: { JSON: 'json' } },
  ScriptApp: {},
  console,
};
const src = fs.readFileSync(__dirname + '/../../google-apps-script/apply.gs', 'utf8');
const api = new Function(...Object.keys(g), src + '\nreturn { setupApply, doGet, doPost };')(...Object.values(g));
const post = body => api.doPost({ postData: { contents: JSON.stringify(Object.assign({ name: '山田', facility: '病院', ticket: 'なし', agree: true }, body)) } });
const ok = (label, cond) => { assert.ok(cond, label); console.log('OK ', label); };

// 10/4 のタブ（確認コード AAAA を使用中）を再現
const ev = ss.insertSheet('1004_管理士_整理券');
ev.getRange(1, 1).setValue('整理番号');
ev.getRange(2, 1, 1, 2).setValues([['K-001', 'AAAA']]);
const evBefore = JSON.stringify(ev.data);

ok('notready before setup', post({ email: 'a@example.jp', program: 'kanrishi' }).message.includes('受付準備中'));
api.setupApply();
ok('two tabs created', !!sheets['申込_管理士'] && !!sheets['申込_医療機関']);
api.setupApply();
ok('setup is idempotent', sheets['申込_管理士'].getLastRow() === 1);

ok('program required', post({ email: 'a@example.jp' }).message.includes('申込ページ'));

const k1 = post({ email: 'Taro＠Example.jp', program: 'kanrishi', ticket: 'ｋ－００１' });
ok('kanrishi #1', k1.ok && k1.number === 'P-001' && k1.code.length === 4 && k1.ticket === 'K-001');
ok('row written', sheets['申込_管理士'].data[1].slice(0, 8).join('|') === 'P-001|' + k1.code + '|入金待ち|2026-10-08 10:00:00|山田|病院|taro@example.jp|K-001');
ok('mail subject', mails.at(-1).subject.startsWith('【受付番号 P-001】医療AIガバナンス管理士 受講のお申し込み'));
ok('mail mentions payment later & period', mails.at(-1).text.includes('お振込先は、後日') && mails.at(-1).text.includes('10月20日（火）〜10月31日（土）'));
ok('code not used by event tab', k1.code !== 'AAAA');

const mc = mails.length;
const k1r = post({ email: 'taro@example.jp', program: 'kanrishi' });
ok('repeat same number & code, no mail', k1r.repeat && k1r.number === 'P-001' && k1r.code === k1.code && mails.length === mc);
ok('ticket required', post({ email: 'jiro@example.jp', program: 'kanrishi', ticket: '' }).field === 'ticket');
const k2 = post({ email: 'jiro@example.jp', program: 'kanrishi' });
ok('kanrishi #2 with no ticket (なし)', k2.number === 'P-002' && k2.ticket === 'なし');

const h1 = post({ email: 'taro@example.jp', program: 'hospital', ticket: '001' });
ok('hospital #1 independent tab', h1.number === 'H-001' && h1.ticket === '001' && sheets['申込_医療機関'].getLastRow() === 2);
ok('hospital mail mentions portal', mails.at(-1).text.includes('ポータルサイト'));
ok('hospital mail mentions payment later & period', mails.at(-1).text.includes('お振込先は、後日') && mails.at(-1).text.includes('10月20日（火）〜10月31日（土）'));
ok('codes unique', new Set([k1.code, h1.code]).size === 2);
ok('event tab untouched', JSON.stringify(ev.data) === evBefore);

ok('bad ticket', post({ email: 'z@example.jp', program: 'hospital', ticket: '=1+1' }).field === 'ticket');
ok('typo domain', post({ email: 'x@gmial.com', program: 'kanrishi' }).field === 'email');
ok('nx domain', post({ email: 'x@no-such-domain.com', program: 'kanrishi' }).message.includes('見つかりません'));
ok('formula email', post({ email: '=x@example.jp', program: 'kanrishi' }).field === 'email');
ok('formula name escaped', post({ email: 'f@example.jp', program: 'hospital', name: '=SUM(1)' }).name === "'=SUM(1)");
props.ACCEPTING_HOSPITAL = 'false';
ok('hospital closed', post({ email: 'y@example.jp', program: 'hospital' }).closed === true);
delete props.ACCEPTING_HOSPITAL;

const st = api.doGet();
ok('doGet stats', st.service === 'entry-apply' && st.programs.kanrishi.applied === 2 && st.programs.hospital.applied === 2);
console.log(JSON.stringify(st));
console.log('ALL PASSED');
