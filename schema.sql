-- 日程調整 × LINE通知 : Supabase (PostgreSQL) スキーマ
-- 新規プロジェクト(ARMASとは別)の SQL Editor で実行してください。

create table line_groups (
  id          text primary key,          -- LINEのgroupId
  name        text,
  created_at  timestamptz not null default now()
);

create table events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  organizer   text not null,
  group_id    text not null references line_groups(id),
  deadline    timestamptz,               -- 回答期限(任意)
  status      text not null default 'open' check (status in ('open','confirmed')),
  confirmed_candidate_id uuid,
  reminded    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- 幹事用トークン。anonからは一切読めない(ポリシーなし)
create table event_secrets (
  event_id    uuid primary key references events(id) on delete cascade,
  admin_token text not null
);

create table candidates (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  starts_at   timestamptz not null,
  label       text
);

-- answer: 2=○ 1=△ 0=×
create table responses (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references events(id) on delete cascade,
  candidate_id uuid not null references candidates(id) on delete cascade,
  name         text not null,
  answer       smallint not null check (answer in (0,1,2)),
  updated_at   timestamptz not null default now(),
  unique (candidate_id, name)
);

create index on candidates(event_id);
create index on responses(event_id);

-- RLS: 読み取りのみ anon に許可。書き込みは Edge Function(service role)経由。
alter table line_groups   enable row level security;
alter table events        enable row level security;
alter table event_secrets enable row level security;
alter table candidates    enable row level security;
alter table responses     enable row level security;

create policy "read groups"     on line_groups for select to anon using (true);
create policy "read events"     on events      for select to anon using (true);
create policy "read candidates" on candidates  for select to anon using (true);
create policy "read responses"  on responses   for select to anon using (true);

-- リマインド用の定期実行(pg_cron + pg_net を有効化した上で、<PROJECT_REF> と <SERVICE_ROLE_KEY> を置換)
-- select cron.schedule('remind-hourly', '0 * * * *', $$
--   select net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/remind',
--     headers := jsonb_build_object('Authorization','Bearer <SERVICE_ROLE_KEY>')
--   );
-- $$);
