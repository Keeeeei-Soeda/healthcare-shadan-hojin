# お問い合わせ → Google スプレッドシート自動同期

GitHub Pages（静的サイト）のまま、問い合わせ内容を Google スプレッドシートに自動記録する仕組みです。  
Formspree（メール通知）に加えて、**Google Apps Script** を Web API として使います。

```
contact.html → Formspree（協会宛て通知メール）
            → Apps Script
                 ├─ スプレッドシート追記
                 ├─ 送信者への自動返信
                 └─ 協会宛ての整理済み通知メール（Formspree の保険・複数宛先可）
```

VPS や有料連携サービスは不要です。

---

## 1. スプレッドシートを用意

1. Google ドライブでスプレッドシートを用意  
   [国際ヘルスケアAI推進機構_プロジェクトファイル](https://docs.google.com/spreadsheets/d/190L3DfU8S-xpa9-EEyv0FgkUQ8vD6fEgL0lt2rbcVfc/edit)
2. スプレッドシート ID（設定済み）: `190L3DfU8S-xpa9-EEyv0FgkUQ8vD6fEgL0lt2rbcVfc`

書き込み先シート名は **`contact_form`** です（既存タブを使用。ヘッダー行がない場合は初回送信時に自動追加されます）。

---

## 2. Apps Script をデプロイ

**GAS 編集画面（ブックマーク用）:**  
https://script.google.com/home/projects/12x7yEys49M6TYArRk0NdSdVQy0ES0_Fr4CNMsXtt8QMYmOJiMFfDG_mr/edit

（スプレッドシート → **拡張機能** → **Apps Script** からも同じプロジェクトを開けます）

1. 上記の編集画面を開く（またはスプレッドシートから Apps Script を開く）
2. `google-apps-script/contact-to-sheet.gs` の内容を貼り付け
3. `SPREADSHEET_ID` は `190L3DfU8S-xpa9-EEyv0FgkUQ8vD6fEgL0lt2rbcVfc`、`SHEET_NAME` は `contact_form`（設定済み）
4. **プロジェクトの設定** → **スクリプト プロパティ** に追加（任意）  
   | プロパティ | 値 |
   |---|---|
   | `SHEET_SYNC_TOKEN` | 任意の長いランダム文字列（例: `k8xP2mQ9...`） |
   | `ASSOCIATION_REPLY_TO` | 自動返信メールの Reply-To（例: 協会の問い合わせ先メール） |
   | `ASSOCIATION_NOTIFY_TO` | 協会宛通知の宛先（複数可・カンマ区切り）。例: `info@iha-ac.com, other@example.com` |
5. 初回または更新後、**メール送信権限を承認**する（重要）
   1. 関数一覧から **`authorizeMail`** を選ぶ（`doGet` ではない）
   2. **実行** を押す
   3. 「権限を確認」→ Google アカウント選択
   4. 「詳細」→「〇〇（安全ではないページ）に移動」→ **許可**
   5. 実行ログに `MailApp 権限OK` が出れば成功
6. **デプロイ** → **デプロイを管理** → 既存ウェブアプリを編集 → **新バージョン** → デプロイ
7. 発行された **Web アプリ URL**（`https://script.google.com/macros/s/.../exec`）を控える

> **重要:** スクリプトを更新したら、必ず既存デプロイを **新バージョン** で更新してください。編集だけでは Web アプリの動作は変わりません。  
> `doGet` だけではメール権限の承認ダイアログは出ません。必ず `authorizeMail` を実行してください。

未設定時の協会宛通知先フォールバックはコード内 `ASSOCIATION_NOTIFY_TO_FALLBACK`（既定: `info@iha-ac.com`）です。複数宛先にする場合はスクリプトプロパティ `ASSOCIATION_NOTIFY_TO` を設定してください。

---

## 自動返信メールについて

Formspree 無料プランには送信者への自動返信がありません。  
そのため **Apps Script の `MailApp`** で、問い合わせ者宛ての受付確認メールを送ります。

- 送信元: Apps Script をデプロイした Google アカウント
- 送信先: フォームに入力されたメールアドレス
- スプレッドシートの **「自動返信」列** に `送信済` / `送信失敗: ...` を記録

初回は Apps Script エディタで `sendAutoReply_` 実行時に **メール送信の権限承認** が必要です。

---

## 協会宛通知メール（Formspree の保険）

シート追記時に、問い合わせ内容を整理した通知メールを協会宛てへ送ります。

- 送信先: `ASSOCIATION_NOTIFY_TO`（複数可）または `ASSOCIATION_NOTIFY_TO_FALLBACK`
- 件名例: `【お問い合わせ通知】研修について / 山田太郎`
- 本文: 受付日時・氏名・所属・メール・電話・種別・内容・同意 を表形式で整理
- Reply-To: 問い合わせ者のメール（そのまま返信可能）
- スプレッドシートの **「協会通知」列** に結果を記録

Formspree 通知と二重になる想定です（保険）。どちらか一方に寄せたい場合は、Formspree 側の通知設定か本機能のどちらかを止めてください。

---

## 3. contact.html に URL を設定

`contact.html` 内の以下を編集して GitHub に push します。

```javascript
const SHEET_SYNC_URL = 'https://script.google.com/macros/s/xxxxx/exec';
const SHEET_SYNC_TOKEN = '手順2で設定したトークン';
```

- `SHEET_SYNC_URL` が空のときは同期をスキップ（Formspree のみ）
- スプレッドシート同期に失敗しても、Formspree 送信が成功していればユーザーには完了画面を表示

---

## 4. 動作確認

1. サイトのお問い合わせフォームからテスト送信
2. Formspree にメールが届くこと
3. スプレッドシートの `contact_form` シートに1行追加されること
4. 問い合わせ者のメールアドレスに **自動返信** が届くこと
5. シートの「自動返信」列が `送信済` になること
6. 協会宛通知メールが指定アドレスに届くこと（件名・表形式の本文を確認）
7. シートの「協会通知」列が `送信済 (N件)` になること

Apps Script の **実行数** ログでエラーがないかも確認してください。

---

## 記録される列

| 列 | 内容 |
|---|---|
| 受付日時 | JST |
| お名前 | |
| 法人名・所属 | |
| メールアドレス | |
| 電話番号 | |
| お問い合わせ種別 | |
| お問い合わせ内容 | |
| 個人情報同意 | |
| 自動返信 | `送信済` / `送信失敗: ...` など |
| 協会通知 | `送信済 (N件)` / `送信失敗: ...` / `宛先未設定` など |

---

## セキュリティについて

- 同期用トークンは `contact.html` にも書くため、完全な秘匿にはなりません
- Apps Script 側で **同一メールアドレスから1時間に5件以上** は拒否する簡易レート制限を入れています
- 問い合わせ量が増えた場合は reCAPTCHA 等の追加を検討してください

---

## トラブルシューティング

| 症状 | 確認ポイント |
|---|---|
| シートに行が増えない | `SHEET_SYNC_URL` / `SPREADSHEET_ID` / デプロイ URL が最新か |
| Unauthorized | `SHEET_SYNC_TOKEN` が HTML と Script プロパティで一致しているか |
| CORS エラー | デプロイのアクセスが「全員」になっているか。HTML 側は `Content-Type: text/plain` で送信（実装済み） |
| スクリプト更新が反映されない | Apps Script で **新しいデプロイ** を作成（バージョン管理） |
| 自動返信が届かない | Apps Script の実行ログを確認。メール送信権限を許可したか。迷惑メールフォルダを確認 |
| 自動返信列が `送信失敗` | 実行ログのエラー内容を確認（Gmail 送信上限、権限未承認など） |
| 協会宛通知が届かない | `ASSOCIATION_NOTIFY_TO`（または FALLBACK）が正しいか。迷惑メールフォルダを確認 |
| 協会通知列が `宛先未設定` | 有効なメールアドレスが1件も解決できていない |
