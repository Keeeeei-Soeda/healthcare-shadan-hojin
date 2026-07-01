# プロジェクト概要 — ヘルスケアAI推進協会 公式サイト制作

## 基本情報

| 項目 | 内容 |
|---|---|
| 案件名 | 一般社団法人 国際ヘルスケアAI推進協会 公式サイト制作 |
| クライアント | 一般社団法人 国際ヘルスケアAI推進協会 |
| 窓口 | 鈴木崚平 氏 |
| 制作担当 | 副田渓 |
| 公開日 | 2026年7月2日（GitHub Pages 公開済み） |
| ステータス | トップページ・お問い合わせページ 公開中 |

## 目的・背景

協会の立ち上げに合わせ、トップページおよびお問い合わせ導線を公開する。
協会の信頼性を伝えつつ、セミナー・研修・認定制度への問い合わせ導線を確保することが狙い。

協会のミッションは、日本の医療における **AIの使い方・コンプライアンス・DX推進** の支援。

## スコープ（対応範囲）

- トップページのデザイン・コーディング（単一HTML / CSS / JavaScript）
- お問い合わせページ（`contact.html`）
- スクロール連動アニメーション等の実装
- GitHub Pages での公開セットアップ
- セクション用イラスト（事業内容・研修内容・選ばれる理由）
- サーバー・ドメイン契約のサポート（**社団名義での契約を推奨**、詳細は現地で確定）

## 掲載コンテンツ構成

ヒーロー → 協会について → 事業内容（3本柱）→ スリースター → 研修内容 → 理事紹介 → 選ばれる理由 → 認定制度の流れ → お問い合わせ → 法人概要（フッター）

事業内容の3本柱:
1. セミナー開催
2. オンライン認定書発行
3. 病院組織向けAI訓練・研修（医療事務含む）

## 技術・公開環境

| 項目 | 内容 |
|---|---|
| 構成 | `index.html` / `contact.html`（CSS・JS内包、サーバー不要） |
| ホスティング | GitHub Pages |
| GitHubアカウント | Keeeeei-Soeda |
| リポジトリ名 | `healthcare-shadan-hojin` |
| 公開URL | https://Keeeeei-Soeda.github.io/healthcare-shadan-hojin/ |
| お問い合わせフォーム | [Formspree](https://formspree.io/)（`https://formspree.io/f/xgojnqbg`） |
| フォーム送信方式 | JavaScript（fetch）→ Formspree（メール）＋ Apps Script（スプレッドシート同期） |
| スプレッドシート同期 | Google Apps Script（`docs/google-sheets-sync.md` 参照） |
| 独自ドメイン | 取得後に設定予定 |

## 成果物

| ファイル | 内容 |
|---|---|
| `index.html` | トップページ本体 |
| `contact.html` | お問い合わせページ（Formspree 連携） |
| `index_ver01.html` | 初版トップページ（アーカイブ） |
| `images/` | 事業内容・研修内容・選ばれる理由・理事紹介用画像 |
| `README.md` | セットアップ・編集手順 |
| `CHANGELOG.md` | 更新履歴 |
| `project-overview.md` | 本ファイル（プロジェクト概要） |
| `google-apps-script/contact-to-sheet.gs` | スプレッドシート同期用 Apps Script |
| `docs/google-sheets-sync.md` | スプレッドシート同期セットアップ手順 |

## お問い合わせフォーム（Formspree）

- 送信先エンドポイント: `https://formspree.io/f/xgojnqbg`
- 協会側に通知メールが届く（Formspree ダッシュボードで通知先を設定）
- 送信者への自動返信（控えメール）は無料プランでは非対応（有料プランの Auto Response が必要）
- `_replyto` を JS で設定しているため、協会側から返信する際は問い合わせ者のメールアドレスに返信可能
- 送信完了後は `contact.html?sent=1` で自サイト内の完了メッセージを表示（Formspree 標準ページは経由しない）
- Google スプレッドシートへの自動記録（Apps Script。URL 設定後に有効化）

## スプレッドシート同期

問い合わせ内容をスプレッドシートに自動追記する仕組みを実装済み（有効化には Google 側のセットアップが必要）。

| ファイル | 内容 |
|---|---|
| `google-apps-script/contact-to-sheet.gs` | Apps Script 本体 |
| `docs/google-sheets-sync.md` | セットアップ手順 |

- スプレッドシート: [国際ヘルスケアAI推進機構_プロジェクトファイル](https://docs.google.com/spreadsheets/d/190L3DfU8S-xpa9-EEyv0FgkUQ8vD6fEgL0lt2rbcVfc/edit)（ID: `190L3DfU8S-xpa9-EEyv0FgkUQ8vD6fEgL0lt2rbcVfc`）
- 書き込み先シート: `contact_form`

`contact.html` の `SHEET_SYNC_URL` に Web アプリ URL を設定すると同期が開始されます。未設定の間は Formspree のみ動作します。

## レスポンシブ対応

| ブレークポイント | 内容 |
|---|---|
| 980px 以下 | ヘッダーをハンバーガーメニューに切り替え |
| 900px 以下 | 各セクションを1カラムレイアウトに変更 |

## 残課題・確認事項

- [ ] ロゴ確定（現在は仮アイコン「H/AI」を設置）
- [ ] ヒーローセクションの背景画像差し替え
- [ ] お問い合わせ先メールアドレスの確定（`contact.html` サイドバー・フッター）
- [ ] 法人概要（連絡先メール等）の確定
- [ ] 独自ドメインの取得・DNS設定
- [ ] Google スプレッドシート同期の有効化（Apps Script デプロイ → `SHEET_SYNC_URL` 設定）

## 今後の流れ

1. ~~GitHub へ push → GitHub Pages で公開~~ ✅ 完了
2. 独自ドメイン取得 → DNS / CNAME 設定 → 本番 URL へ切り替え
3. ロゴ・ヒーロー画像・文言の最終確定

---

最終更新: 2026年7月2日
