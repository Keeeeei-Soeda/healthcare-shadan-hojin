/**
 * お問い合わせフォーム → Google スプレッドシート同期
 *
 * セットアップ手順は docs/google-sheets-sync.md を参照してください。
 */

/** スプレッドシート ID（URL の /d/ と /edit の間） */
const SPREADSHEET_ID = '190L3DfU8S-xpa9-EEyv0FgkUQ8vD6fEgL0lt2rbcVfc';

/** 書き込み先シート名 */
const SHEET_NAME = 'contact_form';

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
    return jsonOutput({ ok: true });
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
  ]);
}

function isRateLimited_(email) {
  if (!email) return false;
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  const startRow = Math.max(2, lastRow - 49);
  const rows = sheet.getRange(startRow, 1, lastRow - startRow + 1, 4).getValues();
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
