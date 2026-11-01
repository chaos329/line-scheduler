# 日程調整 × LINE グループ通知

候補日時を作って LINE グループに回答リンクを送り、全員の回答が集まったら幹事が確定 → 確定内容を LINE に通知するシステムです。
構成は Supabase(PostgreSQL + Edge Functions)+ 静的フロント(`web/index.html`)。

```
line-scheduler/
├─ .github/workflows/deploy.yml       push で Functions + 画面を自動デプロイ
├─ schema.sql                         DBスキーマ(RLS付き)
├─ supabase/config.toml               line-webhook の JWT 検証オフ設定
├─ supabase/functions/
│  ├─ _shared/line.ts                 LINE送信ヘルパー
│  ├─ line-webhook/                   グループIDの登録(Botの参加時・「登録」発言時)
│  ├─ schedule-api/                   作成・回答・確定 + LINE通知
│  └─ remind/                         回答期限24時間前のリマインド
├─ web/index.html                     画面(作成・回答・確定)
└─ web/config.example.js              画面の設定ひな形(config.js は gitignore)
```

## セットアップ

### 1. Supabase(新規プロジェクト)
1. 新しいプロジェクトを作成(ARMASとは別プロジェクトを推奨)。
2. SQL Editor で `schema.sql` を実行。
3. Project Settings → API から `Project URL` と `anon key` を控える。

### 2. LINE
1. [LINE Developers](https://developers.line.biz/) で Messaging API チャネルを作成。
2. 「Channel secret」と、Messaging API タブの「Channel access token(long-lived)」を発行して控える。
3. 「グループトークへの参加を許可」を **ON**、「応答メッセージ」「あいさつメッセージ」は **OFF** にする。
4. Webhook URL に `https://<PROJECT_REF>.supabase.co/functions/v1/line-webhook` を設定し、Webhook を ON(手順3のデプロイ後に「検証」ボタンで確認)。

### 3. GitHub に push して自動デプロイ
`main` への push で、GitHub Actions(`.github/workflows/deploy.yml`)が Edge Functions と画面(GitHub Pages)をデプロイします。

**3-1. リポジトリ作成と push**
```bash
git remote add origin git@github.com:<ユーザー名>/<リポジトリ名>.git
git push -u origin main
```

**3-2. GitHub の設定(Settings)**
- Settings → Pages → Build and deployment の Source を **GitHub Actions** にする
- Settings → Secrets and variables → Actions
  - Secrets: `SUPABASE_ACCESS_TOKEN`([アカウントのトークン](https://supabase.com/dashboard/account/tokens))、`SUPABASE_PROJECT_REF`
  - Variables: `SUPABASE_URL`、`SUPABASE_ANON_KEY`(anon キーのみ。service_role は入れない)

**3-3. LINE のキーを Supabase に登録(最初の1回だけ・手元で実行)**
```bash
supabase login
supabase link --project-ref <PROJECT_REF>
supabase secrets set \
  LINE_CHANNEL_SECRET=xxxx \
  LINE_CHANNEL_ACCESS_TOKEN=xxxx \
  APP_URL=https://<ユーザー名>.github.io/<リポジトリ名>
```
LINE のキーはリポジトリには置かず、Supabase 側の secrets にだけ保存します。

**3-4. デプロイ確認**
Actions タブで `Deploy` が成功すれば完了です。`line-webhook` の JWT 検証オフは `supabase/config.toml` で設定済みです。

> 無料の GitHub では、GitHub Pages は **public リポジトリのみ**です。private にしたい場合は、Cloudflare Pages / Vercel / Netlify などに `web/` を配置してください(その場合 `config.js` を各サービスのビルド設定で生成します)。

### 4. ローカルで画面を確認する
```bash
cp web/config.example.js web/config.js   # 値を編集(config.js は gitignore 済み)
npx serve web
```

### 5. 通知先グループの登録
LINE Bot を対象グループに招待すると自動で登録されます(すでに参加済みの場合はグループで「登録」と発言)。
登録済みグループは画面の「通知するLINEグループ」に選択肢として表示されます。

### 6. リマインドの定期実行
Supabase で `pg_cron` と `pg_net` を有効化し、`schema.sql` 末尾のコメントアウトされた `cron.schedule` を、プロジェクト値に置き換えて実行してください(毎時実行、各イベント1回のみ通知)。

## 使い方
1. 画面でイベント名・候補日時・通知先グループを入力 → 「作成してLINEに通知する」。
2. グループに届いたリンクから、各メンバーが名前を入力して ○△× を回答(再回答で上書き)。
3. 幹事は作成したブラウザ(または表示される幹事用リンク)で「この日で確定する」→ 確定内容がLINEに通知されます。

## 仕様メモ・注意点
- 認証なしのリンク共有型です。イベントIDは推測困難なUUIDですが、リンクを知っている人は回答できます。回答の名前は自己申告です。
- 幹事用リンク(`&a=...` 付き)は確定権限を持つので、グループには共有しないでください。
- 書き込みはすべて Edge Function(service role)経由で、anon キーからは読み取りのみ可能です。幹事トークン(`event_secrets`)は anon から読めません。
- LINE の push メッセージは無料プランだと月間の送信数に上限があります。グループへの push は受信者の人数分カウントされる点に注意してください。
- 日時は JST 表示です。
