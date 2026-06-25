# 一般社団法人ヘルスケアAI推進協会 — 公式サイト

医療におけるAIの使い方・コンプライアンス・DX推進を支援する一般社団法人ヘルスケアAI推進協会のWebサイト（トップページ）です。

単一の `index.html`（CSS・JS内包）で構成されており、GitHub Pages にそのまま公開できます。

## 公開URL

- GitHub Pages: `https://Keeeeei-Soeda.github.io/healthcare-ai-association/`
- 独自ドメイン: 取得後に設定（下記「独自ドメイン」参照）

## 構成

```
.
├── index.html   … トップページ本体（HTML / CSS / JavaScript すべて内包）
└── README.md
```

## 編集ポイント

- **ヒーロー画像**: `index.html` 内 `.hero` の `background:` にコメント（`/* 画像差し替え */`）あり。`url("画像パス")` を追加して差し替え
- **ロゴ**: `.logo-mark`（仮アイコン「H/AI」）とテキストを差し替え
- **お問い合わせ先**: `mailto:info@example.com` を実アドレスに変更
- **法人概要**: フッターの所在地・連絡先（「準備中」）を更新

## ローカル確認

ブラウザで `index.html` を開くだけ。サーバー不要です。

## GitHub Pages の有効化

1. リポジトリの **Settings → Pages**
2. **Source** を `Deploy from a branch` に設定
3. Branch を `main` / `(root)` に設定して保存
4. 数分後に公開URLが発行されます

## 独自ドメイン

1. ドメイン取得後、DNS で `CNAME` レコードを `Keeeeei-Soeda.github.io` に向ける（apex の場合は A レコード）
2. リポジトリ直下に `CNAME` ファイルを作成し、ドメイン名のみを記載
3. Settings → Pages → Custom domain に入力

---

© 2025 一般社団法人ヘルスケアAI推進協会
