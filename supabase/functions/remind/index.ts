// リマインド: 回答期限まで24時間を切った未確定イベントについて、現在の回答状況をLINEグループへ通知(1回のみ)。
// すでに「全員回答済み」を幹事へ通知したイベントには送らない。
// pg_cron から毎時呼び出す想定(schema.sql 末尾を参照)。
import { db } from "../_shared/db.ts";
import { pushText } from "../_shared/line.ts";
import { remindMessage } from "../_shared/messages.ts";

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
    // 全員回答済みなら催促は不要
    if (ev.completed_notified) {
      await db.from("events").update({ reminded: true }).eq("id", ev.id);
      continue;
    }
    const { data: rs } = await db.from("responses").select("name").eq("event_id", ev.id);
    const names = [...new Set((rs ?? []).map((r) => r.name))];
    await pushText(ev.group_id, remindMessage({
      title: ev.title, deadline: ev.deadline, names, url: `${APP_URL}/?e=${ev.id}`,
    }));
    await db.from("events").update({ reminded: true }).eq("id", ev.id);
    reminded++;
  }
  return new Response(JSON.stringify({ reminded }), { headers: { "Content-Type": "application/json" } });
});
