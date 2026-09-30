# 10/4 会場参加用ウェイティングリスト（entry-live/・kanrishi-live/）

会場で**投影する QR コード**から開く、会場参加用ウェイティングリストの登録ページ。会場で**配布する資料**の QR コード（整理券：`entry/`・`kanrishi/`、[`entry-ticket.md`](entry-ticket.md)）とは入口・Apps Script・記録タブを分ける。

| | 会場配布用（整理券） | 会場投影用（本書） |
|---|---|---|
| 病院向けAI研修 | `https://www.iha-as.com/entry/` | `https://www.iha-as.com/entry-live/` |
| 医療AIガバナンス管理士 | `https://www.iha-as.com/kanrishi/` | `https://www.iha-as.com/kanrishi-live/` |
| 受付内容 | 整理券（50枠）→ 定員後はキャンセル待ち | **ウェイティングリストのみ**（整理券は発行しない） |
| 完了画面 | 整理番号＋確認コード | 「会場参加用ウェイティングリスト N番目」＋確認コード |
| Apps Script | `entry-ticket.gs`（プロジェクト `entry-ticket`） | `entry-waitlist.gs`（プロジェクト `entry-waitlist`・別 URL） |
| 記録タブ | `1004_整理券` など4タブ | `1004_投影_病院向け_ウェイティング`／`1004_投影_管理士_ウェイティング` |

スプレッドシートのファイルは共通（`190L3DfU…`）。タブだけを分ける。

## 構成

```
[投影QR：病院向け]                 [投影QR：管理士]
        │                                 │
        ▼                                 ▼
/entry-live/（program: hospital）   /kanrishi-live/（program: kanrishi）  … GitHub Pages
  1. 入力 → 2. 確認（メールを大きく表示）→ 3. 受付順＋確認コード
        │ POST（JSON / text/plain）        │
        └───────────────┬────────────────┘
                        ▼
Apps Script Web アプリ（entry-waitlist.gs）… entry-ticket とは別 URL
  ├ メール形式・打ち間違いドメイン・実在チェック
  ├ 受付順の登録（スクリプトロック内で1件ずつ）
  ├ 制度ごとのタブに記録
  └ 確認メール送信 …… Resend／未設定・失敗時は Gmail で代替
```

| ファイル | 役割 |
|---|---|
| `entry-live/index.html` | 病院向け 登録ページ（noindex・サイト内リンクなし） |
| `kanrishi-live/index.html` | 管理士 登録ページ（同上） |
| `google-apps-script/entry-waitlist.gs` | 受付順の登録・記録・メール送信・到達確認 |
| `google-apps-script/appsscript.json` | マニフェスト（`entry-ticket` と共通の内容） |

## 仕様

- 受付順：制度ごとの通し番号（1, 2, 3…）。上限なし（`PROGRAMS.*.waitLimit` で設定可）
- 確認コード：英数字4文字。**会場配布用の4タブとも重複しない**（配布用タブは読み取りのみ・書き込まない）
- 同じメールアドレスで再送信 → 同じ受付順・確認コードを再表示。確認メールは再送しない
- 会場配布用で整理券を持っている人も区別せず登録する（配布用と投影用は独立）
- 同じ人が両制度の投影用に登録できる（それぞれ別の受付順）
- メール形式・打ち間違いドメイン（`gmial.com` 等）・ドメイン実在チェックは会場配布用と同じ
- タブが無い（`setupWaitlist` 未実行）ときは「受付準備中です」を返す
- 受付停止：`ACCEPTING`（全体）／`ACCEPTING_HOSPITAL`／`ACCEPTING_KANRISHI` = `false`

### シートの列（2タブ共通）

受付順／確認コード／状態（待機中）／受付日時／氏名／所属施設／メールアドレス／メール送信／到達状況／メールID／対応メモ（手入力用）

会場配布用のキャンセル待ちタブと同じ並び。

---

## セットアップ

### A. Apps Script（新規プロジェクト `entry-waitlist`）

`entry-ticket` とは**別のプロジェクト**を作る（同じプロジェクトに入れると `doPost` が衝突する）。

1. スプレッドシート（`190L3DfU…`）を編集できる協会アカウントで https://script.google.com →「新しいプロジェクト」→ 名前 `entry-waitlist`
2. `コード.gs` を `google-apps-script/entry-waitlist.gs` の内容で置き換えて保存
3. 「プロジェクトの設定」→「"appsscript.json" マニフェスト ファイルをエディタで表示する」をオン → `appsscript.json` を `google-apps-script/appsscript.json` の内容で置換して保存
4. 関数 `setupWaitlist` を実行 → 権限を承認
   - `1004_投影_病院向け_ウェイティング` と `1004_投影_管理士_ウェイティング` が作成される（会場配布用のタブは変化なし）

### B. スクリプトプロパティ（Resend 利用時）

`entry-ticket` と同じ値を設定する（プロジェクトごとに設定が必要）。

| プロパティ | 値 |
|---|---|
| `RESEND_API_KEY` | `entry-ticket` と同じ API キー |
| `MAIL_FROM` | `国際ヘルスケアAI管理推進協会 <noreply@iha-as.com>` |
| `ASSOCIATION_REPLY_TO` | 返信先（協会の問い合わせアドレス） |
| `ACCEPTING` ／ `ACCEPTING_HOSPITAL` ／ `ACCEPTING_KANRISHI` | （受付停止時のみ）`false` |

設定後に `installDeliveryTrigger` を1回実行（5分ごとの到達確認を登録）。

> Resend の通数上限（無料 1日100通）は `entry-ticket` と**合算**される（同じアカウント・同じ API キーのため）。

### C. Web アプリとしてデプロイ

1. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
2. 次のユーザーとして実行：**自分** ／ アクセスできるユーザー：**全員**
3. 発行された `https://script.google.com/macros/s/…/exec` を控える
4. その URL をブラウザで開き `{"ok":true,"service":"entry-waitlist",…,"programs":{"hospital":{…,"ready":true},"kanrishi":{…,"ready":true}}}` を確認

> 以後コードを直したら「デプロイを管理」→ 鉛筆 → バージョン「新バージョン」→「デプロイ」（URL を変えない）。

### D. サイト側

`entry-live/index.html` と `kanrishi-live/index.html` の `WAITLIST_API_URL` を C-3 の URL に置き換えて push。

### E. 本番前テスト

1. `/entry-live/` で送信 →「会場参加用ウェイティングリスト 1番目」＋確認コード＋「病院向けAI研修」タグ
2. `1004_投影_病院向け_ウェイティング` に記録／確認メール受信（件名【会場参加用ウェイティングリスト 1番目】病院向けAI研修…）
3. 同じメールで再送信 → 同じ受付順＋「登録済み」、メールは再送されない
4. `/kanrishi-live/` で送信 → 「医療AIガバナンス管理士」タグ、`1004_投影_管理士_ウェイティング` に記録
5. `test@gmial.com` →「@gmail.com の誤りではありませんか？」
6. 会場配布用（`/entry/`・`/kanrishi/`）の件数が変わっていないこと（Web アプリ URL の `programs` で確認）
7. **後片付け**：投影用2タブの2行目以降を行削除 → 投影用 Web アプリ URL で両制度 `registered:0`

---

## 当日運用

- 投影スライドの QR コード：病院向け `https://www.iha-as.com/entry-live/`、管理士 `https://www.iha-as.com/kanrishi-live/`（**制度名を明記**。配布資料の QR とは URL が違う）
- 受付での照合：受付順＋確認コード＋氏名を投影用タブで確認（確認コードは配布用とも重複しないので、Ctrl+F で全タブ検索しても1件に絞れる）
- 登録数の確認：エディタで `showRemaining`、または投影用 Web アプリ URL（`programs.*.registered`）
- 受付停止：`ACCEPTING_HOSPITAL`／`ACCEPTING_KANRISHI`／`ACCEPTING` = `false`（即時反映）

## イベント終了後
- `ACCEPTING` = `false` で受付停止、`removeDeliveryTrigger` を実行
- `entry-live/`・`kanrishi-live/` はリンクされていない noindex ページ。不要になれば削除
