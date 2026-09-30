/**
 * 10/4 会場参加用ウェイティングリスト API（会場投影用 QR コードの入口・2制度対応）
 *   entry-live/index.html    … 病院向けAI研修（program: 'hospital'）
 *   kanrishi-live/index.html … 医療AIガバナンス管理士（program: 'kanrishi'）
 *   → この Apps Script（Web アプリ）→ Google スプレッドシート
 *
 * 会場配布用（entry-ticket.gs：整理券＋キャンセル待ち）とは別プロジェクト・別 URL。
 * こちらは整理券を発行せず、受付順（ウェイティングリスト）への登録のみ行う。
 *
 * 機能
 *   1. 受付順（通し番号）＋確認コード（ランダム4文字）を発行。確認コードは配布用のタブとも重複しない
 *   2. メールドメインの実在チェック＋よくある打ち間違いドメインの検出
 *   3. Resend で確認メール送信。未設定・失敗時は Gmail(MailApp) で代替送信
 *   4. Resend の配信結果（到達／不達／遅延）を5分ごとに取得してシートに記録
 *
 * 同時申込への対策
 *   「登録済み確認 → 受付順の決定 → 書き込み」を LockService のスクリプトロック内で一括実行する。
 *
 * デプロイ
 *   - entry-ticket.gs・contact-to-sheet.gs とは別の Apps Script プロジェクト（doPost が衝突するため）
 *   - 更新時は「デプロイを管理」→ 既存デプロイを「新バージョン」で更新（URL を変えない）
 *   - 手順: docs/entry-waitlist.md
 *
 * スクリプトプロパティ
 *   RESEND_API_KEY        … Resend の API キー（未設定なら Gmail で送信・到達確認なし）
 *   MAIL_FROM             … 送信元。例: 国際ヘルスケアAI管理推進協会 <noreply@iha-as.com>
 *   ASSOCIATION_REPLY_TO  … 返信先アドレス（任意）
 *   ACCEPTING             … false で全制度の受付停止（任意）
 *   ACCEPTING_HOSPITAL    … false で病院向けのみ停止（任意）
 *   ACCEPTING_KANRISHI    … false で管理士のみ停止（任意）
 */

// ====== 共通設定 ======
const SPREADSHEET_ID = '190L3DfU8S-xpa9-EEyv0FgkUQ8vD6fEgL0lt2rbcVfc';
const ACCEPTING = true;
const LOCK_WAIT_MS = 20000;

/** 確認コードに使う文字（0/O, 1/I/L, 2/Z, 5/S, 6/G, 8/B など読み間違えやすい文字を除外） */
const CODE_CHARS = 'ACDEFHJKMNPQRTUVWXY3479';
const CODE_LENGTH = 4;

const MAIL_FROM_NAME = '一般社団法人 国際ヘルスケアAI管理推進協会';
const EVENT_INFO = '2026年10月4日（日）日本レセプト学会 学術研究会（昭和女子大学）';
const SITE_URL = 'https://www.iha-as.com/';
const LIST_NAME = '会場参加用ウェイティングリスト';

// ====== 制度ごとの設定 ======
const DEFAULT_PROGRAM = 'hospital';
const PROGRAMS = {
  hospital: {
    label: '病院向けAI研修',
    sheet: '1004_投影_病院向け_ウェイティング',
    waitLimit: 0, // 0 = 上限なし
    inquiry: 'お問い合わせは、2026年10月8日（木）より受け付けます。',
  },
  kanrishi: {
    label: '医療AIガバナンス管理士',
    sheet: '1004_投影_管理士_ウェイティング',
    waitLimit: 0,
    inquiry: 'お問い合わせは、2026年10月8日（木）より受け付けます。',
  },
};

/** 確認コードの重複確認のみに使う（読み取りのみ・書き込みはしない）会場配布用のタブ */
const DISTRIBUTION_SHEETS = ['1004_整理券', '1004_キャンセル待ち', '1004_管理士_整理券', '1004_管理士_キャンセル待ち'];

/** よくある打ち間違いドメイン → 正しいドメイン（実在するためDNSチェックを通ってしまうもの） */
const TYPO_DOMAINS = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmali.com': 'gmail.com',
  'gmil.com': 'gmail.com', 'gmaill.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gmail.co': 'gmail.com',
  'gmail.cm': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.jp': 'gmail.com', 'gmail.co.jp': 'gmail.com',
  'yahoo.co.jo': 'yahoo.co.jp', 'yaho.co.jp': 'yahoo.co.jp', 'yahooo.co.jp': 'yahoo.co.jp', 'yhoo.co.jp': 'yahoo.co.jp',
  'yahoo.jp': 'yahoo.co.jp', 'yahoo.co.jpp': 'yahoo.co.jp',
  'docomo.ne.jo': 'docomo.ne.jp', 'docomo.co.jp': 'docomo.ne.jp', 'docomo.jp': 'docomo.ne.jp',
  'ezweb.ne.jo': 'ezweb.ne.jp', 'ezweb.co.jp': 'ezweb.ne.jp',
  'softbank.ne.jo': 'softbank.ne.jp', 'i.softbank.ne.jo': 'i.softbank.ne.jp',
  'icloud.co': 'icloud.com', 'icloud.jp': 'icloud.com', 'iclod.com': 'icloud.com',
  'hotmial.com': 'hotmail.com', 'hotmai.com': 'hotmail.com',
  'outlook.co': 'outlook.com', 'outlok.com': 'outlook.com', 'outlok.jp': 'outlook.jp',
};

// ====== シート定義（会場配布用のキャンセル待ちタブと同じ列の並び） ======
const W_HEADERS = ['受付順', '確認コード', '状態', '受付日時', '氏名', '所属施設', 'メールアドレス', 'メール送信', '到達状況', 'メールID', '対応メモ'];
const C = { KEY: 0, CODE: 1, STATUS: 2, TIME: 3, NAME: 4, FACILITY: 5, EMAIL: 6, SENT: 7, DELIV: 8, MAILID: 9 };

const WAITING = '待機中';

const DELIVERY_LABEL = {
  queued: '送信中', scheduled: '送信中', sent: '送信中',
  delivered: '到達', opened: '到達', clicked: '到達',
  delivery_delayed: '遅延中',
  bounced: '不達',
  complained: '迷惑メール報告',
  failed: '送信失敗',
  canceled: 'キャンセル',
};
const DELIVERY_FINAL = ['到達', '不達', '迷惑メール報告', '送信失敗', 'キャンセル'];
const DELIVERY_UNTRACKED = '確認不可（Gmail送信）';

/** メールアドレスとして受け付ける形（先頭は英数字。= + - @ 始まりはシートで数式扱いになるため不可） */
const EMAIL_RE = /^[A-Za-z0-9][A-Za-z0-9._%+\-]*@[A-Za-z0-9](?:[A-Za-z0-9\-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9\-]*[A-Za-z0-9])?)+$/;

// ============================================================
// 初期セットアップ（エディタから実行。何度実行しても既存タブは変更しない）
// ============================================================
function setupWaitlist() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  Object.keys(PROGRAMS).forEach(key => {
    const P = PROGRAMS[key];
    let ws = ss.getSheetByName(P.sheet);
    if (!ws) ws = ss.insertSheet(P.sheet);
    if (ws.getLastRow() > 0) {
      console.log('スキップ（既存）: ' + P.sheet);
      return;
    }
    styleHeader_(ws, W_HEADERS);
    ws.setColumnWidths(1, 2, 90);
    ws.setColumnWidth(4, 150);
    ws.setColumnWidths(5, 3, 200);
    ws.setColumnWidth(11, 240);
    console.log('作成: ' + P.sheet);
  });
}

/** 到達確認の定期実行（5分ごと）を登録。Resend 利用時にエディタから1回実行 */
function installDeliveryTrigger() {
  removeDeliveryTrigger();
  ScriptApp.newTrigger('checkDelivery').timeBased().everyMinutes(5).create();
}

function removeDeliveryTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'checkDelivery')
    .forEach(t => ScriptApp.deleteTrigger(t));
}

function styleHeader_(sh, headers) {
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#0B3B66').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
}

// ============================================================
// Web API
// ============================================================
function doGet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const programs = {};
  Object.keys(PROGRAMS).forEach(k => {
    programs[k] = Object.assign({ accepting: isAccepting_(k) }, stats_(ss, k));
  });
  return json_({ ok: true, service: 'entry-waitlist', resend: !!prop_('RESEND_API_KEY'), programs: programs });
}

function doPost(e) {
  let p;
  try {
    p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (_) {
    return json_({ ok: false, message: '送信内容を読み取れませんでした。' });
  }

  if (p.website) return json_({ ok: false, message: '送信できませんでした。' }); // bot 用おとり欄

  const program = p.program ? String(p.program) : DEFAULT_PROGRAM;
  if (!PROGRAMS[program]) return json_({ ok: false, message: '申込ページが正しくありません。' });

  const name = clean_(p.name, 50);
  const facility = clean_(p.facility, 100);
  const email = String(p.email || '').trim().replace(/＠/g, '@').toLowerCase().slice(0, 254);

  if (!name || !facility || !email) return json_({ ok: false, message: '未入力の項目があります。' });
  if (!EMAIL_RE.test(email)) return json_({ ok: false, field: 'email', message: 'メールアドレスの形式が正しくありません。' });
  if (!p.agree) return json_({ ok: false, message: '個人情報の取り扱いへの同意が必要です。' });
  if (!isAccepting_(program)) return json_({ ok: false, closed: true, message: '現在、' + LIST_NAME + 'の受付を行っていません。' });

  // 打ち間違いドメイン・実在チェック（ロック外）
  const domain = email.split('@')[1];
  if (TYPO_DOMAINS[domain]) {
    return json_({ ok: false, field: 'email', message: 'メールアドレスが「@' + domain + '」になっています。「@' + TYPO_DOMAINS[domain] + '」の誤りではありませんか？ご確認のうえ修正してください。' });
  }
  if (!domainAcceptsMail_(domain)) {
    return json_({ ok: false, field: 'email', message: 'メールアドレスのドメイン「@' + domain + '」が見つかりません。入力内容をご確認ください。' });
  }

  // ---- 排他区間：同時申込は1件ずつ到着順に処理 ----
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) {
    return json_({ ok: false, message: '混み合っています。少し時間をおいて、もう一度送信してください。' });
  }
  let r;
  try {
    r = register_(program, name, facility, email);
    SpreadsheetApp.flush(); // ロック解除前に書き込みを確定
  } finally {
    lock.releaseLock();
  }
  // ---- 排他区間ここまで ----

  if (r.type === 'notready') {
    return json_({ ok: false, message: '受付準備中です。しばらくしてから、もう一度お試しください。' });
  }
  if (r.type === 'full') {
    return json_({ ok: false, full: true, message: LIST_NAME + 'の受付は終了しました。' });
  }

  // 確認メール（ロック外）。新規登録時のみ送る（再送信時は画面に再表示のみ）
  if (r.mail) {
    const res = sendWaitMail_(program, email, r);
    try {
      r.sheet.getRange(r.row, C.SENT + 1, 1, 3).setValues([[res.sent, res.deliv, res.id]]);
    } catch (_) {}
  }

  return json_({ ok: true, program: program, waitlist: true, position: r.position, code: r.code, name: r.name, facility: r.facility, email: email, repeat: !!r.repeat });
}

/**
 * 受付順の登録（必ずロック内で呼ぶ）
 * ①登録済み → 同じ受付順 ②未登録 → 末尾に追加
 */
function register_(program, name, facility, email) {
  const P = PROGRAMS[program];
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const ws = ss.getSheetByName(P.sheet);
  if (!ws || ws.getLastRow() < 1) return { type: 'notready' }; // setupWaitlist 未実行
  const now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');

  const wLast = ws.getLastRow();
  const waits = wLast >= 2 ? ws.getRange(2, 1, wLast - 1, W_HEADERS.length).getDisplayValues() : [];

  // ① 登録済み（再送信・通信エラー後の再試行）
  const w = waits.find(x => x[C.EMAIL].toLowerCase() === email);
  if (w) {
    return { type: 'waitlist', repeat: true, position: Number(w[C.KEY]), code: w[C.CODE], name: w[C.NAME], facility: w[C.FACILITY] };
  }

  // ② 末尾に追加
  const position = waits.length + 1;
  if (P.waitLimit > 0 && position > P.waitLimit) return { type: 'full' };
  const code = newCode_(allCodes_(ss));
  const wRow = wLast + 1;
  ws.getRange(wRow, C.CODE + 1).setNumberFormat('@');
  ws.getRange(wRow, 1, 1, 7).setValues([[position, code, WAITING, now, name, facility, email]]);
  return { type: 'waitlist', position: position, code: code, name: name, facility: facility, mail: true, sheet: ws, row: wRow, at: now };
}

// ============================================================
// 到達確認（トリガーで5分ごとに実行）
//   ロックは取らない：対象は「メールID」が入った行の「到達状況」列のみで、申込処理とは書き込み先が重ならない
// ============================================================
function checkDelivery() {
  const key = prop_('RESEND_API_KEY');
  if (!key) return;
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let calls = 0;
  ownSheetNames_().forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return;
    const rows = sh.getRange(2, 1, sh.getLastRow() - 1, C.MAILID + 1).getDisplayValues();
    rows.forEach((r, i) => {
      const id = r[C.MAILID];
      if (!id || DELIVERY_FINAL.indexOf(r[C.DELIV]) !== -1 || calls >= 60) return;
      if (calls > 0) Utilities.sleep(600); // Resend API のレート制限（毎秒2回）対策
      calls++;
      try {
        const res = UrlFetchApp.fetch('https://api.resend.com/emails/' + encodeURIComponent(id), {
          method: 'get',
          headers: { Authorization: 'Bearer ' + key },
          muteHttpExceptions: true,
        });
        if (res.getResponseCode() !== 200) return;
        const ev = JSON.parse(res.getContentText()).last_event;
        const label = DELIVERY_LABEL[ev] || String(ev || '');
        if (label && label !== r[C.DELIV]) sh.getRange(i + 2, C.DELIV + 1).setValue(label);
      } catch (err) {
        console.error('checkDelivery: ' + err);
      }
    });
  });
}

// ============================================================
// ドメイン実在チェック（Google Public DNS）
// ============================================================
function domainAcceptsMail_(domain) {
  if (!domain) return false;
  const cache = CacheService.getScriptCache();
  const cached = cache.get('dom:' + domain);
  if (cached) return cached === '1';
  let ok = true;
  try {
    const mx = dnsQuery_(domain, 'MX');
    if (mx.Status === 3) {
      ok = false; // NXDOMAIN：ドメインが存在しない
    } else if (mx.Status === 0 && (!mx.Answer || !mx.Answer.some(a => a.type === 15))) {
      const a = dnsQuery_(domain, 'A'); // MX なし → A レコードがあれば受信可能（暗黙MX）
      ok = a.Status === 0 && !!a.Answer && a.Answer.some(x => x.type === 1);
    }
  } catch (err) {
    console.error('dns: ' + err);
    return true; // DNS 照会自体の失敗では申込を止めない
  }
  cache.put('dom:' + domain, ok ? '1' : '0', 21600);
  return ok;
}

function dnsQuery_(name, type) {
  const res = UrlFetchApp.fetch('https://dns.google/resolve?name=' + encodeURIComponent(name) + '&type=' + type, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('DNS HTTP ' + res.getResponseCode());
  return JSON.parse(res.getContentText());
}

// ============================================================
// メール
// ============================================================
function sendWaitMail_(program, email, r) {
  const P = PROGRAMS[program];
  return sendMail_(program, email, r, {
    subject: '【' + LIST_NAME + ' ' + r.position + '番目】' + P.label,
    intro: P.label + 'の' + LIST_NAME + 'に登録しました。',
    extra: '参加枠に空きが出た場合は、受付順に協会よりメールでご連絡いたします。',
    label: LIST_NAME,
    value: r.position + '番目',
    idem: 'live-wait-' + r.position,
  });
}

/** @return {{sent:string, deliv:string, id:string}} */
function sendMail_(program, email, r, m) {
  const P = PROGRAMS[program];
  const n = String(r.name).replace(/^'/, '');
  const f = String(r.facility).replace(/^'/, '');
  const subject = m.subject + '｜国際ヘルスケアAI管理推進協会';
  const text =
    n + ' 様\n\n' +
    '一般社団法人 国際ヘルスケアAI管理推進協会です。\n' +
    m.intro + '\n' + (m.extra ? m.extra + '\n' : '') + '\n' +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    '　' + P.label + '\n' +
    '　' + m.label + '：' + m.value + '\n' +
    '　確認コード：' + r.code + '\n' +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    'お名前　：' + n + '\n' +
    '所属　　：' + f + '\n' +
    '開催日　：' + EVENT_INFO + '\n\n' +
    'お問い合わせの際は、受付順と確認コードをお伝えください。\n' +
    P.inquiry + '\n\n' +
    '※ 本メールは送信専用の自動送信です。心当たりがない場合は破棄してください。\n\n' +
    MAIL_FROM_NAME + '\n' + SITE_URL + '\n';
  const html =
    '<div style="font-family:sans-serif;line-height:1.8;color:#1B2A38;max-width:600px">' +
    '<p>' + esc_(n) + ' 様</p>' +
    '<p>一般社団法人 国際ヘルスケアAI管理推進協会です。<br>' + esc_(m.intro) + (m.extra ? '<br>' + esc_(m.extra) : '') + '</p>' +
    '<div style="text-align:center;border:2px dashed #D9A520;border-radius:12px;padding:18px;margin:20px 0;background:#FFF8E6">' +
    '<div style="font-size:12px;color:#5E7081">' + esc_(P.label) + '</div>' +
    '<div style="font-size:13px;color:#8A6300;font-weight:bold">' + esc_(m.label) + '</div>' +
    '<div style="font-size:44px;font-weight:900;color:#0B3B66;letter-spacing:.04em;line-height:1.2">' + esc_(m.value) + '</div>' +
    '<div style="display:inline-block;margin:8px 0 10px;padding:4px 14px;border-radius:8px;background:#fff;border:1px solid #E2EAF0;font-size:14px">確認コード <strong style="font-size:20px;letter-spacing:.15em;font-family:monospace">' + esc_(r.code) + '</strong></div>' +
    '<div style="font-size:14px">' + esc_(n) + ' 様<br><span style="color:#5E7081">' + esc_(f) + '</span></div>' +
    '</div>' +
    '<p style="font-size:14px">開催日：' + esc_(EVENT_INFO) + '<br>お問い合わせの際は、受付順と確認コードをお伝えください。<br>' + esc_(P.inquiry) + '</p>' +
    '<p style="font-size:12px;color:#5E7081">※ 本メールは送信専用の自動送信です。心当たりがない場合は破棄してください。</p>' +
    '<p style="margin-top:20px">' + esc_(MAIL_FROM_NAME) + '<br><a href="' + SITE_URL + '" style="color:#14A3A3">' + SITE_URL + '</a></p>' +
    '</div>';

  const replyTo = prop_('ASSOCIATION_REPLY_TO');
  const key = prop_('RESEND_API_KEY');
  const from = prop_('MAIL_FROM');

  // --- Resend（到達確認あり） ---
  if (key && from) {
    try {
      const body = { from: from, to: [email], subject: subject, html: html, text: text };
      if (replyTo) body.reply_to = replyTo;
      // 重複送信防止キー：登録日時を含めるので、テストデータ消去後に同じ受付順・同じアドレスで再テストしても送られる
      const idem = ['iha-1004', program, m.idem, String(r.at || '').replace(/\D/g, ''), Utilities.base64EncodeWebSafe(email).slice(0, 100)].join('-');
      const res = UrlFetchApp.fetch('https://api.resend.com/emails', {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + key, 'Idempotency-Key': idem },
        payload: JSON.stringify(body),
        muteHttpExceptions: true,
      });
      const code = res.getResponseCode();
      if (code >= 200 && code < 300) {
        return { sent: '送信済', deliv: '送信中', id: JSON.parse(res.getContentText()).id || '' };
      }
      console.error('Resend HTTP ' + code + ': ' + res.getContentText());
    } catch (err) {
      console.error('Resend: ' + err);
    }
    // 失敗時は Gmail で代替送信（メールは必ず届ける）
  }

  // --- Gmail（MailApp）: 到達確認なし ---
  try {
    const opts = { htmlBody: html, name: MAIL_FROM_NAME };
    if (replyTo) opts.replyTo = replyTo;
    MailApp.sendEmail(email, subject, text, opts);
    return { sent: key ? '送信済（Gmail代替）' : '送信済', deliv: DELIVERY_UNTRACKED, id: '' };
  } catch (err) {
    return { sent: '送信失敗: ' + String(err.message || err), deliv: '', id: '' };
  }
}

// ============================================================
// 補助
// ============================================================
function ownSheetNames_() {
  return Object.keys(PROGRAMS).map(k => PROGRAMS[k].sheet);
}

/** 会場投影用・会場配布用の全タブにある確認コードの集合 */
function allCodes_(ss) {
  const used = {};
  ownSheetNames_().concat(DISTRIBUTION_SHEETS).forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return;
    sh.getRange(2, C.CODE + 1, sh.getLastRow() - 1, 1).getDisplayValues().forEach(r => { if (r[0]) used[r[0]] = true; });
  });
  return used;
}

function newCode_(used) {
  for (let n = 0; n < 1000; n++) {
    let c = '';
    for (let i = 0; i < CODE_LENGTH; i++) c += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
    if (!used[c]) { used[c] = true; return c; }
  }
  throw new Error('確認コードを生成できませんでした');
}

function prop_(k) {
  return PropertiesService.getScriptProperties().getProperty(k) || '';
}

function isAccepting_(program) {
  if (prop_('ACCEPTING') === 'false') return false;
  if (prop_('ACCEPTING_' + String(program).toUpperCase()) === 'false') return false;
  return ACCEPTING;
}

function stats_(ss, program) {
  const ws = ss.getSheetByName(PROGRAMS[program].sheet);
  let registered = 0, waiting = 0;
  if (ws && ws.getLastRow() >= 2) {
    const d = ws.getRange(2, 1, ws.getLastRow() - 1, C.STATUS + 1).getDisplayValues();
    registered = d.filter(r => r[C.KEY] !== '').length;
    waiting = d.filter(r => r[C.STATUS] === WAITING).length;
  }
  return { ready: !!ws, registered: registered, waiting: waiting };
}

/** 登録数確認（エディタから実行 → ログに表示） */
function showRemaining() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  Object.keys(PROGRAMS).forEach(k => {
    const s = stats_(ss, k);
    console.log(PROGRAMS[k].label + '（' + LIST_NAME + '）：登録 ' + s.registered + '名（待機中 ' + s.waiting + '名）');
  });
}

/** Resend 送信テスト（エディタで宛先を書き換えて実行） */
function testResendMail() {
  const res = sendMail_('hospital', 'your-address@example.com',
    { name: 'テスト', facility: 'テスト病院', code: 'TEST', position: 0, at: String(Date.now()) },
    { subject: '【テスト】送信テスト', intro: 'Resend 送信テストです。', extra: '', label: LIST_NAME, value: '0番目', idem: 'test' });
  console.log(JSON.stringify(res));
}

function clean_(v, max) {
  let s = String(v == null ? '' : v).replace(/[\r\n\t]/g, ' ').trim().slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // 数式インジェクション対策
  return s;
}

function esc_(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
