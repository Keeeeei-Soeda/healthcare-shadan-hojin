/**
 * entry-invite.gs — 10/4 の登録者へ、受講・研修お申し込み受付開始の案内メールを送る
 *
 * 送り先：10/4 の整理券・キャンセル待ち・投影用ウェイティングのタブ（読み取りのみ）
 * 文面：制度（管理士／医療機関）× 区分（整理券／ウェイティング）の4種類
 *   - 同じ制度で整理券とウェイティングの両方にいる人には、整理券の文面を1通だけ送る
 *   - すでに申し込んだ人（申込_管理士／申込_医療機関 に同じメールがある人）には送らない
 *   - 送信結果は「案内メール_送信記録」タブに残し、送信済みの人には二度と送らない（何度実行しても二重送信しない）
 *
 * 受付用（entry-ticket・entry-waitlist・entry-apply）・通知用（entry-notify）とは別のプロジェクトで動かす。
 * 手順: docs/entry-invite.md
 *
 * エディタから実行する関数
 *   sendTestInvites … 4種類の文面を TEST_TO に送る（送信記録には残さない）
 *   previewInvites  … 送り先の一覧と件数をログに出す（送信しない）
 *   sendInvites     … 未送信の全員に送る
 */

const SPREADSHEET_ID = '190L3DfU8S-xpa9-EEyv0FgkUQ8vD6fEgL0lt2rbcVfc';
const TEST_TO = 'info@iha-as.com';
const MAIL_FROM_NAME = '一般社団法人 国際ヘルスケアAI管理推進協会';
const SITE_URL = 'https://www.iha-as.com/';
const EVENT_INFO = '2026年10月4日（日）日本レセプト学会 学術研究会';
const LOG_SHEET = '案内メール_送信記録';
const LOG_HEADERS = ['送信日時', '制度', '区分', '番号', '氏名', 'メールアドレス', '結果'];
const SENT = '送信済';
/** 1回の実行で送る上限（Apps Script の実行時間6分に収める） */
const MAX_PER_RUN = 300;

/** 10/4 のタブ。列の並び（番号／確認コード／状態／受付日時／氏名／所属施設／メールアドレス）は全タブ共通 */
const COL = { no: 0, name: 4, email: 6 };
/** 区分の優先順に並べる（同じ人が複数のタブにいる場合は先に出てきた区分で送る） */
const SOURCES = [
  { sheet: '1004_管理士_整理券', program: 'kanrishi', group: 'ticket' },
  { sheet: '1004_管理士_キャンセル待ち', program: 'kanrishi', group: 'waitlist', listName: 'キャンセル待ち' },
  { sheet: '1004_投影_管理士_ウェイティング', program: 'kanrishi', group: 'waitlist', listName: 'ウェイティングリスト' },
  { sheet: '1004_整理券', program: 'hospital', group: 'ticket' },
  { sheet: '1004_キャンセル待ち', program: 'hospital', group: 'waitlist', listName: 'キャンセル待ち' },
  { sheet: '1004_投影_病院向け_ウェイティング', program: 'hospital', group: 'waitlist', listName: 'ウェイティングリスト' },
];

const PROGRAMS = {
  kanrishi: {
    label: '医療AIガバナンス管理士',
    eventLabel: '医療AIガバナンス管理士',
    subject: '【受付開始】医療AIガバナンス管理士 受講のお申し込みのご案内',
    url: SITE_URL + 'kanrishi-apply/',
    appliedSheet: '申込_管理士',
    price: '受講料：38,000円（税別）',
    steps: [
      '上記のお申し込みページからお申し込みください。',
      '受講料のお振込先は、お申し込み後にあらためてメールでお送りします。2026年10月20日（火）〜10月31日（土）の期間にお振り込みください。',
      '講習会は2027年2月に開催します（90分）。日程・受講方法は後日ご案内します。',
      '講習会の受講後、理解度テストと提出物をご提出いただき、内容を確認のうえ認定します。',
    ],
  },
  hospital: {
    label: '医療機関向けAI研修',
    eventLabel: '病院向けAI研修',
    subject: '【受付開始】医療機関向けAI研修 お申し込みのご案内',
    url: SITE_URL + 'hospital-apply/',
    appliedSheet: '申込_医療機関',
    price: '研修費用：600,000円（税別）',
    steps: [
      '上記のお申し込みページからお申し込みください。',
      'ご請求書・お振込先は、お申し込み後にあらためてメールでお送りします。2026年10月20日（火）〜10月31日（土）の期間にお振り込みください。',
      'ご入金を確認後、担当者より研修の打ち合わせのご連絡をいたします（研修の概要をご説明します）。',
      '打ち合わせの後、研修用ポータルサイトのURLをお送りします。',
    ],
  },
};

// ====== エディタから実行 ======

/** 4種類の文面を TEST_TO に送る（送信記録には残さない） */
function sendTestInvites() {
  const samples = [
    { program: 'kanrishi', group: 'ticket', no: 'K-001', name: 'テスト' },
    { program: 'kanrishi', group: 'waitlist', listName: 'ウェイティングリスト', no: '1', name: 'テスト' },
    { program: 'hospital', group: 'ticket', no: '001', name: 'テスト' },
    { program: 'hospital', group: 'waitlist', listName: 'ウェイティングリスト', no: '1', name: 'テスト' },
  ];
  samples.forEach(s => {
    const m = buildMail_(s);
    sendWithRetry_(TEST_TO, '【テスト】' + m.subject, m);
  });
  console.log('テスト送信: ' + samples.length + '通 → ' + TEST_TO);
}

/** 送信できない原因の切り分け：残り送信数を出し、短い文面 → 本文のみ → HTML 付きの順に TEST_TO へ送る */
function diagnoseMail() {
  console.log('Gmail の残り送信可能数: ' + MailApp.getRemainingDailyQuota() + '通');
  const m = buildMail_({ program: 'kanrishi', group: 'ticket', no: 'K-001', name: 'テスト' });
  const tries = [
    ['短い文面', () => MailApp.sendEmail(TEST_TO, '【診断1】送信テスト', '送信テストです。')],
    ['案内の本文のみ', () => MailApp.sendEmail(TEST_TO, '【診断2】' + m.subject, m.text, { name: MAIL_FROM_NAME })],
    ['案内の HTML 付き', () => MailApp.sendEmail(TEST_TO, '【診断3】' + m.subject, m.text, { htmlBody: m.html, name: MAIL_FROM_NAME })],
  ];
  tries.forEach(([label, send]) => {
    try {
      send();
      console.log(label + ': OK');
    } catch (err) {
      console.log(label + ': 失敗 ' + String(err.message || err));
    }
  });
}

/** 送り先の一覧と件数をログに出す（送信しない） */
function previewInvites() {
  const list = recipients_(SpreadsheetApp.openById(SPREADSHEET_ID));
  list.forEach(r => console.log([PROGRAMS[r.program].label, groupLabel_(r), r.no, r.name, r.email].join(' / ')));
  console.log(summary_(list) + '／Gmail の残り送信可能数 ' + MailApp.getRemainingDailyQuota() + '通');
}

/** 未送信の全員に送る */
function sendInvites() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('別の実行が進行中です');
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const log = logSheet_(ss);
    const list = recipients_(ss);
    const quota = MailApp.getRemainingDailyQuota();
    const limit = Math.min(list.length, quota, MAX_PER_RUN);
    let sent = 0, failed = 0;
    for (let i = 0; i < limit; i++) {
      const r = list[i];
      const m = buildMail_(r);
      let result = SENT;
      try {
        sendWithRetry_(r.email, m.subject, m);
        sent++;
      } catch (err) {
        result = '送信失敗: ' + String(err.message || err);
        failed++;
      }
      log.appendRow([now_(), PROGRAMS[r.program].label, groupLabel_(r), "'" + r.no, r.name, r.email, result]);
    }
    const rest = list.length - limit;
    console.log('送信 ' + sent + '通／失敗 ' + failed + '通' + (rest > 0 ? '／未送信 ' + rest + '通（送信上限のため。明日以降にもう一度 sendInvites を実行）' : ''));
  } finally {
    lock.releaseLock();
  }
}

// ====== 送り先 ======

/** 未送信・未申込の送り先（制度ごとにメールで重複を除く） */
function recipients_(ss) {
  const done = {};
  const log = ss.getSheetByName(LOG_SHEET);
  if (log && log.getLastRow() >= 2) {
    log.getRange(2, 1, log.getLastRow() - 1, LOG_HEADERS.length).getDisplayValues()
      .filter(r => r[6] === SENT)
      .forEach(r => { done[programKeyByLabel_(r[1]) + '|' + r[5].toLowerCase()] = true; });
  }
  Object.keys(PROGRAMS).forEach(k => {
    const sh = ss.getSheetByName(PROGRAMS[k].appliedSheet);
    if (!sh || sh.getLastRow() < 2) return;
    sh.getRange(2, COL.email + 1, sh.getLastRow() - 1, 1).getDisplayValues()
      .forEach(r => { if (r[0]) done[k + '|' + r[0].toLowerCase()] = true; });
  });

  const list = [];
  SOURCES.forEach(src => {
    const sh = ss.getSheetByName(src.sheet);
    if (!sh || sh.getLastRow() < 2) return;
    sh.getRange(2, 1, sh.getLastRow() - 1, COL.email + 1).getDisplayValues().forEach(row => {
      const email = String(row[COL.email] || '').trim().toLowerCase();
      const name = String(row[COL.name] || '').replace(/^'/, '').trim();
      if (!email || !name) return;
      const key = src.program + '|' + email;
      if (done[key]) return;
      done[key] = true;
      list.push({ program: src.program, group: src.group, listName: src.listName, no: row[COL.no], name: name, email: email });
    });
  });
  return list;
}

function summary_(list) {
  const count = {};
  list.forEach(r => {
    const k = PROGRAMS[r.program].label + '・' + (r.group === 'ticket' ? '整理券' : 'ウェイティング');
    count[k] = (count[k] || 0) + 1;
  });
  return '送信予定 ' + list.length + '通（' + Object.keys(count).map(k => k + ' ' + count[k]).join('、') + '）';
}

// ====== 文面 ======

/** @param {{program:string, group:string, listName?:string, no:string, name:string}} r */
function buildMail_(r) {
  const P = PROGRAMS[r.program];
  const ticket = r.group === 'ticket';
  const link = P.url + '?ticket=' + (ticket ? encodeURIComponent(r.no) : 'none');
  const thanks = ticket
    ? EVENT_INFO + 'では、' + P.eventLabel + 'の整理券（整理番号 ' + r.no + '）をお受け取りいただき、ありがとうございました。'
    : EVENT_INFO + 'では、' + P.eventLabel + 'の' + r.listName + '（受付順 ' + r.no + '番目）にご登録いただき、ありがとうございました。';
  const opening = ticket
    ? 'お待たせいたしました。' + P.label + 'のお申し込み受付を、2026年10月8日（木）より開始いたしました。整理券をお受け取りいただいた皆さまにご案内いたします。'
    : 'お待たせいたしました。' + P.label + 'のお申し込み受付を、2026年10月8日（木）より開始いたしました。ウェイティングリストにご登録の皆さまにも、お申し込みいただけるようになりましたのでご案内いたします。';
  const ticketNote = ticket
    ? 'お申し込みフォームの「整理券番号」欄に、整理番号「' + r.no + '」をご入力ください（下記のリンクから開くと入力済みになります）。'
    : 'お申し込みフォームの「整理券番号」欄は、「整理券を持っていない」にチェックしてください（下記のリンクから開くとチェック済みになります）。';

  const text =
    r.name + ' 様\n\n' +
    '一般社団法人 国際ヘルスケアAI管理推進協会です。\n' +
    thanks + '\n\n' +
    opening + '\n\n' +
    '▼ お申し込みページ\n' + link + '\n\n' +
    ticketNote + '\n\n' +
    '■ ' + P.price + '\n\n' +
    '■ お申し込み後の流れ\n' +
    P.steps.map((s, i) => (i + 1) + '. ' + s).join('\n') + '\n\n' +
    'ご不明な点は、本メールにご返信いただくか、お問い合わせフォーム（' + SITE_URL + 'contact.html）よりご連絡ください。\n\n' +
    MAIL_FROM_NAME + '\n' + SITE_URL + '\n';

  const html =
    '<div style="font-family:sans-serif;line-height:1.8;color:#1B2A38;max-width:600px">' +
    '<p>' + esc_(r.name) + ' 様</p>' +
    '<p>一般社団法人 国際ヘルスケアAI管理推進協会です。<br>' + esc_(thanks) + '</p>' +
    '<p>' + esc_(opening) + '</p>' +
    '<div style="text-align:center;margin:24px 0">' +
    '<a href="' + esc_(link) + '" style="display:inline-block;background:#14A3A3;color:#fff;text-decoration:none;font-weight:bold;padding:14px 28px;border-radius:28px">' + esc_(P.label) + ' のお申し込みはこちら</a>' +
    '<div style="font-size:12px;color:#5E7081;margin-top:8px;word-break:break-all">' + esc_(link) + '</div>' +
    '</div>' +
    '<p style="font-size:14px;background:#F2F7FA;border-radius:8px;padding:10px 14px">' + esc_(ticketNote) + '</p>' +
    '<p style="font-size:15px;font-weight:bold;color:#0B3B66;margin-bottom:4px">' + esc_(P.price) + '</p>' +
    '<p style="font-size:14px;font-weight:bold;color:#0B3B66;margin:16px 0 4px">お申し込み後の流れ</p>' +
    '<ol style="font-size:14px;margin-top:0;padding-left:1.4em">' + P.steps.map(s => '<li>' + esc_(s) + '</li>').join('') + '</ol>' +
    '<p style="font-size:14px">ご不明な点は、本メールにご返信いただくか、<a href="' + SITE_URL + 'contact.html" style="color:#14A3A3">お問い合わせフォーム</a>よりご連絡ください。</p>' +
    '<p style="margin-top:20px">' + esc_(MAIL_FROM_NAME) + '<br><a href="' + SITE_URL + '" style="color:#14A3A3">' + SITE_URL + '</a></p>' +
    '</div>';

  return { subject: P.subject + '｜国際ヘルスケアAI管理推進協会', text: text, html: html };
}

// ====== 補助 ======

/** Gmail の一時的な送信エラー（Please try again later）に備え、待ってから最大2回まで送り直す */
function sendWithRetry_(to, subject, m) {
  for (let attempt = 0; ; attempt++) {
    try {
      MailApp.sendEmail(to, subject, m.text, { htmlBody: m.html, name: MAIL_FROM_NAME });
      return;
    } catch (err) {
      if (attempt >= 2) throw err;
      Utilities.sleep(3000 * (attempt + 1));
    }
  }
}

function groupLabel_(r) {
  return r.group === 'ticket' ? '整理券' : r.listName;
}

function programKeyByLabel_(label) {
  return Object.keys(PROGRAMS).find(k => PROGRAMS[k].label === label) || '';
}

function logSheet_(ss) {
  let sh = ss.getSheetByName(LOG_SHEET);
  if (!sh) sh = ss.insertSheet(LOG_SHEET);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS])
      .setFontWeight('bold').setBackground('#0B3B66').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  }
  return sh;
}

function now_() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
}

function esc_(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
