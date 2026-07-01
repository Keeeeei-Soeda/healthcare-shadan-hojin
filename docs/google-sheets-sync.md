# お問い合わせ → Google スプレッドシート自動同期

GitHub Pages（静的サイト）のまま、問い合わせ内容を Google スプレッドシートに自動記録する仕組みです。  
Formspree（メール通知）に加えて、**Google Apps Script** を Web API として使います。

```
contact.html → Formspree（メール） 
            → Apps Script（スプレッドシート追記）
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

1. スプレッドシート → **拡張機能** → **Apps Script**
2. `google-apps-script/contact-to-sheet.gs` の内容を貼り付け
3. `SPREADSHEET_ID` は `190L3DfU8S-xpa9-EEyv0FgkUQ8vD6fEgL0lt2rbcVfc`、`SHEET_NAME` は `contact_form`（設定済み）
4. **プロジェクトの設定** → **スクリプト プロパティ** に追加（推奨）  
   | プロパティ | 値 |
   |---|---|
   | `SHEET_SYNC_TOKEN` | 任意の長いランダム文字列（例: `k8xP2mQ9...`） |
5. **デプロイ** → **新しいデプロイ**
   - 種類: **ウェブアプリ**
   - 実行ユーザー: **自分**
   - アクセス: **全員**
6. 発行された **Web アプリ URL**（`https://script.google.com/macros/s/.../exec`）を控える

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
