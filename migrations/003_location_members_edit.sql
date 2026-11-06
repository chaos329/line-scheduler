-- 003: 開催場所・URL / グループのメンバー名簿 / 全員回答済み通知の管理用フラグ
-- すでに schema.sql を実行済みの環境で、SQL Editor にこのファイルの全文を貼って実行してください。

alter table events
  add column if not exists location text check (location is null or char_length(location) <= 200),
  add column if not exists completed_notified boolean not null default false;

-- 未回答者の名指しリマインド・「全員回答済み」通知に使う名簿(回答時の名前と同じ表記で保存する)
alter table line_groups
  add column if not exists members text[] not null default '{}';
