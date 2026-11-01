// 日程調整API: イベント作成 / 回答 / 確定。書き込みはすべてここ(service role)経由。
// 作成・確定時にLINEグループへ通知する。
import { db } from "../_shared/db.ts";
import { fmt, pushText } from "../_shared/line.ts";

const APP_URL = Deno.env.get("APP_URL")!; // フロントのURL(例: https://xxx.vercel.app)

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

// グループ専用トークン → グループ(トークンが違えば null)
async function groupByToken(token: unknown) {
  if (typeof token !== "string" || token.length < 32) return null;
  const { data } = await db.from("line_groups").select("id,name").eq("create_token", token).maybeSingle();
  return data;
}

async function getGroup(p: any) {
  const g = await groupByToken(p.create_token);
  return g ? json({ name: g.name }) : json({ error: "このURLは無効です。LINEグループで「登録」と発言して、専用URLを確認してください" }, 404);
}

// group_id は返さない。イベントIDを知っている人だけが読める
async function getEvent(p: any) {
  const { data: event } = await db.from("events")
    .select("id,title,description,organizer,deadline,status,confirmed_candidate_id")
    .eq("id", p.event_id).maybeSingle();
  if (!event) return json({ error: "イベントが見つかりません" }, 404);
  const [{ data: candidates }, { data: responses }] = await Promise.all([
    db.from("candidates").select("id,event_id,starts_at").eq("event_id", p.event_id).order("starts_at"),
    db.from("responses").select("candidate_id,name,answer").eq("event_id", p.event_id),
  ]);
  return json({ event, candidates, responses });
}

async function createEvent(p: any) {
  const { title, description, organizer, deadline, candidates } = p;
  const group = await groupByToken(p.create_token);
  if (!group) return json({ error: "このURLは無効です。LINEグループで「登録」と発言して、専用URLを確認してください" }, 403);
  const group_id = group.id;
  if (!title || !organizer || !Array.isArray(candidates) || candidates.length === 0) {
    return json({ error: "タイトル・幹事名・候補日時は必須です" }, 400);
  }
  const { data: ev, error } = await db.from("events")
    .insert({ title, description, organizer, group_id, deadline: deadline || null })
    .select().single();
  if (error) return json({ error: error.message }, 400);

  const admin_token = crypto.randomUUID();
  await db.from("event_secrets").insert({ event_id: ev.id, admin_token });
  await db.from("candidates").insert(candidates.map((c: string) => ({ event_id: ev.id, starts_at: c })));

  const lines = [
    `📅 日程調整が始まりました`, `「${title}」(幹事: ${organizer})`, "",
    "候補:", ...candidates.map((c: string) => `・${fmt(c)}`), "",
    deadline ? `回答期限: ${fmt(deadline)}` : "", `回答はこちら👇`, `${APP_URL}/?e=${ev.id}`,
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "");
  await pushText(group_id, lines.join("\n"));

  return json({ event_id: ev.id, admin_token });
}

async function respond(p: any) {
  const { event_id, name, answers } = p; // answers: { [candidate_id]: 0|1|2 }
  if (!event_id || !name?.trim() || !answers) return json({ error: "名前と回答は必須です" }, 400);
  const { data: ev } = await db.from("events").select("status").eq("id", event_id).single();
  if (!ev) return json({ error: "イベントが見つかりません" }, 404);
  if (ev.status === "confirmed") return json({ error: "この日程はすでに確定しています" }, 409);

  const rows = Object.entries(answers).map(([candidate_id, answer]) => ({
    event_id, candidate_id, name: name.trim(), answer, updated_at: new Date().toISOString(),
  }));
  const { error } = await db.from("responses").upsert(rows, { onConflict: "candidate_id,name" });
  return error ? json({ error: error.message }, 400) : json({ ok: true });
}

async function confirm(p: any) {
  const { event_id, admin_token, candidate_id } = p;
  const { data: sec } = await db.from("event_secrets").select("admin_token").eq("event_id", event_id).single();
  if (!sec || sec.admin_token !== admin_token) return json({ error: "権限がありません" }, 403);

  const { data: cand } = await db.from("candidates").select("starts_at").eq("id", candidate_id).eq("event_id", event_id).single();
  if (!cand) return json({ error: "候補が見つかりません" }, 404);
  const { data: ev } = await db.from("events")
    .update({ status: "confirmed", confirmed_candidate_id: candidate_id })
    .eq("id", event_id).select().single();

  const { data: rs } = await db.from("responses").select("name,answer").eq("candidate_id", candidate_id);
  const ok = (rs ?? []).filter((r) => r.answer === 2).map((r) => r.name);
  const maybe = (rs ?? []).filter((r) => r.answer === 1).map((r) => r.name);
  const text = [
    `✅ 日程が確定しました`, `「${ev.title}」`, `日時: ${fmt(cand.starts_at)}`,
    ok.length ? `○ ${ok.join("、")}` : "", maybe.length ? `△ ${maybe.join("、")}` : "",
    "", `${APP_URL}/?e=${event_id}`,
  ].filter(Boolean).join("\n");
  await pushText(ev.group_id, text);
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const p = await req.json();
    if (p.action === "get_group") return await getGroup(p);
    if (p.action === "get_event") return await getEvent(p);
    if (p.action === "create_event") return await createEvent(p);
    if (p.action === "respond") return await respond(p);
    if (p.action === "confirm") return await confirm(p);
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
