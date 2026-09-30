/**
 * ============================================================
 * 再利用テンプレート: スプレッドシート追記 → 複数宛先メール通知
 * ============================================================
 *
 * 用途:
 *   シートに新しい行が入ったら、内容を整理して複数メールへ通知する。
 *
 * 対応パターン:
 *   A) シート監視（推奨・汎用）… Googleフォーム / 手動入力 / 他ツール連携
 *   B) Webアプリ POST … 自サイトのフォームから JSON を受けて追記＋通知
 *
 * セットアップ手順: docs/sheet-email-notify-template.md
 */

// ========== ここをプロジェクトごとに変更 ==========

/** 通知対象シート名 */
const SHEET_NAME = 'contact_form';

/** 通知メールの送信者表示名 */
const MAIL_FROM_NAME = 'お問い合わせ通知';

/** 件名の接頭辞 */
const SUBJECT_PREFIX = '【新規データ通知】';

/**
 * 通知先のフォールバック（カンマ区切り可）。
 * スクリプトプロパティ NOTIFY_TO があればそちら優先。
 * 例: 'a@example.com, b@example.com'
 */
const NOTIFY_TO_FALLBACK = '';

/**
 * 通知対象にする列（1始まり）。空配列なら「ヘッダー行の全列」。
 * 例: [1, 2, 3, 4] → A〜D列だけメールに載せる
 */
const INCLUDE_COLUMNS = [];

/** 通知済みを記録する列名（末尾に自動追加）。空文字なら記録しない */
const NOTIFY_STATUS_HEADER = '通知ステータス';

// ========== 以下は原則そのまま ==========

/**
 * 初回セットアップ: エディタから1回実行。
 * - メール権限の承認
 * - シート変更時トリガーの登録
 */
function setupSheetNotify() {
  MailApp.getRemainingDailyQuota(); // 権限承認を促す
  removeSheetNotifyTriggers_();
  ScriptApp.newTrigger('onSheetChangeNotify')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onChange()
    .create();
  Logger.log('セットアップ完了: onChange トリガーを登録しました。NOTIFY_TO をスクリプトプロパティに設定してください。');
}

/** メール権限だけ先に承認したいとき用 */
function authorizeMail() {
  Logger.log('MailApp 権限OK。本日の残り送信数: ' + MailApp.getRemainingDailyQuota());
}

/**
 * シート変更トリガー本体。
 * INSERT_ROW / EDIT などで最終行を見て、未通知ならメール送信。
 */
function onSheetChangeNotify(e) {
  const type = e && e.changeType ? String(e.changeType) : '';
  // 行追加・編集・その他の更新を拾う（フォーム送信や外部追記の取りこぼし防止）
  if (type && type !== 'INSERT_ROW' && type !== 'EDIT' && type !== 'OTHER') {
    return;
  }
  notifyLatestUnsentRows_();
}

/** 手動実行用: 未通知の最新行を通知 */
function notifyNow() {
  notifyLatestUnsentRows_();
}

// ---------- 内部処理 ----------

function notifyLatestUnsentRows_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;

  try {
    const sheet = getTargetSheet_();
    if (!sheet) return;

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    const headers = getHeaders_(sheet);
    const statusCol = ensureStatusColumn_(sheet, headers);
    const startCol = 1;
    const endCol = Math.max(headers.length, statusCol);
    const width = endCol;

    // 直近最大20行をチェック（連続投入にも対応）
    const checkFrom = Math.max(2, lastRow - 19);
    const values = sheet.getRange(checkFrom, startCol, lastRow, width).getValues();

    for (let i = 0; i < values.length; i++) {
      const rowIndex = checkFrom + i;
      const row = values[i];
      const status = statusCol ? String(row[statusCol - 1] || '') : '';
      if (status.indexOf('送信済') === 0) continue;
      if (isEmptyRow_(row, statusCol)) continue;

      const payload = rowToPayload_(headers, row, statusCol);
      const result = sendNotifyMail_(payload, rowIndex);
      if (statusCol) {
        sheet.getRange(rowIndex, statusCol).setValue(result);
      }
    }
  } finally {
    lock.releaseLock();
  }
}

function getTargetSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return null;
  return ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
}

function getHeaders_(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
    return String(h || '').trim();
  });
}

function ensureStatusColumn_(sheet, headers) {
  if (!NOTIFY_STATUS_HEADER) return 0;
  const idx = headers.indexOf(NOTIFY_STATUS_HEADER);
  if (idx >= 0) return idx + 1;
  const col = headers.length + 1;
  sheet.getRange(1, col).setValue(NOTIFY_STATUS_HEADER).setFontWeight('bold');
  return col;
}

function isEmptyRow_(row, statusCol) {
  for (let c = 0; c < row.length; c++) {
    if (statusCol && c === statusCol - 1) continue;
    if (String(row[c] || '').trim() !== '') return false;
  }
  return true;
}

function rowToPayload_(headers, row, statusCol) {
  const fields = [];
  for (let c = 0; c < headers.length; c++) {
    if (statusCol && c === statusCol - 1) continue;
    if (INCLUDE_COLUMNS.length && INCLUDE_COLUMNS.indexOf(c + 1) < 0) continue;
    const label = headers[c] || '列' + (c + 1);
    if (!label) continue;
    fields.push({ label: label, value: stringifyCell_(row[c]) });
  }
  return { fields: fields };
}

function stringifyCell_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  }
  return String(v == null ? '' : v);
}

function getNotifyTo_() {
  const raw =
    PropertiesService.getScriptProperties().getProperty('NOTIFY_TO') ||
    NOTIFY_TO_FALLBACK ||
    '';
  return String(raw)
    .split(/[,;\s]+/)
    .map(function (s) {
      return s.trim();
    })
    .filter(function (s) {
      return s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
    });
}

function sendNotifyMail_(payload, rowIndex) {
  const recipients = getNotifyTo_();
  if (!recipients.length) return '宛先未設定';

  const receivedAt = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  const firstValue = (payload.fields[0] && payload.fields[0].value) || ('行' + rowIndex);
  const subject = SUBJECT_PREFIX + firstValue;
  const plainBody = buildPlain_(payload, receivedAt, rowIndex);
  const htmlBody = buildHtml_(payload, receivedAt, rowIndex);

  try {
    MailApp.sendEmail(recipients.join(','), subject, plainBody, {
      htmlBody: htmlBody,
      name: MAIL_FROM_NAME,
    });
    return '送信済 (' + recipients.length + '件) ' + receivedAt;
  } catch (err) {
    return '送信失敗: ' + String(err.message || err);
  }
}

function buildPlain_(payload, receivedAt, rowIndex) {
  let body =
    'スプレッドシートに新しいデータが追加されました。\n\n' +
    '受付検知: ' + receivedAt + '\n' +
    '行番号: ' + rowIndex + '\n' +
    'シート: ' + SHEET_NAME + '\n\n' +
    '━━━━━━━━━━━━━━━━━━━━\n';
  payload.fields.forEach(function (f) {
    body += '■ ' + f.label + '\n' + (f.value || '（未記入）') + '\n\n';
  });
  body += '━━━━━━━━━━━━━━━━━━━━\n';
  return body;
}

function buildHtml_(payload, receivedAt, rowIndex) {
  const esc = function (s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };
  let rows = '';
  payload.fields.forEach(function (f) {
    rows +=
      '<tr>' +
      '<th style="text-align:left;vertical-align:top;padding:10px 12px;width:160px;background:#F5F7FA;border-bottom:1px solid #E5E7EB;font-size:13px">' +
      esc(f.label) +
      '</th>' +
      '<td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;font-size:14px;line-height:1.7">' +
      esc(f.value || '（未記入）').replace(/\n/g, '<br>') +
      '</td>' +
      '</tr>';
  });
  return (
    '<div style="font-family:sans-serif;line-height:1.7;color:#111;max-width:680px">' +
    '<p><strong>新規データ通知</strong></p>' +
    '<p style="font-size:13px;color:#666">検知: ' + esc(receivedAt) + ' / 行: ' + rowIndex + ' / シート: ' + esc(SHEET_NAME) + '</p>' +
    '<table style="width:100%;border-collapse:collapse;border:1px solid #E5E7EB">' +
    rows +
    '</table>' +
    '</div>'
  );
}

function removeSheetNotifyTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onSheetChangeNotify') {
      ScriptApp.deleteTrigger(t);
    }
  });
}

// ============================================================
// オプション: Webアプリ POST で追記＋通知したい場合
// （自サイトのフォーム連携用。不要ならこの先は削除してよい）
// ============================================================

/**
 * POST JSON 例:
 * { "token":"...", "fields": { "お名前":"山田", "内容":"..." } }
 * またはフラット: { "name":"山田", "message":"..." }
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return jsonOut_({ ok: false, error: 'Server busy' });
  }
  try {
    const data = parsePost_(e);
    if (!data) return jsonOut_({ ok: false, error: 'Invalid payload' });

    const expected = PropertiesService.getScriptProperties().getProperty('SYNC_TOKEN') || '';
    if (expected && data.token !== expected) {
      return jsonOut_({ ok: false, error: 'Unauthorized' });
    }

    const sheet = getTargetSheet_();
    if (!sheet) return jsonOut_({ ok: false, error: 'Sheet not found' });

    const headers = getHeaders_(sheet);
    const statusCol = ensureStatusColumn_(sheet, headers);
    const row = headers.map(function (h, idx) {
      if (statusCol && idx === statusCol - 1) return '送信中';
      if (!h) return '';
      if (data.fields && data.fields[h] != null) return data.fields[h];
      // よくある英語キーにもフォールバック
      const map = { お名前: 'name', メールアドレス: 'email', お問い合わせ内容: 'message' };
      const eng = map[h];
      return eng && data[eng] != null ? data[eng] : '';
    });
    while (row.length < (statusCol || headers.length)) row.push('');
    if (statusCol && row.length < statusCol) {
      while (row.length < statusCol - 1) row.push('');
      row.push('送信中');
    }

    sheet.appendRow(row);
    const rowIndex = sheet.getLastRow();
    const payload = rowToPayload_(getHeaders_(sheet), sheet.getRange(rowIndex, 1, rowIndex, Math.max(headers.length, statusCol)).getValues()[0], statusCol);
    const result = sendNotifyMail_(payload, rowIndex);
    if (statusCol) sheet.getRange(rowIndex, statusCol).setValue(result);
    return jsonOut_({ ok: true, notify: result, row: rowIndex });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return jsonOut_({ ok: true, service: 'sheet-email-notify-template' });
}

function parsePost_(e) {
  if (!e || !e.postData || !e.postData.contents) return null;
  const data = JSON.parse(e.postData.contents);
  return {
    token: String(data.token || ''),
    fields: data.fields || null,
    name: data.name,
    email: data.email,
    message: data.message,
  };
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
