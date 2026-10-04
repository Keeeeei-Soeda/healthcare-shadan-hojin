/**
 * qr-access-log.gs — 10/4 QR コードから開かれた申込ページの記録（読み取り数の目安）
 *   entry/・kanrishi/・entry-live/・kanrishi-live/・medicanvas/ → この Apps Script（Web アプリ）→ 記録用スプレッドシート
 *
 * 記録先はスプレッドシートに紐づけた場合はそのシート。単独のプロジェクトなら setupAccessLog が新しく作り、
 * ID をスクリプトプロパティ SHEET_ID に保存する。
 * 受付用の Apps Script（entry-ticket・entry-waitlist・medicanvas-contact）とは独立していて、止まっても受付に影響しない。
 * 手順: docs/qr-access-log.md
 *
 * 記録する項目：日時・ページ・端末（スマホ／タブレット／PC）。個人を特定できる情報は受け取らない。
 */

const SHEET_NAME = 'アクセス記録';
const HEADERS = ['日時', 'ページ', '端末'];
const PAGES = {
  'entry': '配布資料用 病院向け',
  'kanrishi': '配布資料用 管理士',
  'entry-live': '投影用 病院向け',
  'kanrishi-live': '投影用 管理士',
  'medicanvas': 'メディキャンバス',
};
const DEVICES = ['スマホ', 'タブレット', 'PC'];

/** エディタから1回だけ実行：記録用のシート（なければ新規作成）に「アクセス記録」タブと見出しを作る */
function setupAccessLog() {
  let ss = spreadsheet_();
  if (!ss) {
    ss = SpreadsheetApp.create('1004_QRアクセス記録');
    PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());
  }
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  Logger.log('記録先: ' + ss.getUrl());
}

function spreadsheet_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : null;
}

function logSheet_() {
  const ss = spreadsheet_();
  return ss ? ss.getSheetByName(SHEET_NAME) : null;
}

/** ページごとの件数を返す（ブラウザで URL を開いて確認する） */
function doGet() {
  const sheet = logSheet_();
  const counts = {};
  Object.keys(PAGES).forEach(key => { counts[PAGES[key]] = 0; });
  if (sheet && sheet.getLastRow() > 1) {
    sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues().forEach(([label]) => {
      if (label in counts) counts[label]++;
    });
  }
  return json_({ ok: true, service: 'qr-access-log', ready: !!sheet, counts: counts });
}

/** ページから navigator.sendBeacon で届く記録（本文は JSON の文字列） */
function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (_) {
    return json_({ ok: false });
  }
  const label = PAGES[data.page];
  if (!label) return json_({ ok: false });
  const device = DEVICES.indexOf(data.device) >= 0 ? data.device : '';

  const sheet = logSheet_();
  if (!sheet) return json_({ ok: false });
  sheet.appendRow([Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'), label, device]);
  return json_({ ok: true });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
