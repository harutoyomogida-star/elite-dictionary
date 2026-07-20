# エリート辞典 — セットアップマニュアル(初心者向け)

このアプリは、ビルド不要のシンプルな構成(HTML / CSS / JS)+ Firebase(データ保存)でできています。
上から順番に進めれば、プログラミング未経験でも公開まで辿り着けるように書いています。

構成ファイル:
```
index.html          画面の骨組み・タブバー
style.css           デザイン(白基調・ダーク/セピア切替対応)
app.js              アプリのロジック本体
firebase-config.js  あなたのFirebaseプロジェクトの接続情報(自分で書き換える)
```

---

## STEP 0. VS Codeで開く・手元で確認する

このZIPを展開して、VS Codeで「フォルダを開く」→ このフォルダ(`elite-dictionary`)を選択してください。
`elite-dictionary.code-workspace` をダブルクリックして開いても同じです。

⚠️ 注意: このアプリは `<script type="module">` を使っているため、`index.html` をダブルクリックして
ブラウザで直接開く(`file://...`)と動きません。ローカルのWebサーバー経由で開く必要があります。

一番簡単な方法:
1. VS Code拡張機能「**Live Server**」をインストール(このフォルダを開くと自動でおすすめが出ます)
2. `index.html` を右クリック →「Open with Live Server」
3. ブラウザが自動で開き、`http://127.0.0.1:5500/` などで動作確認できます

Live Serverを使わない場合は、ターミナルで以下でもOKです(Python3がある場合):
```
python3 -m http.server 5500
```
→ ブラウザで `http://localhost:5500` を開く

---

## STEP 1. Firebaseプロジェクトを作る

1. https://console.firebase.google.com/ を開き、Googleアカウントでログイン
2. 「プロジェクトを追加」をクリック
3. プロジェクト名を入力(例: elite-dictionary)→ 「続行」
4. Googleアナリティクスは「有効にしない」でOK(あとから変更可)
5. 「プロジェクトを作成」→ 数十秒待つ → 「続行」

## STEP 2. ログイン機能(Authentication)を有効にする

1. 左メニューの「構築」→「Authentication」を開く
2. 「始める」をクリック
3. 「Sign-in method」タブ→「メール/パスワード」を選択
4. 一番上のスイッチを「有効」にして「保存」

## STEP 3. データベース(Firestore)を有効にする

1. 左メニュー「構築」→「Firestore Database」を開く
2. 「データベースの作成」
3. ロケーションはそのまま(例: asia-northeast1 など近い場所)→「次へ」
4. 「本番環境モードで開始」を選択 →「作成」
5. 作成できたら「ルール」タブを開き、以下に**丸ごと置き換えて**「公開」を押す:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

→ これで「自分のデータは自分しか読み書きできない」設定になります。

## STEP 4. 画像保存(Storage)を有効にする

1. 左メニュー「構築」→「Storage」を開く
2. 「始める」→ そのまま「次へ」→ ロケーション確認 →「完了」
3. 「Rules」タブを開き、以下に置き換えて「公開」:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

> ※ Storageは無料枠を使うために「お支払い設定(Blazeプラン)」の登録を求められる場合があります。使った分だけ課金される従量制ですが、個人利用の範囲では基本無料枠に収まります。心配な場合は、STEP 4は後回しにして、まずはアイコン・画像機能なしで試すこともできます(その場合、アップロード操作はエラーになります)。

## STEP 5. Webアプリを登録して接続情報を取得する

1. プロジェクトの概要画面(左上の家アイコン)に戻る
2. 「</>」(Webアプリを追加)アイコンをクリック
3. アプリのニックネームを入力(例: elite-dictionary-web)→「アプリを登録」
4. 表示された `firebaseConfig = { apiKey: "...", ... }` の中身をまるごとコピー

## STEP 6. 設定ファイルに貼り付ける

このプロジェクトの `firebase-config.js` を開き、コピーした内容で書き換えます。

```js
export const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "elite-dictionary-xxxx.firebaseapp.com",
  projectId: "elite-dictionary-xxxx",
  storageBucket: "elite-dictionary-xxxx.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:xxxxxxxxxxxx"
};
```

保存すれば設定は完了です。

---

## STEP 7. GitHubにアップロードして公開する(GitHub Pages)

1. GitHubで新しいリポジトリを作成(例: `elite-dictionary`)。Public推奨
2. このフォルダの中身(index.html, style.css, app.js, firebase-config.js)をすべてリポジトリにアップロード
   - GitHubのWeb画面の「Add file → Upload files」でドラッグ&ドロップでもOK
3. リポジトリの「Settings」→ 左メニュー「Pages」を開く
4. 「Source」を `Deploy from a branch` にし、Branchを `main` / `/ (root)` にして「Save」
5. 数分待つと、ページ上部に公開URL(例: `https://ユーザー名.github.io/elite-dictionary/`)が表示されます

これでスマホからもPCからもアクセスできる、自分だけの辞典サイトの完成です。

## STEP 8. 最後にFirebase側で公開URLを許可する

1. Firebaseコンソール →「Authentication」→「Settings」タブ→「承認済みドメイン」
2. 「ドメインを追加」で `ユーザー名.github.io` を追加

これを忘れるとログインが失敗するので注意してください。

---

## 使い方の簡単な説明

- **辞典タブ**: 右下の「＋」で新しい項目を作成。「編集する」で本文・タイトル・アイコン画像・挿入画像を編集し、「保存する」で確定。保存するたびに「変更履歴」に旧バージョンが記録され、クリックすると復元できます。
- **データタブ**: 全項目をJSONファイルとして書き出し(バックアップ)・読み込みができます。
- **アカウントタブ**: メールアドレスで新規登録・ログイン。ログインすると、辞典のデータがFirebase上に保存され、別の端末からログインしても同じ内容が見られます。
- **設定タブ**: テーマ(ライト/ダーク/セピア)と本文フォント(ゴシック/明朝/丸ゴシック)を切り替え。

## 現状の仕様メモ(把握しておくと良い点)

- ログインしていない間は、データは今使っているブラウザの中だけに保存されます(ゲストモード)。ログインすると、それ以降はFirebase側のデータを見るようになります(ゲスト時代のデータは自動移行しません。移す場合はデータタブの書き出し→ログイン後に読み込み、で対応できます)。
- 本文の編集は簡易的な `contenteditable` によるものです。もっと本格的なリッチテキスト編集(太字ボタンなど)が欲しくなったら、そこだけ後で拡張できます。
- これは土台となる一つの実装です。項目数が増えてきたら、一覧のページング機能や全文検索(Algolia等)を足すこともできます。
