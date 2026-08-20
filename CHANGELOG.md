# Changelog

一般社団法人ヘルスケアAI推進協会 公式サイト（[Keeeeei-Soeda/healthcare-shadan-hojin](https://github.com/Keeeeei-Soeda/healthcare-shadan-hojin)）の GitHub コミット履歴をまとめたものです。

公開URL: https://www.iha-as.com/（GitHub Pages 独自ドメイン）

---

## 2026-08-20

### 個人認定セクション新設・イラスト配置
- **日時:** 2026-08-20 頃 (JST)
- `index.html` に個人認定制度セクション（`#individual`）を追加し、理事紹介の直上へ配置
- ヘッダー／フッターナビに「個人認定」導線を追加
- イラスト `images/individual01.png` を配置
- キャッシュ回避用に `index_ver04.html` を追加してデプロイ
- 共有用URL: https://www.iha-as.com/index_ver04.html#individual

---

## 2026-08-04

### 大友達也（会長）紹介文に肩書きを追記
- **日時:** 2026-08-04 16:51 頃 (JST)
- `index.html` / `index_ver02.html` / `index_ver03.html` を更新・追加
- 会長・大友達也の紹介文末尾に「一般社団法人日本レセプト学会理事長、就実大学教授」を追加（大友先生からの指示）
- キャッシュ回避用に `index_ver03.html` を追加してデプロイ
- 共有用URL: https://www.iha-as.com/index_ver03.html#members

### 増田雅史をアドバイザー紹介へ移設・プロフィール全文掲載
- **コミット:** [`6cc80ea`](https://github.com/Keeeeei-Soeda/healthcare-shadan-hojin/commit/6cc80ea)
- **日時:** 2026-08-04 16:15 頃 (JST)
- `index.html` / `index_ver02.html` を更新・追加
- 増田雅史を「理事紹介」から外し、直下に「アドバイザー紹介」（`#advisors`）セクションを新設
- 役職バッジを「アドバイザー」に変更（理事ではない立ち位置を明確化）
- 氏名表記を「増田 雅史（ますだ・まさふみ / MASUDA Masafumi）」に修正（旧: Masashi）
- 本人提供の紹介文を全文掲載（森・濱田松本法律事務所パートナー／立教大学大学院人工知能科学研究科客員教授、経歴・公職・著作）
- キャッシュ消去できないクライアント向けに `index_ver02.html` を追加してデプロイ
- 共有用URL: https://www.iha-as.com/index_ver02.html#advisors

---

## 2026-07-03

### ヘッダー・フッターのメニュー表記変更
- **コミット:** [`3c6cee8`](https://github.com/Keeeeei-Soeda/healthcare-shadan-hojin/commit/3c6cee8)
- **日時:** 2026-07-03 19:00 (JST)
- `index.html` を更新
- ナビゲーションメニューの「スリースター」を「法人評価制度」に変更（ヘッダー・フッター共通）
- リンク先（`#threestar`）およびセクション内容は変更なし

### 理事名の表記修正
- **コミット:** [`904788f`](https://github.com/Keeeeei-Soeda/healthcare-shadan-hojin/commit/904788f)
- **日時:** 2026-07-03 15:24 (JST)
- `index.html` / `CHANGELOG.md` を更新
- 理事紹介の表記を「鈴木 峻平（SUZUKI Shunpei）」から「鈴木 崚平（SUZUKI Ryohei）」に修正

---

## 2026-07-02

### 事業内容・研修内容・選ばれる理由のイラスト9枚を追加
- **コミット:** [`6321adb`](https://github.com/Keeeeei-Soeda/healthcare-shadan-hojin/commit/6321adb)
- **日時:** 2026-07-02 07:37 (JST)

サイト各セクション用のイラストを `images/` に追加。

| ファイル | 用途 |
|---|---|
| `images/business01.png` | 事業内容 — 研修 |
| `images/business02.png` | 事業内容 — 個人認定 |
| `images/business03.png` | 事業内容 — 法人認定（スリースター） |
| `images/content01.png` | 研修内容 — 基礎と、組織で安全に使う土台 |
| `images/content02.png` | 研修内容 — 法律・倫理・情報セキュリティ |
| `images/content03.png` | 研修内容 — 事例で学ぶ、現場での線引き |
| `images/reason01.png` | 選ばれる理由 — 組織全体を評価する独自性 |
| `images/reason02.png` | 選ばれる理由 — 評価から改善まで一気通貫 |
| `images/reason03.png` | 選ばれる理由 — 国際・最新の知見 |

---

## 2026-07-02（夜間）

### 理事紹介用画像の追加
- **コミット:** [`f9a0139`](https://github.com/Keeeeei-Soeda/healthcare-shadan-hojin/commit/f9a0139) / [`d4aee6c`](https://github.com/Keeeeei-Soeda/healthcare-shadan-hojin/commit/d4aee6c) / [`561edfe`](https://github.com/Keeeeei-Soeda/healthcare-shadan-hojin/commit/561edfe)
- **日時:** 2026-07-02 06:46 〜 06:49 (JST)

| ファイル | 内容 |
|---|---|
| `images/member01.png` | 理事紹介 — 大友達也 |
| `images/member02.png` | 理事紹介 — 鈴木崚平 |
| `images/member03.png` | 理事紹介 — 副田渓 |

### `images/` ディレクトリの作成
- **コミット:** [`c9bcab1`](https://github.com/Keeeeei-Soeda/healthcare-shadan-hojin/commit/c9bcab1)
- **日時:** 2026-07-02 06:47 (JST)
- `images/ignore` を追加（空ディレクトリ維持用）

### トップページ — 文字サイズ調整機能の追加
- **コミット:** [`da529fb`](https://github.com/Keeeeei-Soeda/healthcare-shadan-hojin/commit/da529fb)
- **日時:** 2026-07-02 06:41 (JST)
- `index.html` を更新
- CSS 変数 `--tsc` による文字サイズ倍率スケールを追加（確認用パネル付き）
- 事業内容・研修内容・選ばれる理由セクションの画像表示スタイルを調整

### トップページ — 理事紹介セクションの追加
- **コミット:** [`542cad4`](https://github.com/Keeeeei-Soeda/healthcare-shadan-hojin/commit/542cad4)
- **日時:** 2026-07-02 06:15 (JST)
- `index.html` を更新
- 「理事紹介」（`#members`）セクションを追加
- ナビゲーションに理事紹介リンクを追加

### お問い合わせページの追加・トップページ大幅更新
- **コミット:** [`fe10680`](https://github.com/Keeeeei-Soeda/healthcare-shadan-hojin/commit/fe10680)
- **日時:** 2026-07-02 05:47 (JST)

| ファイル | 内容 |
|---|---|
| `contact.html` | お問い合わせフォームページを新規追加 |
| `index.html` | トップページを全面リニューアル |

主な追加セクション:
- ヒーロー
- 協会について（`#about`）
- 事業内容（`#business`）— 3本柱
- 研修内容（`#curriculum`）
- 選ばれる理由（`#why`）
- 認定制度の流れ（`#flow`）
- お問い合わせ CTA（`#contact`）

### 初版トップページのアーカイブ
- **コミット:** [`c15b592`](https://github.com/Keeeeei-Soeda/healthcare-shadan-hojin/commit/c15b592)
- **日時:** 2026-07-02 05:47 (JST)
- `index.html` → `index_ver01.html` にリネーム（旧版を保存）

---

## 2026-06-26

### 初回公開
- **コミット:** [`c1e24b7`](https://github.com/Keeeeei-Soeda/healthcare-shadan-hojin/commit/c1e24b7)
- **日時:** 2026-06-26 00:39 (JST)

| ファイル | 内容 |
|---|---|
| `index.html` | トップページ初稿 |
| `README.md` | セットアップ・編集手順 |

---

## リポジトリ構成（最新）

```
.
├── index.html          … トップページ本体
├── index_ver01.html    … 初版トップページ（アーカイブ）
├── contact.html        … お問い合わせページ
├── README.md
├── CHANGELOG.md
└── images/
    ├── business01.png  … business03.png  （事業内容イラスト）
    ├── content01.png   … content03.png   （研修内容イラスト）
    ├── reason01.png    … reason03.png    （選ばれる理由イラスト）
    └── member01.png    … member03.png    （理事紹介写真）
```
