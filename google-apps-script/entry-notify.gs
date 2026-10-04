/**
 * entry-notify.gs — 10/4 申込の担当者通知（1分ごとにシートを見て、新しい申込をメールで知らせる）
 *
 * 受付用の Apps Script（entry-ticket・entry-waitlist）とは別のプロジェクトで動かす。シートは読むだけで書き込まない。
 * Apps Script が書き込んだ行ではシートの変更トリガーが動かないため、時間主導トリガーで定期的に確認する。
 * 手順: docs/entry-notify.md
 *
 * スクリプトプロパティ（任意）
 *   NOTIFY_TO … 通知先（カンマ区切り可）。未設定なら NOTIFY_TO_FALLBACK
 */

const SPREADSHEET_ID = '190L3DfU8S-xpa9-EEyv0FgkUQ8vD6fEgL0lt2rbcVfc';
const NOTIFY_TO_FALLBACK = 'info@iha-as.com';
const CHECK_EVERY_MINUTES = 1;

/** 監視するタブ。列の並び（番号／確認コード／状態／受付日時／氏名／所属施設／メールアドレス）は6タブ共通 */
const TABS = [
  { name: '1004_整理券', label: '配布資料用 病院向け 整理券' },
  { name: '1004_キャンセル待ち', label: '配布資料用 病院向け キャンセル待ち' },
  { name: '1004_管理士_整理券', label: '配布資料用 管理士 整理券' },
  { name: '1004_管理士_キャンセル待ち', label: '配布資料用 管理士 キャンセル待ち' },
  { name: '1004_投影_病院向け_ウェイティング', label: '投影用 病院向け ウェイティングリスト' },
  { name: '1004_投影_管理士_ウェイティング', label: '投影用 管理士 ウェイティングリスト' },
];
const COL = { no: 0, code: 1, receivedAt: 3, name: 4, facility: 5, email: 6 };

// ====== エディタから実行 ======

/** 1分ごとの確認を開始する（実行すると、その時点までの申込もまとめて1通で通知する） */
function startNotify() {
  stopNotify();
  ScriptApp.newTrigger('checkNewEntries').timeBased().everyMinutes(CHECK_EVERY_MINUTES).create();
  checkNewEntries();
}

/** 確認を止める（イベント終了後に実行） */
function stopNotify() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'checkNewEntries')
    .forEach(t => ScriptApp.deleteTrigger(t));
}

// ====== 定期実行 ======

function checkNewEntries() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const fresh = [];
    const totals = [];
    const seenByTab = {};

    TABS.forEach(tab => {
      const sheet = ss.getSheetByName(tab.name);
      if (!sheet || sheet.getLastRow() < 2) {
        totals.push(tab.label + '：0件');
        seenByTab[tab.name] = [];
        return;
      }
      const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getDisplayValues()
        .filter(r => r[COL.receivedAt] && r[COL.name]);
      const seen = JSON.parse(props.getProperty('seen:' + tab.name) || '[]');
      const keys = rows.map(r => r[COL.no] + '|' + r[COL.receivedAt]);
      rows.forEach((r, i) => {
        if (seen.indexOf(keys[i]) < 0) fresh.push({ tab: tab, row: r });
      });
      totals.push(tab.label + '：' + rows.length + '件');
      seenByTab[tab.name] = keys;
    });

    if (fresh.length) sendNotify_(fresh, totals);
    Object.keys(seenByTab).forEach(name => props.setProperty('seen:' + name, JSON.stringify(seenByTab[name])));
  } finally {
    lock.releaseLock();
  }
}

function sendNotify_(fresh, totals) {
  const raw = PropertiesService.getScriptProperties().getProperty('NOTIFY_TO') || NOTIFY_TO_FALLBACK;
  const recipients = raw.split(/[,;\s]+/).filter(s => s.indexOf('@') > 0);
  if (!recipients.length) return;

  const first = fresh[0];
  const subject = fresh.length === 1
    ? '【申込通知】' + first.tab.label + ' ' + first.row[COL.no] + ' / ' + first.row[COL.name]
    : '【申込通知】新しい申込 ' + fresh.length + '件';
  const body =
    '10/4 学術研究会の QR コードから、新しい申込がありました。\n\n' +
    fresh.map(({ tab, row }) =>
      '■ ' + tab.label + '　' + row[COL.no] + '（確認コード ' + row[COL.code] + '）\n' +
      '  受付日時：' + row[COL.receivedAt] + '\n' +
      '  氏名：' + row[COL.name] + '\n' +
      '  所属：' + row[COL.facility] + '\n' +
      '  メール：' + row[COL.email] + '\n'
    ).join('\n') +
    '\n━━━━━━━━━━━━━━━━━━━━\n' +
    '現在の件数\n' + totals.join('\n') + '\n\n' +
    '※ スプレッドシート: https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID + '/edit\n';

  MailApp.sendEmail(recipients.join(','), subject, body, { name: '10/4 申込通知' });
}
