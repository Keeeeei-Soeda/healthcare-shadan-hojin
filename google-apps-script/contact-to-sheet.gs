/**
 * お問い合わせフォーム → Google スプレッドシート同期 + 送信者への自動返信
 *
 * セットアップ手順は docs/google-sheets-sync.md を参照してください。
 */

/** スプレッドシート ID（URL の /d/ と /edit の間） */
const SPREADSHEET_ID = '190L3DfU8S-xpa9-EEyv0FgkUQ8vD6fEgL0lt2rbcVfc';

/** 書き込み先シート名 */
const SHEET_NAME = 'contact_form';

/** 自動返信メールの送信者表示名 */
const AUTO_REPLY_FROM_NAME = '一般社団法人 国際ヘルスケアAI推進協会';

/** スクリプトプロパティ SHEET_SYNC_TOKEN と一致させる（未設定ならトークン検証スキップ） */
const SYNC_TOKEN = PropertiesService.getScriptProperties().getProperty('SHEET_SYNC_TOKEN') || '';

const HEADERS = [
  '受付日時',
  'お名前',
  '法人名・所属',
  'メールアドレス',
  '電話番号',
  'お問い合わせ種別',
  'お問い合わせ内容',
  '個人情報同意',
  '自動返信',
];

function doPost(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return jsonOutput({ ok: false, error: 'Server busy' });
  }

  try {
    const payload = parsePayload_(e);
    if (!payload) {
      return jsonOutput({ ok: false, error: 'Invalid payload' });
    }

    if (SYNC_TOKEN && payload.token !== SYNC_TOKEN) {
      return jsonOutput({ ok: false, error: 'Unauthorized' });
    }

    if (isRateLimited_(payload.email)) {
      return jsonOutput({ ok: false, error: 'Rate limited' });
    }

    appendRow_(payload);
    const autoReplyStatus = sendAutoReply_(payload);
    updateAutoReplyStatus_(autoReplyStatus);
    return jsonOutput({ ok: true, autoReply: autoReplyStatus });
  } catch (err) {
    return jsonOutput({ ok: false, error: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return jsonOutput({ ok: true, service: 'contact-to-sheet' });
}

function parsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) return null;
  const raw = e.postData.contents;
  const data = JSON.parse(raw);
  return {
    token: String(data.token || ''),
    name: String(data.name || ''),
    org: String(data.org || ''),
    email: String(data.email || ''),
    tel: String(data.tel || ''),
    topic: String(data.topic || ''),
    message: String(data.message || ''),
    consent: String(data.consent || ''),
  };
}

function getSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

function appendRow_(payload) {
  const sheet = getSheet_();
  sheet.appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    payload.name,
    payload.org,
    payload.email,
    payload.tel,
    payload.topic,
    payload.message,
    payload.consent,
    '送信中',
  ]);
}

function updateAutoReplyStatus_(status) {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const colCount = sheet.getLastColumn();
  if (colCount < HEADERS.length) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  sheet.getRange(lastRow, HEADERS.length).setValue(status);
}

function getAssociationReplyTo_() {
  return PropertiesService.getScriptProperties().getProperty('ASSOCIATION_REPLY_TO') || '';
}

function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sendAutoReply_(payload) {
  if (!payload.email) return 'メールなし';
  if (!isValidEmail_(payload.email)) return 'メール形式不正';

  const name = payload.name || 'お客様';
  const subject = '【一般社団法人 国際ヘルスケアAI推進協会】お問い合わせを受け付けました';
  const plainBody = buildAutoReplyPlain_(name, payload);
  const htmlBody = buildAutoReplyHtml_(name, payload);
  const options = {
    htmlBody: htmlBody,
    name: AUTO_REPLY_FROM_NAME,
  };

  const replyTo = getAssociationReplyTo_();
  if (replyTo) options.replyTo = replyTo;

  try {
    MailApp.sendEmail(payload.email, subject, plainBody, options);
    return '送信済';
  } catch (err) {
    return '送信失敗: ' + String(err.message || err);
  }
}

function buildAutoReplyPlain_(name, payload) {
  return (
    name + ' 様\n\n' +
    'この度は、一般社団法人 国際ヘルスケアAI推進協会へお問い合わせいただき、誠にありがとうございます。\n' +
    '以下の内容でお問い合わせを受け付けました。担当者より順次ご連絡いたします。\n\n' +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    '■ お問い合わせ種別\n' + payload.topic + '\n\n' +
    '■ お問い合わせ内容\n' + payload.message + '\n' +
    '━━━━━━━━━━━━━━━━━━━━\n\n' +
    '※ 本メールは自動送信です。心当たりがない場合は破棄してください。\n\n' +
    '一般社団法人 国際ヘルスケアAI推進協会\n' +
    '〒732-0065 広島市東区牛田中1-1-11\n'
  );
}

function buildAutoReplyHtml_(name, payload) {
  const esc = function (s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };
  return (
    '<div style="font-family:sans-serif;line-height:1.8;color:#1B2A38;max-width:640px">' +
    '<p>' + esc(name) + ' 様</p>' +
    '<p>この度は、一般社団法人 国際ヘルスケアAI推進協会へお問い合わせいただき、誠にありがとうございます。<br>' +
    '以下の内容でお問い合わせを受け付けました。担当者より順次ご連絡いたします。</p>' +
    '<div style="background:#F2F7FA;border:1px solid #E2EAF0;border-radius:8px;padding:16px 18px;margin:20px 0">' +
    '<p style="margin:0 0 8px"><strong>お問い合わせ種別</strong><br>' + esc(payload.topic) + '</p>' +
    '<p style="margin:0"><strong>お問い合わせ内容</strong><br>' + esc(payload.message).replace(/\n/g, '<br>') + '</p>' +
    '</div>' +
    '<p style="font-size:13px;color:#5E7081">※ 本メールは自動送信です。心当たりがない場合は破棄してください。</p>' +
    '<p style="margin-top:24px">一般社団法人 国際ヘルスケアAI推進協会<br>〒732-0065 広島市東区牛田中1-1-11</p>' +
    '</div>'
  );
}

function isRateLimited_(email) {
  if (!email) return false;
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  const startRow = Math.max(2, lastRow - 49);
  const rows = sheet.getRange(startRow, 1, lastRow, 4).getValues();
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  let count = 0;

  for (let i = rows.length - 1; i >= 0; i--) {
    const receivedAt = rows[i][0];
    const rowEmail = rows[i][3];
    const ts = receivedAt instanceof Date ? receivedAt.getTime() : new Date(receivedAt).getTime();
    if (ts < oneHourAgo) break;
    if (rowEmail === email) count++;
  }

  return count >= 5;
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
