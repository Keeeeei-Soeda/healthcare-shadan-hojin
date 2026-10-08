/**
 * 受講・研修お申し込み API（2026年10月8日 受付開始・2制度対応）
 *   kanrishi-apply/index.html … 医療AIガバナンス管理士（個人・program: 'kanrishi'）
 *   hospital-apply/index.html … 医療機関向けAI研修（program: 'hospital'）
 *   → この Apps Script（Web アプリ）→ Google スプレッドシート
 *
 * 機能
 *   1. 受付番号（個人 P-001〜／医療機関 H-001〜）＋確認コード（ランダム4文字）を発行
 *      確認コードは 10/4 整理券・ウェイティングのタブとも重複しない（それらのタブは読み取りのみ）
 *   2. 10/4 で受け取った整理券番号を任意で記録
 *   3. メールドメインの実在チェック＋よくある打ち間違いドメインの検出
 *   4. 確認メール（今後の流れ・振込先は後日送付の旨）を送信。Resend 未設定・失敗時は Gmail(MailApp) で代替送信
 *   5. Resend の配信結果（到達／不達／遅延）を5分ごとに取得してシートに記録
 *
 * 同時申込への対策
 *   「登録済み確認 → 受付番号の決定 → 書き込み」を LockService のスクリプトロック内で一括実行する。
 *
 * デプロイ
 *   - entry-ticket.gs・entry-waitlist.gs・contact-to-sheet.gs とは別の Apps Script プロジェクト（doPost が衝突するため）
 *   - 更新時は「デプロイを管理」→ 既存デプロイを「新バージョン」で更新（URL を変えない）
 *   - 手順: docs/apply.md
 *
 * スクリプトプロパティ
 *   RESEND_API_KEY        … Resend の API キー（未設定なら Gmail で送信・到達確認なし）
 *   MAIL_FROM             … 送信元。例: 国際ヘルスケアAI管理推進協会 <noreply@iha-as.com>
 *   ASSOCIATION_REPLY_TO  … 返信先アドレス（任意）
 *   ACCEPTING             … false で全制度の受付停止（任意）
 *   ACCEPTING_HOSPITAL    … false で医療機関向けのみ停止（任意）
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
const SITE_URL = 'https://www.iha-as.com/';

// ====== 制度ごとの設定 ======
const PROGRAMS = {
  kanrishi: {
    label: '医療AIガバナンス管理士',
    title: '医療AIガバナンス管理士 受講のお申し込み',
    sheet: '申込_管理士',
    prefix: 'P-',
    facilityLabel: 'ご所属',
    steps: [
      '受講料のお振込先は、後日あらためてメールでお送りします。',
      '受講料 38,000円（税別）を、2026年10月20日（火）〜10月31日（土）の期間にお振り込みください。',
      '講習会は2027年2月に開催します（90分）。日程・受講方法は後日ご案内します。',
      '講習会の受講後、理解度テストと提出物をご提出いただき、内容を確認のうえ認定します。',
    ],
  },
  hospital: {
    label: '医療機関向けAI研修',
    title: '医療機関向けAI研修のお申し込み',
    sheet: '申込_医療機関',
    prefix: 'H-',
    facilityLabel: '医療機関名',
    steps: [
      '研修費用 600,000円（税別）のご請求書・お振込先は、後日あらためてメールでお送りします。',
      'ご入金を確認後、担当者より研修の打ち合わせのご連絡をいたします（研修の概要をご説明します）。',
      '打ち合わせの後、研修用ポータルサイトのURLをお送りします。',
    ],
  },
};

/** 確認コードの重複確認のみに使う（読み取りのみ・書き込みはしない）10/4 のタブ */
const EVENT_SHEETS = [
  '1004_整理券', '1004_キャンセル待ち', '1004_管理士_整理券', '1004_管理士_キャンセル待ち',
  '1004_投影_病院向け_ウェイティング', '1004_投影_管理士_ウェイティング',
];

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

// ====== シート定義（先頭7列は 10/4 のタブと同じ並び。entry-notify.gs がそのまま読める） ======
const HEADERS = ['受付番号', '確認コード', '状態', '受付日時', '氏名', '所属施設', 'メールアドレス', '整理券番号', 'メール送信', '到達状況', 'メールID', '対応メモ'];
const C = { KEY: 0, CODE: 1, STATUS: 2, TIME: 3, NAME: 4, FACILITY: 5, EMAIL: 6, TICKET: 7, SENT: 8, DELIV: 9, MAILID: 10 };

/** 申込直後の状態。以降（入金確認済など）は担当者がシートで書き換える */
const RECEIVED = '入金待ち';

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
/** 整理券番号（001／K-001 など。半角英数字とハイフン、先頭は英数字） */
const TICKET_RE = /^[A-Z0-9][A-Z0-9\-]{0,9}$/;

// ============================================================
// 初期セットアップ（エディタから実行。何度実行しても既存タブは変更しない）
// ============================================================
function setupApply() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  Object.keys(PROGRAMS).forEach(key => {
    const P = PROGRAMS[key];
    let sh = ss.getSheetByName(P.sheet);
    if (!sh) sh = ss.insertSheet(P.sheet);
    if (sh.getLastRow() > 0) {
      console.log('スキップ（既存）: ' + P.sheet);
      return;
    }
    styleHeader_(sh, HEADERS);
    sh.setColumnWidths(1, 2, 90);
    sh.setColumnWidth(4, 150);
    sh.setColumnWidths(5, 3, 200);
    sh.setColumnWidth(12, 240);
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
  return json_({ ok: true, service: 'entry-apply', resend: !!prop_('RESEND_API_KEY'), programs: programs });
}

function doPost(e) {
  let p;
  try {
    p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (_) {
    return json_({ ok: false, message: '送信内容を読み取れませんでした。' });
  }

  if (p.website) return json_({ ok: false, message: '送信できませんでした。' }); // bot 用おとり欄

  const program = String(p.program || '');
  if (!PROGRAMS[program]) return json_({ ok: false, message: '申込ページが正しくありません。' });

  const name = clean_(p.name, 50);
  const facility = clean_(p.facility, 100);
  const email = String(p.email || '').trim().replace(/＠/g, '@').toLowerCase().slice(0, 254);
  const ticket = normalizeTicket_(p.ticket);

  if (!name || !facility || !email) return json_({ ok: false, message: '未入力の項目があります。' });
  if (!EMAIL_RE.test(email)) return json_({ ok: false, field: 'email', message: 'メールアドレスの形式が正しくありません。' });
  if (ticket && !TICKET_RE.test(ticket)) return json_({ ok: false, field: 'ticket', message: '整理券番号は、整理券に記載の番号（例：001、K-001）を半角でご入力ください。' });
  if (!p.agree) return json_({ ok: false, message: '個人情報の取り扱いへの同意が必要です。' });
  if (!isAccepting_(program)) return json_({ ok: false, closed: true, message: '現在、お申し込みの受付を行っていません。' });

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
    r = register_(program, name, facility, email, ticket);
    SpreadsheetApp.flush(); // ロック解除前に書き込みを確定
  } finally {
    lock.releaseLock();
  }
  // ---- 排他区間ここまで ----

  if (r.type === 'notready') {
    return json_({ ok: false, message: '受付準備中です。しばらくしてから、もう一度お試しください。' });
  }

  // 確認メール（ロック外）。新規受付時のみ送る（再送信時は画面に再表示のみ）
  if (r.mail) {
    const res = sendApplyMail_(program, email, r);
    try {
      r.sheet.getRange(r.row, C.SENT + 1, 1, 3).setValues([[res.sent, res.deliv, res.id]]);
    } catch (_) {}
  }

  return json_({ ok: true, program: program, number: r.number, code: r.code, name: r.name, facility: r.facility, ticket: r.ticket, email: email, repeat: !!r.repeat });
}

/**
 * 受付の登録（必ずロック内で呼ぶ）
 * ①同じメールで受付済み → 同じ受付番号 ②未登録 → 末尾に追加
 */
function register_(program, name, facility, email, ticket) {
  const P = PROGRAMS[program];
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName(P.sheet);
  if (!sh || sh.getLastRow() < 1) return { type: 'notready' }; // setupApply 未実行
  const now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');

  const last = sh.getLastRow();
  const rows = last >= 2 ? sh.getRange(2, 1, last - 1, HEADERS.length).getDisplayValues() : [];

  // ① 受付済み（再送信・通信エラー後の再試行）
  const done = rows.find(x => x[C.EMAIL].toLowerCase() === email);
  if (done) {
    return { type: 'applied', repeat: true, number: done[C.KEY], code: done[C.CODE], name: done[C.NAME], facility: done[C.FACILITY], ticket: done[C.TICKET] };
  }

  // ② 末尾に追加
  const number = P.prefix + String(rows.length + 1).padStart(3, '0');
  const code = newCode_(allCodes_(ss));
  const row = last + 1;
  sh.getRange(row, C.CODE + 1).setNumberFormat('@');
  sh.getRange(row, C.TICKET + 1).setNumberFormat('@'); // 001 の0落ち防止
  sh.getRange(row, 1, 1, C.TICKET + 1).setValues([[number, code, RECEIVED, now, name, facility, email, ticket]]);
  return { type: 'applied', number: number, code: code, name: name, facility: facility, ticket: ticket, mail: true, sheet: sh, row: row, at: now };
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
/** @return {{sent:string, deliv:string, id:string}} */
function sendApplyMail_(program, email, r) {
  const P = PROGRAMS[program];
  const n = String(r.name).replace(/^'/, '');
  const f = String(r.facility).replace(/^'/, '');
  const subject = '【受付番号 ' + r.number + '】' + P.title + '｜国際ヘルスケアAI管理推進協会';
  const intro = P.title + 'を受け付けました。';
  const text =
    n + ' 様\n\n' +
    '一般社団法人 国際ヘルスケアAI管理推進協会です。\n' +
    intro + '\n\n' +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    '　' + P.label + '\n' +
    '　受付番号：' + r.number + '\n' +
    '　確認コード：' + r.code + '\n' +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    'お名前　　：' + n + '\n' +
    P.facilityLabel + '：' + f + '\n' +
    (r.ticket ? '整理券番号：' + r.ticket + '\n' : '') + '\n' +
    '■ 今後の流れ\n' +
    P.steps.map((s, i) => (i + 1) + '. ' + s).join('\n') + '\n\n' +
    'お問い合わせの際は、受付番号と確認コードをお伝えください。\n\n' +
    '※ 本メールは送信専用の自動送信です。心当たりがない場合は破棄してください。\n\n' +
    MAIL_FROM_NAME + '\n' + SITE_URL + '\n';
  const html =
    '<div style="font-family:sans-serif;line-height:1.8;color:#1B2A38;max-width:600px">' +
    '<p>' + esc_(n) + ' 様</p>' +
    '<p>一般社団法人 国際ヘルスケアAI管理推進協会です。<br>' + esc_(intro) + '</p>' +
    '<div style="text-align:center;border:2px dashed #14A3A3;border-radius:12px;padding:18px;margin:20px 0;background:#F2F7FA">' +
    '<div style="font-size:12px;color:#5E7081">' + esc_(P.label) + '</div>' +
    '<div style="font-size:13px;color:#0B3B66;font-weight:bold">受付番号</div>' +
    '<div style="font-size:44px;font-weight:900;color:#0B3B66;letter-spacing:.04em;line-height:1.2">' + esc_(r.number) + '</div>' +
    '<div style="display:inline-block;margin:8px 0 10px;padding:4px 14px;border-radius:8px;background:#fff;border:1px solid #E2EAF0;font-size:14px">確認コード <strong style="font-size:20px;letter-spacing:.15em;font-family:monospace">' + esc_(r.code) + '</strong></div>' +
    '<div style="font-size:14px">' + esc_(n) + ' 様<br><span style="color:#5E7081">' + esc_(f) + '</span>' +
    (r.ticket ? '<br><span style="color:#5E7081">整理券番号：' + esc_(r.ticket) + '</span>' : '') + '</div>' +
    '</div>' +
    '<p style="font-size:14px;font-weight:bold;color:#0B3B66;margin-bottom:4px">今後の流れ</p>' +
    '<ol style="font-size:14px;margin-top:0;padding-left:1.4em">' + P.steps.map(s => '<li>' + esc_(s) + '</li>').join('') + '</ol>' +
    '<p style="font-size:14px">お問い合わせの際は、受付番号と確認コードをお伝えください。</p>' +
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
      // 重複送信防止キー：受付日時を含めるので、テストデータ消去後に同じ番号・同じアドレスで再テストしても送られる
      const idem = ['iha-apply', program, r.number, String(r.at || '').replace(/\D/g, ''), Utilities.base64EncodeWebSafe(email).slice(0, 100)].join('-');
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

/** 申込タブ・10/4 の全タブにある確認コードの集合 */
function allCodes_(ss) {
  const used = {};
  ownSheetNames_().concat(EVENT_SHEETS).forEach(name => {
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

/** 全角英数字・全角ハイフン類を半角にし、大文字にそろえる（空欄可） */
function normalizeTicket_(v) {
  return String(v == null ? '' : v)
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/[‐－―ー−]/g, '-')
    .replace(/\s/g, '')
    .toUpperCase()
    .slice(0, 10);
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
  const sh = ss.getSheetByName(PROGRAMS[program].sheet);
  let applied = 0;
  if (sh && sh.getLastRow() >= 2) {
    applied = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues().filter(r => r[0] !== '').length;
  }
  return { ready: !!sh, applied: applied };
}

/** 申込数確認（エディタから実行 → ログに表示） */
function showCount() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  Object.keys(PROGRAMS).forEach(k => {
    console.log(PROGRAMS[k].label + '：申込 ' + stats_(ss, k).applied + '件');
  });
}

/** 確認メールの送信テスト（エディタで宛先を書き換えて実行） */
function testApplyMail() {
  const res = sendApplyMail_('kanrishi', 'your-address@example.com',
    { name: 'テスト', facility: 'テスト病院', ticket: 'K-001', code: 'TEST', number: 'P-000', at: String(Date.now()) });
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
