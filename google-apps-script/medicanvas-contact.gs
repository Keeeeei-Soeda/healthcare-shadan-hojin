/**
 * medicanvas-contact.gs — 株式会社メディキャンバス お問い合わせ API（10/4 会場配布の紹介チラシの QR から）
 *   medicanvas/index.html → この Apps Script（Web アプリ）→ メディキャンバス用スプレッドシート
 *
 * スプレッドシートに紐づけて使う（シートの「拡張機能」→「Apps Script」から作成）。
 * 手順: docs/medicanvas-contact.md
 *
 * 機能
 *   1. 入力チェック（必須・メール形式・bot 用おとり欄）
 *   2. 「問い合わせ」タブに1行追記（スクリプトロック内）
 *   3. 送信者へ自動返信、担当者へ通知（MailApp。差出人はデプロイしたアカウント、返信先は CONTACT_ADDRESS）
 *
 * スクリプトプロパティ（任意）
 *   NOTIFY_TO … 通知先（カンマ区切り可）。未設定なら CONTACT_ADDRESS
 *   ACCEPTING … false で受付停止
 */

// ====== 設定 ======
const SHEET_NAME = '問い合わせ';
const CONTACT_ADDRESS = 'info@medi-canvas.com';
const FROM_NAME = '株式会社メディキャンバス';
const TOPICS = ['資料請求', '開発・導入のご相談', 'その他'];
const LOCK_WAIT_MS = 20000;
const RATE_LIMIT_PER_HOUR = 5;

const HEADERS = [
  '受付日時', 'お名前', 'ご所属', 'メールアドレス', '電話番号',
  'ご用件', 'ご相談内容', '自動返信', '担当者通知', '対応メモ',
];
const COL_AUTO_REPLY = 8;

const MAX_LENGTH = { name: 50, facility: 100, email: 254, tel: 20, message: 2000 };

// ====== エディタから1回だけ実行 ======

/** 「問い合わせ」タブと見出しを作り、メール送信の権限を承認する */
function setupContact() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  Logger.log('準備完了。本日のメール残り送信数: ' + MailApp.getRemainingDailyQuota());
}

// ====== Web アプリ ======

function doGet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  return json_({
    ok: true,
    service: 'medicanvas-contact',
    accepting: isAccepting_(),
    ready: !!sheet,
    count: sheet ? Math.max(sheet.getLastRow() - 1, 0) : 0,
  });
}

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (_) {
    return json_({ ok: false, message: '送信内容を読み取れませんでした。' });
  }

  // bot 用おとり欄に入力があれば、記録せずに成功を返す
  if (data.website) return json_({ ok: true });

  if (!isAccepting_()) {
    return json_({ ok: false, closed: true, message: 'ただいま受付を停止しています。' });
  }

  const input = normalize_(data);
  const error = validate_(input);
  if (error) return json_(Object.assign({ ok: false }, error));

  if (isRateLimited_(input.email)) {
    return json_({ ok: false, message: '短時間に何度も送信されています。しばらくしてからお試しください。' });
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return json_({ ok: false, message: '受付準備中です。しばらくしてからお試しください。' });

  const receivedAt = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) {
    return json_({ ok: false, message: '混み合っています。もう一度送信してください。' });
  }
  let row;
  try {
    sheet.appendRow([
      receivedAt, cell_(input.name), cell_(input.facility), cell_(input.email), cell_(input.tel),
      input.topic, cell_(input.message), '送信中', '送信中', '',
    ]);
    row = sheet.getLastRow();
  } finally {
    lock.releaseLock();
  }

  const autoReply = sendAutoReply_(input);
  const notify = sendNotify_(input, receivedAt);
  sheet.getRange(row, COL_AUTO_REPLY, 1, 2).setValues([[autoReply, notify]]);

  return json_({ ok: true, name: input.name, email: input.email, topic: input.topic });
}

// ====== 入力 ======

function normalize_(data) {
  const text = (v, max) => String(v || '').trim().slice(0, max);
  return {
    name: text(data.name, MAX_LENGTH.name),
    facility: text(data.facility, MAX_LENGTH.facility),
    email: text(data.email, MAX_LENGTH.email).replace(/＠/g, '@'),
    tel: text(data.tel, MAX_LENGTH.tel),
    topic: TOPICS.indexOf(data.topic) >= 0 ? data.topic : '',
    message: text(data.message, MAX_LENGTH.message),
    agree: data.agree === true,
  };
}

function validate_(input) {
  if (!input.name || !input.facility || !input.email) return { message: '未入力の項目があります。' };
  if (!/^[A-Za-z0-9][A-Za-z0-9._%+\-]*@[A-Za-z0-9](?:[A-Za-z0-9\-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9\-]*[A-Za-z0-9])?)+$/.test(input.email)) {
    return { field: 'email', message: 'メールアドレスの形式が正しくありません。' };
  }
  if (!input.agree) return { message: '個人情報の取り扱いへの同意が必要です。' };
  return null;
}

/** シートで数式として実行されないよう、記号始まりの値は文字列として書き込む */
function cell_(value) {
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}

function isRateLimited_(email) {
  const cache = CacheService.getScriptCache();
  const key = 'rate:' + email.toLowerCase();
  const count = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(count), 3600);
  return count > RATE_LIMIT_PER_HOUR;
}

function isAccepting_() {
  return PropertiesService.getScriptProperties().getProperty('ACCEPTING') !== 'false';
}

// ====== メール ======

function sendAutoReply_(input) {
  const subject = '【株式会社メディキャンバス】お問い合わせを受け付けました';
  const body =
    input.name + ' 様\n\n' +
    'このたびは株式会社メディキャンバスへお問い合わせいただき、誠にありがとうございます。\n' +
    '以下の内容で受け付けました。担当者より順次ご連絡いたします。\n\n' +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    summary_(input) +
    '━━━━━━━━━━━━━━━━━━━━\n\n' +
    '※ このメールへの返信でもお問い合わせいただけます。\n' +
    '※ お心当たりのない場合は、お手数ですが破棄してください。\n\n' +
    '株式会社メディキャンバス\n' +
    CONTACT_ADDRESS + '\n' +
    'https://medi-canvas.com/\n';
  return sendMail_(input.email, subject, body, CONTACT_ADDRESS);
}

function sendNotify_(input, receivedAt) {
  const raw = PropertiesService.getScriptProperties().getProperty('NOTIFY_TO') || CONTACT_ADDRESS;
  const recipients = raw.split(/[,;\s]+/).filter(s => s.indexOf('@') > 0);
  if (!recipients.length) return '宛先未設定';

  const subject = '【お問い合わせ通知】' + (input.topic || 'ご用件未選択') + ' / ' + input.name;
  const body =
    '10/4 学術研究会で配布した紹介チラシの QR コードから、お問い合わせがありました。\n\n' +
    '■ 受付日時\n' + receivedAt + '\n\n' +
    summary_(input) + '\n' +
    '※ このメールに返信すると、問い合わせた方へ返信できます。\n' +
    '※ 記録先: スプレッドシートの「' + SHEET_NAME + '」タブ\n';
  return sendMail_(recipients.join(','), subject, body, input.email);
}

function sendMail_(to, subject, body, replyTo) {
  try {
    MailApp.sendEmail(to, subject, body, { name: FROM_NAME, replyTo: replyTo });
    return '送信済';
  } catch (err) {
    return '送信失敗: ' + String(err.message || err);
  }
}

function summary_(input) {
  return (
    '■ お名前\n' + input.name + '\n\n' +
    '■ ご所属\n' + input.facility + '\n\n' +
    '■ メールアドレス\n' + input.email + '\n\n' +
    '■ 電話番号\n' + (input.tel || '（未記入）') + '\n\n' +
    '■ ご用件\n' + (input.topic || '（未選択）') + '\n\n' +
    '■ ご相談内容\n' + (input.message || '（未記入）') + '\n'
  );
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
