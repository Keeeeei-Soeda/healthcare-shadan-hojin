# 受講・研修のお申し込み（kanrishi-apply/・hospital-apply/）

2026年10月8日（木）受付開始。トップページの「お申し込み」から開く申込ページ2種と、その受付処理。取得する情報は 10/4 の整理券（[`entry-ticket.md`](entry-ticket.md)）と同じで、10/4 に受け取った**整理券番号**を任意で入力できる。

| | 個人の方 | 医療機関の方 |
|---|---|---|
| 制度 | 医療AIガバナンス管理士 | 医療機関向けAI研修 |
| 申込ページ | `https://www.iha-as.com/kanrishi-apply/` | `https://www.iha-as.com/hospital-apply/` |
| `program` | `kanrishi` | `hospital` |
| 受付番号 | `P-001`〜 | `H-001`〜 |
| 記録タブ | `申込_管理士` | `申込_医療機関` |
| 料金 | 受講料 38,000円（税別） | 研修費用 600,000円（税別） |
| 入力項目 | お名前／ご所属／メール／整理券番号（任意） | ご担当者名／医療機関名（部署名）／メール／整理券番号（任意） |

## 申込後の流れ（画面・確認メールに表示する内容）

個人の方（医療AIガバナンス管理士）：
1. お振込先は後日あらためてメールで送る（申込完了画面・メールでその旨を伝える）
2. 受講料 38,000円（税別）を **2026年10月20日（火）〜10月31日（土）**にお振り込み
3. 2027年2月に講習会（90分）
4. 受講後に理解度テスト・提出物
5. 認定

医療機関の方：
1. ご請求書・お振込先は後日あらためてメールで送る。研修費用 600,000円（税別）を **2026年10月20日（火）〜10月31日（土）**にお振り込み
2. 入金確認後、担当者が研修の打ち合わせ（概要説明）
3. 打ち合わせ後、研修用ポータルサイトの URL を送る

文言を変えるときは、ページ（`flow-card` と完了画面の `guide`）と `apply.gs` の `PROGRAMS.*.steps`（メール本文）の両方を直す。

## 構成

```
トップページ（#apply のボタン2つ・個人認定欄のボタン）
        │
        ├─ /kanrishi-apply/（program: kanrishi）
        └─ /hospital-apply/（program: hospital）   … GitHub Pages
             1. 入力 → 2. 確認（メールを大きく表示）→ 3. 受付番号＋確認コード
             │ POST（JSON / text/plain）
             ▼
Apps Script Web アプリ（apply.gs・プロジェクト entry-apply）
  ├ メール形式・打ち間違いドメイン・実在チェック／整理券番号の形式チェック
  ├ 受付番号の割当（スクリプトロック内で1件ずつ）。同じメールなら同じ番号を再表示
  ├ 制度ごとのタブに記録（スプレッドシートは 10/4 と同じファイル）
  └ 確認メール（今後の流れ） …… Resend／未設定・失敗時は Gmail で代替
```

| ファイル | 役割 |
|---|---|
| `kanrishi-apply/index.html` | 個人（管理士）申込ページ |
| `hospital-apply/index.html` | 医療機関 申込ページ |
| `google-apps-script/apply.gs` | 受付番号の割当・記録・確認メール・到達確認 |
| `scripts/gas-mock/apply.test.js` | モックテスト（`node scripts/gas-mock/apply.test.js`） |

### シートの列

受付番号／確認コード／状態／受付日時／氏名／所属施設／メールアドレス／整理券番号／メール送信／到達状況／メールID／対応メモ

- 先頭7列は 10/4 のタブと同じ並び。担当者通知（[`entry-notify.md`](entry-notify.md)）がそのまま読める
- 「状態」は申込時に `入金待ち`。以降（`入金確認済`・`打ち合わせ済`・`ポータル送付済` など）は**担当者が手で書き換えてよい**（Apps Script は状態列を読まない）
- 確認コードは 10/4 の6タブとも重複しない（10/4 のタブは読み取りのみ）
- 整理券番号は自己申告。10/4 のタブとの照合は担当者がシートで行う

## 本番の設定値（2026-10-08 設定済み）

| 項目 | 値 |
|---|---|
| Apps Script プロジェクト | `entry-apply`（所有者 `info@iha-as.com`）<br>https://script.google.com/d/1rQnHDF5RL1CDLPIAjU6mngp4qddDeKUCg87Ft3LEcyD9kZdc_og4X-1o/edit |
| Web アプリ URL（`APPLY_API_URL`） | https://script.google.com/macros/s/AKfycbzVIljdqtDeU-bQ4310-eqTsp0_8XHuwPAmvQbWA_AciHK9XBchuMnTbSWtSBUqwA/exec |
| メール送信 | Gmail（`info@iha-as.com`）。Resend は未設定 |

clasp で更新する場合：`clasp --user iha push` → `clasp --user iha create-version` → `clasp --user iha create-deployment -i <上記 URL の AKfycb… の部分> -V <版>`（URL は変わらない）

## セットアップ

1. https://script.google.com/create を `info@iha-as.com`（申込シートの編集者）で開き、名前を `entry-apply` にする
2. `コード.gs` を `google-apps-script/apply.gs` の内容で置き換えて保存（**1行目のコメントが「受講・研修お申し込み API」であることを確認**。他のプロジェクトに貼らない）
3. 「プロジェクトの設定」→「"appsscript.json" マニフェスト ファイルをエディタで表示する」をオン → `google-apps-script/appsscript.json` の内容で置換
4. 関数 `setupApply` を実行 → 権限を承認。`申込_管理士`・`申込_医療機関` の2タブが作られる
5. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」（実行ユーザー：自分／アクセス：全員）→ 発行された `/exec` の URL を控える
6. 2ページの `APPLY_API_URL`（`<script>` 先頭）にその URL を設定して main に push
7. Web アプリ URL をブラウザで開き、`"service":"entry-apply"` と `programs.kanrishi`・`programs.hospital` の `ready:true` を確認
8. （任意）Resend を使う場合はスクリプトプロパティに `RESEND_API_KEY`・`MAIL_FROM`・`ASSOCIATION_REPLY_TO` を設定し、`installDeliveryTrigger` を実行（設定値は [`entry-ticket.md`「C」](entry-ticket.md)と同じ）
9. 担当者通知：`entry-notify` プロジェクトの `コード.gs` を `google-apps-script/entry-notify.gs` で置き換えて保存（新しい2タブが監視対象に入る）

`APPLY_API_URL` が空のあいだは、送信ボタンを押すと「受付準備中です」と表示される（入力・確認画面までは動く）。

コードを直したときは「デプロイを管理」→ 鉛筆 → バージョン「新バージョン」で更新する（URL が変わらない）。

## 本番前テスト

1. `/kanrishi-apply/` で送信 → `P-001`＋確認コードが表示され、`申込_管理士` に記録、確認メール（件名【受付番号 P-001】医療AIガバナンス管理士 受講のお申し込み…）が届く
2. 同じメールで再送信 → 同じ番号＋「受付済み」表示、メールは再送されない
3. 整理券番号に `ｋ－００１` → `K-001` として記録される
4. `/hospital-apply/` で送信 → `H-001`、`申込_医療機関` に記録、メールにポータルサイトの案内がある
5. 後片付け：両タブの2行目以降を行ごと削除 → Web アプリ URL で `applied:0` を確認

## 運用

- 照合：**受付番号＋確認コード＋氏名** でシートを検索
- 申込数：Web アプリ URL（`programs.*.applied`）またはエディタで `showCount`
- 受付停止：スクリプトプロパティ `ACCEPTING_KANRISHI`／`ACCEPTING_HOSPITAL`／`ACCEPTING` を `false`（即時反映）
- **タブ名は変えない**（Apps Script と entry-notify がタブを名前で探している）
