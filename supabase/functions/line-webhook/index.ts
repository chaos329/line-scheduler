// LINE Webhook: Botがグループに参加したとき / 「登録」と発言されたときに、グループIDをDBへ保存する。
// デプロイ時は --no-verify-jwt が必要(LINEはJWTを送らないため)。署名はここで検証する。
import { db } from "../_shared/db.ts";
import { groupName, replyText } from "../_shared/line.ts";

const SECRET = Deno.env.get("LINE_CHANNEL_SECRET")!;

async function validSignature(body: string, signature: string | null) {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(mac))) === signature;
}

const APP_URL = Deno.env.get("APP_URL")!;

// 登録済みなら create_token は変わらない(upsert は渡した列だけ更新)
async function register(groupId: string, replyToken: string) {
  const name = await groupName(groupId);
  const { data, error } = await db.from("line_groups").upsert({ id: groupId, name }).select("create_token").single();
  if (error || !data) { await replyText(replyToken, "登録に失敗しました。時間をおいてもう一度お試しください。"); return; }
  await replyText(replyToken, `このグループ${name ? `「${name}」` : ""}を日程調整の通知先として登録しました。\n\n日程調整を作る専用ページはこちらです(このグループ専用です):\n${APP_URL}/?g=${data.create_token}`);
}

// 専用URLが漏れたとき用: トークンを作り直して古いURLを無効にする
async function reissue(groupId: string, replyToken: string) {
  const token = (crypto.randomUUID() + crypto.randomUUID()).replaceAll("-", "");
  const { error } = await db.from("line_groups").update({ create_token: token }).eq("id", groupId);
  if (error) { await replyText(replyToken, "再発行に失敗しました。先に「登録」と発言してから試してください。"); return; }
  await replyText(replyToken, `専用ページのURLを再発行しました。以前のURLは使えなくなります。\n${APP_URL}/?g=${token}`);
}

Deno.serve(async (req) => {
  const body = await req.text();
  if (!(await validSignature(body, req.headers.get("x-line-signature")))) {
    return new Response("invalid signature", { status: 401 });
  }
  for (const ev of JSON.parse(body).events ?? []) {
    const groupId = ev.source?.type === "group" ? ev.source.groupId : null;
    if (!groupId) continue;
    if (ev.type === "join") await register(groupId, ev.replyToken);
    if (ev.type === "message" && ev.message?.type === "text") {
      const text = ev.message.text.trim();
      if (text === "登録") await register(groupId, ev.replyToken);
      if (text === "URL再発行") await reissue(groupId, ev.replyToken);
    }
  }
  return new Response("ok");
});
