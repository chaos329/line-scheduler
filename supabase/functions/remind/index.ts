// リマインド: 回答期限まで24時間を切った未確定イベントについて、現在の回答状況をLINEグループへ通知(1回のみ)。
// pg_cron から毎時呼び出す想定(schema.sql 末尾を参照)。
import { db } from "../_shared/db.ts";
import { fmt, pushText } from "../_shared/line.ts";

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

  for (const ev of events ?? []) {
    const { data: rs } = await db.from("responses").select("name").eq("event_id", ev.id);
    const names = [...new Set((rs ?? []).map((r) => r.name))];
    const text = [
      `⏰ 回答期限が近づいています`, `「${ev.title}」`, `期限: ${fmt(ev.deadline)}`,
      names.length ? `回答済み(${names.length}人): ${names.join("、")}` : "まだ誰も回答していません",
      "", "未回答の方はこちらから👇", `${APP_URL}/?e=${ev.id}`,
    ].join("\n");
    await pushText(ev.group_id, text);
    await db.from("events").update({ reminded: true }).eq("id", ev.id);
  }
  return new Response(JSON.stringify({ reminded: events?.length ?? 0 }), {
    headers: { "Content-Type": "application/json" },
  });
});
