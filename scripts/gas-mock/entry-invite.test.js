// entry-invite.gs を Apps Script のモック上で実行する回帰テスト（node scripts/gas-mock/entry-invite.test.js）
const fs = require('fs');
const assert = require('assert');

function makeSheet(rows = []) {
  const data = rows.map(r => r.slice());
  return {
    data,
    getLastRow: () => { for (let i = data.length; i > 0; i--) if ((data[i - 1] || []).some(v => v !== '' && v != null)) return i; return 0; },
    getRange: (r, c, nr = 1, nc = 1) => ({
      setValues(vals) { for (let i = 0; i < nr; i++) { data[r - 1 + i] = data[r - 1 + i] || []; for (let j = 0; j < nc; j++) data[r - 1 + i][c - 1 + j] = vals[i][j]; } return this; },
      getDisplayValues() { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (data[r - 1 + i] || [])[c - 1 + j]; row.push(v == null ? '' : String(v).replace(/^'/, '')); } out.push(row); } return out; },
      setFontWeight() { return this; }, setBackground() { return this; }, setFontColor() { return this; },
    }),
    appendRow(row) { data[this.getLastRow()] = row; },
    setFrozenRows() {},
  };
}
const H = ['番号', 'コード', '状態', '受付日時', '氏名', '所属', 'メール'];
const sheets = {
  '1004_管理士_整理券': makeSheet([H, ['K-001', 'AAAA', '発行済', 't', '山田', '病院', 'Yamada@example.jp'], ['K-002', 'CCCC', '発行済', 't', '佐藤', '病院', 'sato@example.jp'], ['K-003', 'DDDD', '', '', '', '', '']]),
  '1004_投影_管理士_ウェイティング': makeSheet([H, ['1', 'EEEE', '待機中', 't', '山田', '病院', 'yamada@example.jp'], ['2', 'FFFF', '待機中', 't', '鈴木', '病院', 'suzuki@example.jp']]),
  '1004_整理券': makeSheet([H, ['001', 'HHHH', '発行済', 't', '田中', '病院', 'tanaka@example.jp'], ['002', 'JJJJ', '発行済', 't', '山田', '病院', 'yamada@example.jp']]),
  '申込_管理士': makeSheet([H.concat(['整理券番号']), ['P-001', 'KKKK', '入金待ち', 't', '佐藤', '病院', 'sato@example.jp', 'K-002']]),
};
const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = makeSheet()) };
const mails = [];
let quota = 100;
const logs = [];
const g = {
  SpreadsheetApp: { openById: () => ss },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  MailApp: { sendEmail: (to, subject, text, opt) => { mails.push({ to, subject, text, html: opt.htmlBody }); quota--; }, getRemainingDailyQuota: () => quota },
  Utilities: { formatDate: () => '2026-10-08 13:00:00' },
  console: { log: s => logs.push(s) },
};
const src = fs.readFileSync(__dirname + '/../../google-apps-script/entry-invite.gs', 'utf8');
const api = new Function(...Object.keys(g), src + '\nreturn { sendTestInvites, previewInvites, sendInvites };')(...Object.values(g));
const ok = (label, cond) => { assert.ok(cond, label); console.log('OK ', label); };

api.sendTestInvites();
ok('test: 4 patterns to TEST_TO', mails.length === 4 && mails.every(m => m.to === 'info@iha-as.com' && m.subject.startsWith('【テスト】')));
ok('test: no log tab written', !sheets['案内メール_送信記録']);
mails.length = 0;

api.previewInvites();
ok('preview: no mail', mails.length === 0);
ok('preview: count', logs.at(-1).startsWith('送信予定 4通'));

api.sendInvites();
const to = mails.map(m => m.to + ' ' + m.subject.slice(0, 30));
ok('sent 4', mails.length === 4);
ok('yamada kanrishi gets ticket version only once', mails.filter(m => m.to === 'yamada@example.jp' && m.subject.includes('管理士')).length === 1
  && mails.find(m => m.to === 'yamada@example.jp' && m.subject.includes('管理士')).text.includes('整理番号 K-001'));
ok('ticket link prefilled', mails[0].text.includes('kanrishi-apply/?ticket=K-001'));
ok('sato already applied -> skipped', !mails.some(m => m.to === 'sato@example.jp'));
ok('suzuki waitlist version', mails.find(m => m.to === 'suzuki@example.jp').text.includes('ウェイティングリスト（受付順 2番目）') && mails.find(m => m.to === 'suzuki@example.jp').text.includes('空欄のままで'));
ok('hospital ticket: tanaka 001, price', mails.find(m => m.to === 'tanaka@example.jp').text.includes('hospital-apply/?ticket=001') && mails.find(m => m.to === 'tanaka@example.jp').text.includes('600,000円'));
ok('same person gets each program separately', mails.some(m => m.to === 'yamada@example.jp' && m.text.includes('hospital-apply/?ticket=002')));
console.log(to);

const n = mails.length;
api.sendInvites();
ok('second run sends nothing', mails.length === n);
ok('log rows', sheets['案内メール_送信記録'].getLastRow() === 5);
console.log('ALL PASSED');
