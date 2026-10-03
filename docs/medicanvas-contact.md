# 10/4 メディキャンバス お問い合わせ（medicanvas/）

メディキャンバス紹介チラシ（会場配布）に載せる QR コードから開く、株式会社メディキャンバスへのお問い合わせページ。協会の申込（[`entry-qr-overview.md`](entry-qr-overview.md)）とは、スプレッドシート・Apps Script・Google アカウントをすべて分ける。

| 項目 | 内容 |
|---|---|
| ページ | `https://www.iha-as.com/medicanvas/`（noindex・サイト内リンクなし） |
| 入力項目 | お名前・ご所属・メールアドレス（必須）／電話番号・ご用件・ご相談内容（任意） |
| ご用件 | 資料請求／開発・導入のご相談／その他 |
| Apps Script | `google-apps-script/medicanvas-contact.gs`（スプレッドシートに紐づけ） |
| Google アカウント | `info@iha-as.com`（シートの所有・デプロイ・メールの差出人） |
| 窓口アドレス | `info@medi-canvas.com`（通知先・返信先） |
| 記録先 | メディキャンバス用スプレッドシートの「問い合わせ」タブ |
| メール | 送信者へ自動返信（返信先は `info@medi-canvas.com`）、`info@medi-canvas.com` へ通知（返信先は問い合わせた方） |
| QR コード | `docs/entry-qr/medicanvas-qr.png`・`.svg` |

## 構成

```
[チラシのQR：メディキャンバス]
        │
        ▼
/medicanvas/ … GitHub Pages
  1. 入力 → 2. 確認（メールを大きく表示）→ 3. 完了
        │ POST（JSON / text/plain）
        ▼
Apps Script Web アプリ（medicanvas-contact.gs）
  ├ 入力チェック（必須・メール形式・おとり欄・同じメールは1時間5件まで）
  ├ 「問い合わせ」タブに1行追記
  └ 自動返信・担当者通知 …… MailApp（差出人 info@iha-as.com、表示名「株式会社メディキャンバス」）
```

## セットアップ

すべて `info@iha-as.com` でログインして行う（他のアカウントと同時にログインしていると取り違えやすいので、プライベートウィンドウを使う）。

1. Google ドライブでスプレッドシートを新規作成（名前の例：`メディキャンバス_お問い合わせ`）。共有設定は「制限付き」のまま
2. シートのメニュー「拡張機能」→「Apps Script」を開き、`コード.gs` を `google-apps-script/medicanvas-contact.gs` の内容で置き換えて保存
3. 関数 `setupContact` を実行 → 権限を承認 →「問い合わせ」タブができる
4. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」。次のユーザーとして実行：**自分**／アクセスできるユーザー：**全員**
5. 発行された `/exec` の URL をブラウザで開き、`{"ok":true,"service":"medicanvas-contact",…,"ready":true}` を確認
6. `medicanvas/index.html` の `CONTACT_API_URL` に URL を設定して push

> 以後コードを直したら「デプロイを管理」→ 鉛筆 → バージョン「新バージョン」→「デプロイ」（URL を変えない）。

### スクリプトプロパティ（任意）

| プロパティ | 値 |
|---|---|
| `NOTIFY_TO` | 通知先（カンマ区切り可）。未設定なら `info@medi-canvas.com` |
| `ACCEPTING` | `false` で受付停止（即時反映） |

## 本番前テスト

1. `/medicanvas/` から送信 → 完了画面
2. 「問い合わせ」タブに1行追加され、「自動返信」「担当者通知」が `送信済`
3. 自動返信（件名【株式会社メディキャンバス】お問い合わせを受け付けました）が届き、差出人が `info@iha-as.com`（表示名「株式会社メディキャンバス」）、返信先が `info@medi-canvas.com`
4. `info@medi-canvas.com` に通知（件名【お問い合わせ通知】…）が届き、返信すると宛先が問い合わせた方になる
5. **後片付け**：テストの行を行ごと削除 → Web アプリ URL で `count:0`
