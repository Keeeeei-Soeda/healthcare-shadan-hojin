/**
 * 10/4 整理券発行 API（病院向けAI研修／医療AIガバナンス管理士の2制度）
 *   entry/index.html・kanrishi/index.html（GitHub Pages）→ この Apps Script（Web アプリ）→ Google スプレッドシート
 *
 * 機能
 *   1. 整理番号（連番）＋確認コード（ランダム4文字・全制度で重複なし）を発行
 *   2. 定員到達後はキャンセル待ち（受付順・確認コード付き）として制度ごとの別タブに記録
 *   3. メール形式・打ち間違いドメイン・ドメイン実在チェック
 *   4. Resend で確認メール送信（協会ドメインから送信）。未設定・失敗時は Gmail(MailApp) で代替送信
 *   5. Resend の配信結果（到達／不達／遅延）を5分ごとに取得してシートに記録
 *
 * 制度の指定
 *   POST の program（'hospital'／'kanrishi'）。未指定は hospital（entry/index.html は program を送らない）
 *
 * 同時申込への対策
 *   「登録済み確認 → 空き番号検索 → 書き込み」を LockService のスクリプトロック内で一括実行する。
 *   同時に届いた申込は制度をまたいでも到着順に1件ずつ処理され、番号の二重発行や定員超過の発行は起きない。
 *   ドメイン確認・メール送信（外部通信）はロックの外で行い、待ち行列を短く保つ。
 *
 * デプロイ
 *   - お問い合わせ用（contact-to-sheet.gs）とは別の Apps Script プロジェクトにすること（doPost が衝突するため）
 *   - 手順: docs/entry-ticket.md
 *
 * スクリプトプロパティ（プロジェクトの設定 → スクリプト プロパティ）
 *   RESEND_API_KEY        … Resend の API キー（未設定なら Gmail で送信・到達確認なし）
 *   MAIL_FROM             … 送信元。例: 国際ヘルスケアAI管理推進協会 <noreply@iha-as.com>（Resend で認証済みのドメイン）
 *   ASSOCIATION_REPLY_TO  … 返信先アドレス（任意）
 *   ACCEPTING             … false にすると全制度の受付停止（任意）
 *   ACCEPTING_HOSPITAL    … false にすると病院向けのみ受付停止（任意）
 *   ACCEPTING_KANRISHI    … false にすると管理士のみ受付停止（任意）
 */

// ====== 設定 ======
const SPREADSHEET_ID = '190L3DfU8S-xpa9-EEyv0FgkUQ8vD6fEgL0lt2rbcVfc'; // お問い合わせと同じファイルに別タブで作成

/** 制度ごとの設定。キーはページから送られる program の値 */
const PROGRAMS = {
  hospital: {
    label: '病院向けAI研修',
    sheet: '1004_整理券',
    waitSheet: '1004_キャンセル待ち',
    prefix: '',
    acceptingProp: 'ACCEPTING_HOSPITAL',
  },
  kanrishi: {
    label: '医療AIガバナンス管理士',
    sheet: '1004_管理士_整理券',
    waitSheet: '1004_管理士_キャンセル待ち',
    prefix: 'K-',
    acceptingProp: 'ACCEPTING_KANRISHI',
  },
};
const DEFAULT_PROGRAM = 'hospital';

const TICKET_COUNT = 50;   // setupTickets() で作る番号の数（制度ごと）
const WAITLIST_LIMIT = 0;  // キャンセル待ちの上限（0 = 上限なし）
const ACCEPTING = true;    // false で全制度の受付停止（スクリプトプロパティでも可）

const LOCK_WAIT_MS = 20000; // ロック待ちの最大時間。1件の処理は通常1秒未満

/** 確認コードに使う文字（0/O, 1/I/L, 2/Z, 5/S, 6/G, 8/B など読み間違えやすい文字を除外） */
const CODE_CHARS = 'ACDEFHJKMNPQRTUVWXY3479';
const CODE_LENGTH = 4;

/** 先頭は英数字（=, +, - 始まりはシートで数式扱いになるため不可）。kanrishi/index.html と同じ判定 */
const EMAIL_RE = /^[A-Za-z0-9][A-Za-z0-9._%+\-]*@[A-Za-z0-9](?:[A-Za-z0-9\-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9\-]*[A-Za-z0-9])?)+$/;

/** 実在するため DNS チェックを通ってしまう、代表的な打ち間違いドメイン → 正しいドメイン */
const TYPO_DOMAINS = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gamil.com': 'gmail.com',
  'gnail.com': 'gmail.com', 'gmaill.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com',
  'gmail.cm': 'gmail.com', 'gmail.om': 'gmail.com', 'gmail.jp': 'gmail.com', 'gmail.co.jp': 'gmail.com',
  'yahoo.co.jo': 'yahoo.co.jp', 'yaho.co.jp': 'yahoo.co.jp', 'yahooo.co.jp': 'yahoo.co.jp',
  'yahoo.co.pj': 'yahoo.co.jp', 'yahoo.jp': 'yahoo.co.jp', 'yahoo.ne.jp': 'yahoo.co.jp',
  'docomo.ne.jo': 'docomo.ne.jp', 'docomo.co.jp': 'docomo.ne.jp', 'docomo.jp': 'docomo.ne.jp',
  'ezweb.ne.jo': 'ezweb.ne.jp', 'softbank.ne.jo': 'softbank.ne.jp', 'i.softbank.jo': 'i.softbank.jp',
  'icloud.co': 'icloud.com', 'icloud.con': 'icloud.com', 'iclould.com': 'icloud.com', 'icoud.com': 'icloud.com',
  'hotmial.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmail.co': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outlook.co': 'outlook.com', 'outlook.jo': 'outlook.jp',
};

/** メール文面 */
const MAIL_FROM_NAME = '一般社団法人 国際ヘルスケアAI管理推進協会';
const EVENT_INFO = '2026年10月4日（日）日本レセプト学会 学術研究会（昭和女子大学）';
const INQUIRY_NOTE = '整理券に関するお問い合わせは、2026年10月8日（木）より受け付けます。';
const SITE_URL = 'https://www.iha-as.com/';

// ====== シート定義（全タブで列の並びを揃えている） ======
const HEADERS = ['整理番号', '確認コード', '状態', '受付日時', '氏名', '所属施設', 'メールアドレス', 'メール送信', '到達状況', 'メールID'];
const W_HEADERS = ['受付順', '確認コード', '状態', '受付日時', '氏名', '所属施設', 'メールアドレス', 'メール送信', '到達状況', 'メールID', '対応メモ'];
const C = { KEY: 0, CODE: 1, STATUS: 2, TIME: 3, NAME: 4, FACILITY: 5, EMAIL: 6, SENT: 7, DELIV: 8, MAILID: 9 };

const USED = '発行済';
const WAITING = '待機中';
const PROMOTED = '整理券発行済';

/** 到達状況（Resend の last_event → 表示） */
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

// ============================================================
// 初期セットアップ（エディタから実行。何度実行しても既存のタブは変更しない）
// ============================================================
function setupTickets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const usedCodes = collectCodes_(ss);

  Object.keys(PROGRAMS).forEach(key => {
    const pg = PROGRAMS[key];

    let sh = ss.getSheetByName(pg.sheet);
    if (sh && sh.getLastRow() > 1) {
      console.log(pg.sheet + '：スキップ（既存）');
    } else {
      if (!sh) sh = ss.insertSheet(pg.sheet);
      styleHeader_(sh, HEADERS);
      const rows = [];
      for (let i = 1; i <= TICKET_COUNT; i++) {
        rows.push([pg.prefix + String(i).padStart(3, '0'), newCode_(usedCodes), '', '', '', '', '', '', '', '']);
      }
      sh.getRange(2, 1, rows.length, 2).setNumberFormat('@'); // 001 の0落ち防止
      sh.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
      sh.setColumnWidths(1, 2, 90);
      sh.setColumnWidth(4, 150);
      sh.setColumnWidths(5, 3, 200);
      console.log(pg.sheet + '：作成（' + rows[0][0] + '〜' + rows[rows.length - 1][0] + '）');
    }

    let ws = ss.getSheetByName(pg.waitSheet);
    if (ws && ws.getLastRow() > 0) {
      console.log(pg.waitSheet + '：スキップ（既存）');
    } else {
      if (!ws) ws = ss.insertSheet(pg.waitSheet);
      styleHeader_(ws, W_HEADERS);
      ws.setColumnWidths(1, 2, 90);
      ws.setColumnWidth(4, 150);
      ws.setColumnWidths(5, 3, 200);
      ws.setColumnWidth(11, 240);
      console.log(pg.waitSheet + '：作成');
    }
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
/** 先頭の accepting/total/used/waiting は病院向け（既存の確認手順との互換） */
function doGet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const programs = {};
  Object.keys(PROGRAMS).forEach(key => {
    programs[key] = Object.assign({ accepting: isAccepting_(key) }, stats_(ss, key));
  });
  const h = programs[DEFAULT_PROGRAM];
  return json_({
    ok: true, service: 'entry-ticket',
    accepting: h.accepting, total: h.total, used: h.used, waiting: h.waiting,
    resend: !!prop_('RESEND_API_KEY'),
    programs: programs,
  });
}

function doPost(e) {
  let p;
  try {
    p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (_) {
    return json_({ ok: false, message: '送信内容を読み取れませんでした。' });
  }

  if (p.website) return json_({ ok: false, message: '送信できませんでした。' }); // bot 用おとり欄

  const programKey = p.program || DEFAULT_PROGRAM;
  const pg = PROGRAMS[programKey];
  if (!pg) return json_({ ok: false, message: '申込の種類を判別できませんでした。ページを再読み込みしてください。' });

  const name = clean_(p.name, 50);
  const facility = clean_(p.facility, 100);
  const email = String(p.email || '').trim().replace(/＠/g, '@').toLowerCase().slice(0, 254);

  if (!name || !facility || !email) return json_({ ok: false, message: '未入力の項目があります。' });
  if (!EMAIL_RE.test(email)) return json_({ ok: false, field: 'email', message: 'メールアドレスの形式が正しくありません。' });
  if (!p.agree) return json_({ ok: false, message: '個人情報の取り扱いへの同意が必要です。' });
  if (!isAccepting_(programKey)) return json_({ ok: false, closed: true, message: '現在、整理券の受付を行っていません。' });

  const domain = email.split('@')[1];
  if (TYPO_DOMAINS[domain]) {
    return json_({ ok: false, field: 'email', message: '「@' + domain + '」は「@' + TYPO_DOMAINS[domain] + '」の誤りではありませんか？入力内容をご確認ください。' });
  }
  // ドメイン実在チェック（ロック外）
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
    r = allocate_(programKey, name, facility, email);
    SpreadsheetApp.flush(); // ロック解除前に書き込みを確定
  } finally {
    lock.releaseLock();
  }
  // ---- 排他区間ここまで ----

  if (r.type === 'notready') {
    return json_({ ok: false, message: '受付準備中です。しばらくしてから、もう一度お試しください。' });
  }

  // 確認メール（ロック外）。新規発行時のみ送る（再送信時は画面に再表示のみ）
  if (r.mail) {
    const res = r.type === 'ticket'
      ? sendTicketMail_(email, pg, r)
      : sendWaitMail_(email, pg, r);
    try {
      r.sheet.getRange(r.row, C.SENT + 1, 1, 3).setValues([[res.sent, res.deliv, res.id]]);
    } catch (_) {}
  }

  const base = { ok: true, program: programKey, code: r.code, name: r.name, facility: r.facility, email: email, repeat: !!r.repeat };
  if (r.type === 'ticket') return json_(Object.assign(base, { ticket: r.ticket }));
  if (r.type === 'waitlist') return json_(Object.assign(base, { waitlist: true, position: r.position }));
  return json_({ ok: false, full: true, message: 'キャンセル待ちの受付も終了しました。' });
}

/**
 * 番号割当の本体（必ずロック内で呼ぶ）
 * ①整理券 発行済み → 同じ番号 ②空き番号あり → 発行 ③キャンセル待ち登録済み → 同じ受付順 ④キャンセル待ちに追加
 */
function allocate_(programKey, name, facility, email) {
  const pg = PROGRAMS[programKey];
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName(pg.sheet);
  const ws = ss.getSheetByName(pg.waitSheet);
  if (!sh || !ws) return { type: 'notready' };

  const date = new Date();
  const now = Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  const issuedAt = Utilities.formatDate(date, 'Asia/Tokyo', 'yyyyMMddHHmmss');

  const tLast = sh.getLastRow();
  const tickets = tLast >= 2 ? sh.getRange(2, 1, tLast - 1, HEADERS.length).getDisplayValues() : [];
  const wLast = ws.getLastRow();
  const waits = wLast >= 2 ? ws.getRange(2, 1, wLast - 1, W_HEADERS.length).getDisplayValues() : [];

  // ① 整理券 発行済み（再送信・通信エラー後の再試行）
  for (const t of tickets) {
    if (t[C.STATUS] === USED && t[C.EMAIL].toLowerCase() === email) {
      return { type: 'ticket', repeat: true, ticket: t[C.KEY], code: t[C.CODE], name: t[C.NAME], facility: t[C.FACILITY] };
    }
  }

  const usedCodes = collectCodes_(ss);
  const waitIdx = waits.findIndex(w => w[C.EMAIL].toLowerCase() === email && w[C.STATUS] === WAITING);

  // ② 空き番号あり → 上から順に発行
  const idx = tickets.findIndex(t => t[C.KEY] !== '' && t[C.STATUS] !== USED);
  if (idx !== -1) {
    const row = idx + 2;
    const ticket = tickets[idx][C.KEY];
    let code = tickets[idx][C.CODE];
    if (!code) { // 当日追加した行などでコードが空なら生成
      code = newCode_(usedCodes);
      sh.getRange(row, C.CODE + 1).setNumberFormat('@').setValue(code);
    }
    sh.getRange(row, C.STATUS + 1, 1, 4).setValues([[USED, now, name, facility]]);
    sh.getRange(row, C.EMAIL + 1).setValue(email);
    if (waitIdx !== -1) ws.getRange(waitIdx + 2, C.STATUS + 1).setValue(PROMOTED + '（' + ticket + '）');
    return { type: 'ticket', ticket: ticket, code: code, name: name, facility: facility, issuedAt: issuedAt, mail: true, sheet: sh, row: row };
  }

  // ③ キャンセル待ち 登録済み
  if (waitIdx !== -1) {
    const w = waits[waitIdx];
    return { type: 'waitlist', repeat: true, position: Number(w[C.KEY]), code: w[C.CODE], name: w[C.NAME], facility: w[C.FACILITY] };
  }

  // ④ キャンセル待ちに追加
  const position = waits.length + 1;
  if (WAITLIST_LIMIT > 0 && position > WAITLIST_LIMIT) return { type: 'full' };
  const code = newCode_(usedCodes);
  const wRow = wLast < 1 ? 2 : wLast + 1;
  ws.getRange(wRow, C.CODE + 1).setNumberFormat('@');
  ws.getRange(wRow, 1, 1, 7).setValues([[position, code, WAITING, now, name, facility, email]]);
  return { type: 'waitlist', position: position, code: code, name: name, facility: facility, issuedAt: issuedAt, mail: true, sheet: ws, row: wRow };
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
  allSheetNames_().forEach(name => {
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
//   存在しないドメイン（NXDOMAIN）や、メールを受け取れないドメインを false
//   DNS 照会自体が失敗した場合は申込を止めないよう true
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
      // MX なし → A レコードがあれば受信可能（RFC 5321 の暗黙MX）
      const a = dnsQuery_(domain, 'A');
      ok = a.Status === 0 && !!a.Answer && a.Answer.some(x => x.type === 1);
    }
  } catch (err) {
    console.error('dns: ' + err);
    return true;
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
function sendTicketMail_(email, pg, r) {
  const title = pg.label + ' 整理券';
  return sendMail_(email, r, {
    subject: '【整理番号 ' + r.ticket + '】' + title,
    program: pg.label,
    intro: title + 'のお申し込みを受け付けました。',
    extra: '',
    label: '整理番号',
    value: r.ticket,
    idem: 'ticket-' + r.ticket + '-' + r.issuedAt,
  });
}

function sendWaitMail_(email, pg, r) {
  const title = pg.label + ' 整理券';
  return sendMail_(email, r, {
    subject: '【キャンセル待ち ' + r.position + '番目】' + title,
    program: pg.label,
    intro: title + 'は定員に達したため、キャンセル待ちとして受け付けました。',
    extra: '整理券に空きが出た場合は、キャンセル待ちの受付順に協会よりメールでご連絡いたします。',
    label: 'キャンセル待ち',
    value: r.position + '番目',
    idem: 'wait-' + pg.prefix + r.position + '-' + r.issuedAt,
  });
}

/** @return {{sent:string, deliv:string, id:string}} */
function sendMail_(email, r, m) {
  const n = String(r.name).replace(/^'/, '');
  const f = String(r.facility).replace(/^'/, '');
  const subject = m.subject + '｜国際ヘルスケアAI管理推進協会';
  const text =
    n + ' 様\n\n' +
    '一般社団法人 国際ヘルスケアAI管理推進協会です。\n' +
    m.intro + '\n' + (m.extra ? m.extra + '\n' : '') + '\n' +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    '　' + m.program + '\n' +
    '　' + m.label + '：' + m.value + '\n' +
    '　確認コード：' + r.code + '\n' +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    'お名前　：' + n + '\n' +
    '所属　　：' + f + '\n' +
    '配布日　：' + EVENT_INFO + '\n\n' +
    '受付やお問い合わせの際は、' + m.label + 'と確認コードをお伝えください。\n' +
    INQUIRY_NOTE + '\n\n' +
    '※ 本メールは送信専用の自動送信です。心当たりがない場合は破棄してください。\n\n' +
    MAIL_FROM_NAME + '\n' + SITE_URL + '\n';
  const html =
    '<div style="font-family:sans-serif;line-height:1.8;color:#1B2A38;max-width:600px">' +
    '<p>' + esc_(n) + ' 様</p>' +
    '<p>一般社団法人 国際ヘルスケアAI管理推進協会です。<br>' + esc_(m.intro) + (m.extra ? '<br>' + esc_(m.extra) : '') + '</p>' +
    '<div style="text-align:center;border:2px dashed #14A3A3;border-radius:12px;padding:18px;margin:20px 0;background:#F2F7FA">' +
    '<div style="display:inline-block;margin-bottom:8px;padding:2px 12px;border-radius:999px;background:#0B3B66;color:#fff;font-size:12px;font-weight:bold">' + esc_(m.program) + '</div>' +
    '<div style="font-size:13px;color:#0B3B66;font-weight:bold">' + esc_(m.label) + '</div>' +
    '<div style="font-size:44px;font-weight:900;color:#0B3B66;letter-spacing:.04em;line-height:1.2">' + esc_(m.value) + '</div>' +
    '<div style="display:inline-block;margin:8px 0 10px;padding:4px 14px;border-radius:8px;background:#fff;border:1px solid #E2EAF0;font-size:14px">確認コード <strong style="font-size:20px;letter-spacing:.15em;font-family:monospace">' + esc_(r.code) + '</strong></div>' +
    '<div style="font-size:14px">' + esc_(n) + ' 様<br><span style="color:#5E7081">' + esc_(f) + '</span></div>' +
    '</div>' +
    '<p style="font-size:14px">配布日：' + esc_(EVENT_INFO) + '<br>受付やお問い合わせの際は、' + esc_(m.label) + 'と確認コードをお伝えください。<br>' + esc_(INQUIRY_NOTE) + '</p>' +
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
      const res = UrlFetchApp.fetch('https://api.resend.com/emails', {
        method: 'post',
        contentType: 'application/json',
        headers: {
          Authorization: 'Bearer ' + key,
          // 発行日時を含める：データ消去後に同じ番号・同じアドレスで再テストしても送られるように
          'Idempotency-Key': 'iha-1004-' + m.idem + '-' + Utilities.base64EncodeWebSafe(email).slice(0, 120),
        },
        payload: JSON.stringify(body),
        muteHttpExceptions: true,
      });
      const code = res.getResponseCode();
      if (code >= 200 && code < 300) {
        const id = JSON.parse(res.getContentText()).id || '';
        return { sent: '送信済', deliv: '送信中', id: id };
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
function allSheetNames_() {
  const names = [];
  Object.keys(PROGRAMS).forEach(k => { names.push(PROGRAMS[k].sheet, PROGRAMS[k].waitSheet); });
  return names;
}

/** 全制度の整理券・キャンセル待ちタブで使用済みの確認コード */
function collectCodes_(ss) {
  const used = {};
  allSheetNames_().forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return;
    sh.getRange(2, C.CODE + 1, sh.getLastRow() - 1, 1).getDisplayValues()
      .forEach(r => { if (r[0]) used[r[0]] = true; });
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

function isAccepting_(programKey) {
  if (prop_('ACCEPTING') === 'false') return false;
  if (prop_(PROGRAMS[programKey].acceptingProp) === 'false') return false;
  return ACCEPTING;
}

function stats_(ss, programKey) {
  const pg = PROGRAMS[programKey];
  const sh = ss.getSheetByName(pg.sheet);
  const ws = ss.getSheetByName(pg.waitSheet);
  let total = 0, used = 0, waiting = 0;
  if (sh && sh.getLastRow() >= 2) {
    const d = sh.getRange(2, 1, sh.getLastRow() - 1, C.STATUS + 1).getDisplayValues();
    total = d.filter(r => r[C.KEY] !== '').length;
    used = d.filter(r => r[C.STATUS] === USED).length;
  }
  if (ws && ws.getLastRow() >= 2) {
    waiting = ws.getRange(2, C.STATUS + 1, ws.getLastRow() - 1, 1).getDisplayValues().filter(r => r[0] === WAITING).length;
  }
  return { ready: !!sh && !!ws, total: total, used: used, waiting: waiting };
}

/** 残数確認（エディタから実行 → ログに制度別に表示） */
function showRemaining() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  Object.keys(PROGRAMS).forEach(key => {
    const s = stats_(ss, key);
    console.log(PROGRAMS[key].label + '：発行済 ' + s.used + ' / ' + s.total + '（残り ' + (s.total - s.used) + '）／キャンセル待ち ' + s.waiting + '名' + (isAccepting_(key) ? '' : '（受付停止中）'));
  });
}

/** Resend 送信テスト（エディタで宛先を書き換えて実行） */
function testResendMail() {
  const res = sendMail_('your-address@example.com', { name: 'テスト', facility: 'テスト病院', code: 'TEST' }, {
    subject: '【テスト】整理券', program: 'テスト', intro: 'Resend 送信テストです。', extra: '', label: '整理番号', value: '000', idem: 'test-' + Date.now(),
  });
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
