// 日程調整API: イベント作成 / 取得 / 回答 / 確定 / 編集 / 削除。
// 書き込みはすべてここ(サーバー側キー)経由。必要に応じてLINEグループへ通知する。
import { db } from "../_shared/db.ts";
import { fmt, groupMemberCount, pushText } from "../_shared/line.ts";
import {
  cancelMessage, completeMessage, confirmMessage, startMessage, updateMessage,
} from "../_shared/messages.ts";

const APP_URL = Deno.env.get("APP_URL")!; // フロントのURL(例: https://xxx.github.io/line-scheduler)

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

const INVALID_URL = "このURLは無効です。LINEグループで「登録」と発言して、専用URLを確認してください";
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
// 回答者名の照合用(全角/半角・空白・大文字小文字の違いを無視)
const norm = (s: string) => s.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
const validDate = (v: unknown) => typeof v === "string" && !isNaN(Date.parse(v));

// グループ専用トークン → グループ(トークンが違えば null)
async function groupByToken(token: unknown) {
  if (typeof token !== "string" || token.length < 32) return null;
  const { data } = await db.from("line_groups").select("id,name").eq("create_token", token).maybeSingle();
  return data;
}

async function isAdmin(event_id: unknown, token: unknown) {
  if (typeof event_id !== "string" || typeof token !== "string") return false;
  const { data } = await db.from("event_secrets").select("admin_token").eq("event_id", event_id).maybeSingle();
  return !!data && data.admin_token === token;
}

async function getGroup(p: any) {
  const g = await groupByToken(p.create_token);
  return g ? json({ name: g.name }) : json({ error: INVALID_URL }, 404);
}

// group_id は返さない。イベントIDを知っている人だけが読める
async function getEvent(p: any) {
  const { data } = await db.from("events")
    .select("id,title,description,location,organizer,deadline,status,confirmed_candidate_id")
    .eq("id", p.event_id).maybeSingle();
  if (!data) return json({ error: "イベントが見つかりません" }, 404);
  const event = data;
  const [{ data: candidates }, { data: responses }] = await Promise.all([
    db.from("candidates").select("id,event_id,starts_at").eq("event_id", p.event_id).order("starts_at"),
    db.from("responses").select("candidate_id,name,answer,note").eq("event_id", p.event_id),
  ]);
  return json({ event, candidates, responses });
}

async function createEvent(p: any) {
  const group = await groupByToken(p.create_token);
  if (!group) return json({ error: INVALID_URL }, 403);
  const title = text(p.title, 100), organizer = text(p.organizer, 30);
  const description = text(p.description, 500), location = text(p.location, 200);
  const deadline = validDate(p.deadline) ? p.deadline : null;
  const candidates: string[] = Array.isArray(p.candidates) ? p.candidates.filter(validDate) : [];
  if (!title || !organizer || candidates.length === 0) {
    return json({ error: "タイトル・幹事名・候補日時は必須です" }, 400);
  }
  const { data: ev, error } = await db.from("events")
    .insert({
      title, description: description || null, location: location || null,
      organizer, group_id: group.id, deadline,
    })
    .select().single();
  if (error) return json({ error: error.message }, 400);

  const admin_token = crypto.randomUUID();
  await db.from("event_secrets").insert({ event_id: ev.id, admin_token });
  await db.from("candidates").insert(candidates.map((c) => ({ event_id: ev.id, starts_at: c })));

  await pushText(group.id, startMessage({
    title, organizer, candidates, deadline, location, url: `${APP_URL}/?e=${ev.id}`,
  }));
  return json({ event_id: ev.id, admin_token });
}

// グループの人数(Botを除く)から幹事1人を除いた人数分の回答が揃ったら、幹事宛に1回だけ通知する。
// 幹事は回答していなくてもよい。幹事の名前での回答は人数に数えない。
// グループの人数を取得できないとき、または幹事しかいないグループでは何もしない。
async function notifyIfComplete(ev: any) {
  if (ev.completed_notified) return;
  const [{ data: rs }, { data: cands }] = await Promise.all([
    db.from("responses").select("candidate_id,name,answer").eq("event_id", ev.id),
    db.from("candidates").select("id,starts_at").eq("event_id", ev.id).order("starts_at"),
  ]);
  const org = norm(ev.organizer);
  const responders = new Set((rs ?? []).map((r) => norm(r.name)).filter((n) => n !== org));
  if (responders.size === 0) return;

  const count = await groupMemberCount(ev.group_id);
  if (count === null) return;
  const required = count - 1; // 幹事を除く
  if (required < 1 || responders.size < required) return;

  // 同時回答での二重通知を防ぐため、フラグを先に立てた1回だけが送信する
  const { data: claimed } = await db.from("events")
    .update({ completed_notified: true }).eq("id", ev.id).eq("completed_notified", false).select("id");
  if (!claimed?.length) return;

  const slots = (cands ?? []).map((c) => {
    const list = (rs ?? []).filter((r) => r.candidate_id === c.id);
    return {
      startsAt: c.starts_at,
      ok: list.filter((r) => r.answer === 2).length,
      maybe: list.filter((r) => r.answer === 1).length,
      no: list.filter((r) => r.answer === 0).length,
    };
  });
  await pushText(ev.group_id, completeMessage({
    title: ev.title, organizer: ev.organizer, slots, url: `${APP_URL}/?e=${ev.id}`,
  }));
}

async function respond(p: any) {
  const { event_id, answers } = p; // answers: { [candidate_id]: { answer: 0|1|2, note?: string } }
  const name = text(p.name, 30);
  if (!event_id || !name || !answers) return json({ error: "名前と回答は必須です" }, 400);
  const { data: ev } = await db.from("events")
    .select("id,title,organizer,group_id,status,completed_notified").eq("id", event_id).maybeSingle();
  if (!ev) return json({ error: "イベントが見つかりません" }, 404);
  if (ev.status === "confirmed") return json({ error: "この日程はすでに確定しています" }, 409);

  const rows = Object.entries(answers).map(([candidate_id, a]: [string, any]) => {
    const isObj = typeof a === "object" && a !== null;
    const note = isObj ? text(a.note, 60) : "";
    return {
      event_id, candidate_id, name, answer: isObj ? a.answer : a,
      note: note || null, updated_at: new Date().toISOString(),
    };
  });
  const { error } = await db.from("responses").upsert(rows, { onConflict: "candidate_id,name" });
  if (error) return json({ error: error.message }, 400);

  // 回答の保存は成功済み。通知の失敗で回答がエラー扱いにならないようにする
  try { await notifyIfComplete(ev); } catch (e) { console.error("notifyIfComplete failed", e); }
  return json({ ok: true });
}

async function confirm(p: any) {
  const { event_id, admin_token, candidate_id } = p;
  if (!(await isAdmin(event_id, admin_token))) return json({ error: "権限がありません" }, 403);

  const { data: cand } = await db.from("candidates").select("starts_at").eq("id", candidate_id).eq("event_id", event_id).maybeSingle();
  if (!cand) return json({ error: "候補が見つかりません" }, 404);
  const { data: ev } = await db.from("events")
    .update({ status: "confirmed", confirmed_candidate_id: candidate_id })
    .eq("id", event_id).select().single();

  const { data: rs } = await db.from("responses").select("name,answer,note").eq("candidate_id", candidate_id);
  const ok = (rs ?? []).filter((r) => r.answer === 2).map((r) => ({ name: r.name, note: r.note }));
  const maybe = (rs ?? []).filter((r) => r.answer === 1).map((r) => ({ name: r.name, note: r.note }));
  await pushText(ev.group_id, confirmMessage({
    title: ev.title, startsAt: cand.starts_at, ok, maybe, location: ev.location,
    url: `${APP_URL}/?e=${event_id}`,
  }));
  return json({ ok: true });
}

// 幹事による編集。確定前は候補・期限も変更可、確定後は名称/メモ/場所のみ。
async function updateEvent(p: any) {
  const { event_id } = p;
  if (!(await isAdmin(event_id, p.admin_token))) return json({ error: "権限がありません" }, 403);
  const { data: ev } = await db.from("events").select("*").eq("id", event_id).maybeSingle();
  if (!ev) return json({ error: "イベントが見つかりません" }, 404);

  const confirmed = ev.status === "confirmed";
  const add: string[] = Array.isArray(p.add_candidates) ? p.add_candidates.filter(validDate) : [];
  const remove: string[] = Array.isArray(p.remove_candidate_ids) ? p.remove_candidate_ids : [];
  if (confirmed && (add.length || remove.length || "deadline" in p)) {
    return json({ error: "確定済みのイベントでは、候補日時と回答期限は変更できません" }, 409);
  }

  const patch: Record<string, unknown> = {};
  const lines: string[] = [];

  if ("title" in p) {
    const t = text(p.title, 100);
    if (!t) return json({ error: "イベント名は必須です" }, 400);
    if (t !== ev.title) { patch.title = t; lines.push(`名称を「${t}」に変更いたしました`); }
  }
  if ("description" in p) {
    const d = text(p.description, 500) || null;
    if (d !== (ev.description ?? null)) patch.description = d;
  }
  if ("location" in p) {
    const l = text(p.location, 200) || null;
    if (l !== (ev.location ?? null)) { patch.location = l; lines.push(`場所・URL: ${l ?? "未定"}`); }
  }
  if ("deadline" in p) {
    const dl = validDate(p.deadline) ? new Date(p.deadline).toISOString() : null;
    const cur = ev.deadline ? new Date(ev.deadline).toISOString() : null;
    if (dl !== cur) {
      patch.deadline = dl;
      patch.reminded = false; // 期限が変わったらリマインドをやり直す
      lines.push(`回答期限: ${dl ? fmt(dl) : "なし"}`);
    }
  }

  // 候補日時の追加・取り下げ(取り下げた候補への回答は、DBの連動削除で消える)
  const { data: current } = await db.from("candidates").select("id,starts_at").eq("event_id", event_id);
  const removing = (current ?? []).filter((c) => remove.includes(c.id));
  if (add.length || removing.length) {
    if ((current ?? []).length - removing.length + add.length < 1) {
      return json({ error: "候補日時を1つ以上残してください" }, 400);
    }
    if (removing.length) {
      await db.from("candidates").delete().eq("event_id", event_id).in("id", removing.map((c) => c.id));
      lines.push(`取り下げとなった候補: ${removing.map((c) => fmt(c.starts_at)).join("、")}`);
    }
    if (add.length) {
      await db.from("candidates").insert(add.map((c) => ({ event_id, starts_at: c })));
      lines.push(`追加された候補: ${add.map((c) => fmt(c)).join("、")}`);
    }
  }

  if (Object.keys(patch).length) {
    const { error } = await db.from("events").update(patch).eq("id", event_id);
    if (error) return json({ error: error.message }, 400);
  }

  if (p.notify !== false && lines.length) {
    await pushText(ev.group_id, updateMessage({
      title: (patch.title as string) ?? ev.title, lines, url: `${APP_URL}/?e=${event_id}`,
    }));
  }
  return json({ ok: true });
}

// 幹事による削除(中止)。回答・候補も連動して消え、LINEに中止を通知する。
async function deleteEvent(p: any) {
  const { event_id } = p;
  if (!(await isAdmin(event_id, p.admin_token))) return json({ error: "権限がありません" }, 403);
  const { data: ev } = await db.from("events").select("*").eq("id", event_id).maybeSingle();
  if (!ev) return json({ error: "イベントが見つかりません" }, 404);

  const { error } = await db.from("events").delete().eq("id", event_id);
  if (error) return json({ error: error.message }, 400);

  try {
    await pushText(ev.group_id, cancelMessage({
      title: ev.title, organizer: ev.organizer, wasConfirmed: ev.status === "confirmed",
    }));
  } catch (e) { console.error("cancel notify failed", e); }
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const p = await req.json();
    switch (p.action) {
      case "get_group": return await getGroup(p);
      case "get_event": return await getEvent(p);
      case "create_event": return await createEvent(p);
      case "respond": return await respond(p);
      case "confirm": return await confirm(p);
      case "update_event": return await updateEvent(p);
      case "delete_event": return await deleteEvent(p);
      default: return json({ error: "unknown action" }, 400);
    }
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
