-- 004: 名簿(members)をやめたため、不要になった列を削除する。
-- ★先に Edge Functions / 画面のデプロイを済ませてから実行してください(古い関数が members 列を読むため)。
-- 保存済みの名簿は削除され、元に戻せません。
alter table line_groups drop column if exists members;
