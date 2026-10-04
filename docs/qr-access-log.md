# 10/4 QR コード読み取り数の記録（qr-access-log）

QR コードから開く申込ページ5つが開かれた回数を記録する。QR コードの読み取り自体は記録できないため、ページが開かれた回数を「読み取り数の目安」とする。送信件数（各受付用 Web アプリの URL で確認）と比べると、開いたが送信しなかった人の割合が分かる。

| 項目 | 内容 |
|---|---|
| 対象ページ | `entry/`・`kanrishi/`・`entry-live/`・`kanrishi-live/`・`medicanvas/` |
| Apps Script | `google-apps-script/qr-access-log.gs`（記録用スプレッドシートに紐づけ） |
| Google アカウント | `info@iha-as.com` |
| 記録先 | 記録用スプレッドシートの「アクセス記録」タブ |
| 記録する項目 | 日時・ページ・端末（スマホ／タブレット／PC）。個人を特定できる情報は送らない |
| 件数の確認 | Web アプリの URL をブラウザで開く（`counts` にページごとの件数） |

- 受付用の Apps Script（`entry-ticket`・`entry-waitlist`・`medicanvas-contact`）とは独立している。記録が失敗しても申込には影響しない
- 記録は仕組みを入れた後に開かれた分だけ。同じ人が開き直すと、その回数だけ記録される
- テストで開くときは URL の末尾に `?nolog` を付けると記録しない

## セットアップ

1. `info@iha-as.com` で Apps Script のプロジェクトを作る。https://script.google.com/create で単独に作っても、スプレッドシートの「拡張機能」→「Apps Script」から作ってもよい
2. `コード.gs` を `google-apps-script/qr-access-log.gs` の内容で置き換えて保存
3. 関数 `setupAccessLog` を実行 → 権限を承認 →「アクセス記録」タブができる。単独のプロジェクトでは、ドライブに `1004_QRアクセス記録` が新しく作られる（URL は実行ログに出る）
4. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」。次のユーザーとして実行：**自分**／アクセスできるユーザー：**全員**
5. 発行された `/exec` の URL を5ページの `ACCESS_LOG_URL` に設定して push
