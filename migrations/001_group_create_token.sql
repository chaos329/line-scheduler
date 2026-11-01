-- 001: グループ専用の作成ページ(create_token)を導入し、anon からの全テーブル読み取りを廃止する。
-- すでに schema.sql を実行済みの環境で、SQL Editor にこのファイルの全文を貼って実行してください。

-- 1) グループごとの専用トークン(既存グループにも行ごとに別の値が入る)
alter table line_groups
  add column if not exists create_token text not null unique
  default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

-- 2) anon(画面の公開キー)から直接読めないようにする。読み取りは Edge Function(schedule-api)経由のみ。
drop policy if exists "read groups"     on line_groups;
drop policy if exists "read events"     on events;
drop policy if exists "read candidates" on candidates;
drop policy if exists "read responses"  on responses;
