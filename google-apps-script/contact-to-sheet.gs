/**
 * お問い合わせフォーム → Google スプレッドシート同期
 * + 送信者への自動返信
 * + 協会宛ての整理済み通知メール（Formspree の保険）
 *
 * GAS 編集画面:
 * https://script.google.com/home/projects/12x7yEys49M6TYArRk0NdSdVQy0ES0_Fr4CNMsXtt8QMYmOJiMFfDG_mr/edit
 *
 * セットアップ手順は docs/google-sheets-sync.md を参照してください。
 */

/** スプレッドシート ID（URL の /d/ と /edit の間） */
const SPREADSHEET_ID = '190L3DfU8S-xpa9-EEyv0FgkUQ8vD6fEgL0lt2rbcVfc';

/** 書き込み先シート名 */
const SHEET_NAME = 'contact_form';

/** 自動返信メールの送信者表示名 */
const AUTO_REPLY_FROM_NAME = '一般社団法人 国際ヘルスケアAI推進協会';

/**
 * 協会宛通知のデフォルト宛先（カンマ区切り可）。
 * スクリプトプロパティ ASSOCIATION_NOTIFY_TO があればそちらを優先する。
 * 例: 'info@iha-ac.com, other@example.com'
 */
const ASSOCIATION_NOTIFY_TO_FALLBACK = 'info@iha-ac.com';

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
  '協会通知',
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
    const notifyStatus = sendAssociationNotify_(payload);
    updateStatusColumns_(autoReplyStatus, notifyStatus);
    return jsonOutput({
      ok: true,
      autoReply: autoReplyStatus,
      associationNotify: notifyStatus,
    });
  } catch (err) {
    return jsonOutput({ ok: false, error: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return jsonOutput({ ok: true, service: 'contact-to-sheet' });
}

/**
 * メール送信権限の承認用（エディタから手動実行）。
 * これを1回実行すると「権限を確認」ダイアログが出ます。
 * doGet では MailApp を使わないため、承認画面が出ません。
 */
function authorizeMail() {
  const remaining = MailApp.getRemainingDailyQuota();
  Logger.log('MailApp 権限OK。本日の残り送信数: ' + remaining);
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
  ensureHeaders_(sheet);
  return sheet;
}

function appendRow_(payload) {
  const sheet = getSheet_();
  ensureHeaders_(sheet);
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
    '送信中',
  ]);
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    return;
  }
  // 既存シートは列構成を壊さない。不足している末尾ステータス列だけ補う。
  if (sheet.getLastColumn() < 9 || !String(sheet.getRange(1, 9).getValue() || '').trim()) {
    sheet.getRange(1, 9).setValue('自動返信').setFontWeight('bold');
  }
  if (sheet.getLastColumn() < 10 || !String(sheet.getRange(1, 10).getValue() || '').trim()) {
    sheet.getRange(1, 10).setValue('協会通知').setFontWeight('bold');
  }
  sheet.setFrozenRows(1);
}

function updateStatusColumns_(autoReplyStatus, notifyStatus) {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  ensureHeaders_(sheet);
  sheet.getRange(lastRow, 9).setValue(autoReplyStatus);
  sheet.getRange(lastRow, 10).setValue(notifyStatus);
}

function getAssociationReplyTo_() {
  return PropertiesService.getScriptProperties().getProperty('ASSOCIATION_REPLY_TO') || '';
}

/** 協会宛通知先（プロパティ優先、なければ FALLBACK）。カンマ／セミコロン／空白区切り可 */
function getAssociationNotifyTo_() {
  const raw =
    PropertiesService.getScriptProperties().getProperty('ASSOCIATION_NOTIFY_TO') ||
    ASSOCIATION_NOTIFY_TO_FALLBACK ||
    '';
  return String(raw)
    .split(/[,;\s]+/)
    .map(function (s) {
      return s.trim();
    })
    .filter(function (s) {
      return s && isValidEmail_(s);
    });
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

/**
 * 協会宛て通知（Formspree の保険）。
 * 問い合わせ内容を整理して複数宛先へ転送する。
 * Reply-To は問い合わせ者メールに設定し、そのまま返信できるようにする。
 */
function sendAssociationNotify_(payload) {
  const recipients = getAssociationNotifyTo_();
  if (!recipients.length) return '宛先未設定';

  const receivedAt = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  const topic = payload.topic || '（未選択）';
  const name = payload.name || '（未記入）';
  const subject = '【お問い合わせ通知】' + topic + ' / ' + name;
  const plainBody = buildAssociationNotifyPlain_(payload, receivedAt);
  const htmlBody = buildAssociationNotifyHtml_(payload, receivedAt);
  const options = {
    htmlBody: htmlBody,
    name: AUTO_REPLY_FROM_NAME,
  };
  if (payload.email && isValidEmail_(payload.email)) {
    options.replyTo = payload.email;
  }

  try {
    MailApp.sendEmail(recipients.join(','), subject, plainBody, options);
    return '送信済 (' + recipients.length + '件)';
  } catch (err) {
    return '送信失敗: ' + String(err.message || err);
  }
}

function buildAssociationNotifyPlain_(payload, receivedAt) {
  return (
    'ウェブサイトのお問い合わせフォームから新規の問い合わせがありました。\n' +
    '（Formspree 通知の保険として Apps Script からも送信しています）\n\n' +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    '■ 受付日時\n' + receivedAt + '\n\n' +
    '■ お名前\n' + (payload.name || '（未記入）') + '\n\n' +
    '■ 法人名・所属\n' + (payload.org || '（未記入）') + '\n\n' +
    '■ メールアドレス\n' + (payload.email || '（未記入）') + '\n\n' +
    '■ 電話番号\n' + (payload.tel || '（未記入）') + '\n\n' +
    '■ お問い合わせ種別\n' + (payload.topic || '（未選択）') + '\n\n' +
    '■ お問い合わせ内容\n' + (payload.message || '（未記入）') + '\n\n' +
    '■ 個人情報同意\n' + (payload.consent || '（未記入）') + '\n' +
    '━━━━━━━━━━━━━━━━━━━━\n\n' +
    '※ このメールに返信すると、問い合わせ者（Reply-To）へ返信できます。\n' +
    '※ 記録先: スプレッドシート「contact_form」\n'
  );
}

function buildAssociationNotifyHtml_(payload, receivedAt) {
  const esc = function (s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };
  const row = function (label, value, multiline) {
    const v = multiline
      ? esc(value || '（未記入）').replace(/\n/g, '<br>')
      : esc(value || '（未記入）');
    return (
      '<tr>' +
      '<th style="text-align:left;vertical-align:top;padding:10px 12px;width:140px;background:#F2F7FA;border-bottom:1px solid #E2EAF0;color:#0B3B66;font-size:13px">' +
      esc(label) +
      '</th>' +
      '<td style="padding:10px 12px;border-bottom:1px solid #E2EAF0;font-size:14px;line-height:1.7">' +
      v +
      '</td>' +
      '</tr>'
    );
  };
  return (
    '<div style="font-family:sans-serif;line-height:1.7;color:#1B2A38;max-width:680px">' +
    '<p style="margin:0 0 8px;font-size:15px"><strong>新規お問い合わせ（協会宛通知）</strong></p>' +
    '<p style="margin:0 0 18px;font-size:13px;color:#5E7081">Formspree 通知の保険として Apps Script からも送信しています。</p>' +
    '<table style="width:100%;border-collapse:collapse;border:1px solid #E2EAF0;border-radius:8px;overflow:hidden">' +
    row('受付日時', receivedAt, false) +
    row('お名前', payload.name, false) +
    row('法人名・所属', payload.org, false) +
    row('メールアドレス', payload.email, false) +
    row('電話番号', payload.tel, false) +
    row('お問い合わせ種別', payload.topic || '（未選択）', false) +
    row('お問い合わせ内容', payload.message, true) +
    row('個人情報同意', payload.consent, false) +
    '</table>' +
    '<p style="margin-top:18px;font-size:13px;color:#5E7081">※ このメールに返信すると、問い合わせ者（Reply-To）へ返信できます。<br>' +
    '※ 記録先: スプレッドシート「contact_form」</p>' +
    '</div>'
  );
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
