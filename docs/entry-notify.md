# 10/4 申込の担当者通知（entry-notify）

協会の申込（[`entry-qr-overview.md`](entry-qr-overview.md)）が入ったら、担当者にメールで知らせる。受付用の Apps Script（`entry-ticket`・`entry-waitlist`）には通知の処理がないため、別のプロジェクトで1分ごとにシートを確認する。

| 項目 | 内容 |
|---|---|
| Apps Script | `google-apps-script/entry-notify.gs`（単独のプロジェクト `entry-notify`） |
| Google アカウント | `info@iha-as.com`（申込シートの編集者） |
| 監視するタブ | 整理券・キャンセル待ち・投影用ウェイティングの6タブ（読み取りのみ） |
| 確認の間隔 | 1分ごと（時間主導トリガー） |
| 通知先 | `info@iha-as.com`（スクリプトプロパティ `NOTIFY_TO` で変更可、カンマ区切り） |
| 通知内容 | 新しい申込の種類・番号・確認コード・受付日時・氏名・所属・メール、6タブの現在の件数 |

- Apps Script が書き込んだ行ではシートの変更トリガー（onChange）が動かないため、時間主導トリガーで確認する
- 通知済みの申込は「番号＋受付日時」をスクリプトプロパティに記録して判定する。テストデータを消して同じ番号で再登録した場合も、受付日時が違うので通知される
- 1分の間に複数の申込があれば、1通にまとめて通知する
- メール送信に失敗したときは通知済みにしないので、次の確認で再送される

## セットアップ

1. `info@iha-as.com` で https://script.google.com/create を開き、名前を `entry-notify` にする
2. `コード.gs` を `google-apps-script/entry-notify.gs` の内容で置き換えて保存
3. 関数 `startNotify` を実行 → 権限を承認。この時点までの申込がまとめて1通で届き、以後1分ごとに確認する

## イベント終了後

関数 `stopNotify` を実行して確認を止める。
