-- 002: 回答に備考(例: 19時までなら参加可能)を保存できるようにする。
-- すでに schema.sql を実行済みの環境で、SQL Editor にこのファイルの全文を貼って実行してください。
alter table responses
  add column if not exists note text check (note is null or char_length(note) <= 100);
