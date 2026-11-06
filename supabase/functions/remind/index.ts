// リマインド: 回答期限まで24時間を切った未確定イベントについて、回答状況をLINEグループへ通知(1回のみ)。
// グループに名簿が登録されていれば、未回答の方を名指しする。名簿の全員(幹事を除く)が回答済みなら送らない。
// pg_cron から毎時呼び出す想定(schema.sql 末尾を参照)。
import { db } from "../_shared/db.ts";
import { pushText } from "../_shared/line.ts";
import { remindMessage } from "../_shared/messages.ts";
import { requiredCount, unansweredNames } from "../_shared/roster.ts";

const APP_URL = Deno.env.get("APP_URL")!;

Deno.serve(async (req) => {
  // cron からの呼び出しのみ許可(Authorization: Bearer <CRON_SECRET>)
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("Authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const limit = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const { data: events } = await db.from("events").select("*")
    .eq("status", "open").eq("reminded", false)
    .not("deadline", "is", null).lte("deadline", limit).gt("deadline", new Date().toISOString());

  let reminded = 0;
  for (const ev of events ?? []) {
    const [{ data: rs }, { data: g }] = await Promise.all([
      db.from("responses").select("name").eq("event_id", ev.id),
      db.from("line_groups").select("members").eq("id", ev.group_id).maybeSingle(),
    ]);
    const answered = [...new Set((rs ?? []).map((r) => r.name))];
    const members: string[] = g?.members ?? [];
    const hasRoster = requiredCount(members, ev.organizer) > 0;
    const unanswered = hasRoster ? unansweredNames(members, ev.organizer, answered) : undefined;

    // 全員回答済みなら催促は不要(「回答完了」の通知は回答時に送信済み)
    if (hasRoster && unanswered!.length === 0) {
      await db.from("events").update({ reminded: true }).eq("id", ev.id);
      continue;
    }
    await pushText(ev.group_id, remindMessage({
      title: ev.title, deadline: ev.deadline, answered, unanswered, url: `${APP_URL}/?e=${ev.id}`,
    }));
    await db.from("events").update({ reminded: true }).eq("id", ev.id);
    reminded++;
  }
  return new Response(JSON.stringify({ reminded }), { headers: { "Content-Type": "application/json" } });
});
