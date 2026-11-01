// LINE Webhook: Botがグループに参加したとき / 「登録」と発言されたときに、グループIDをDBへ保存する。
// デプロイ時は --no-verify-jwt が必要(LINEはJWTを送らないため)。署名はここで検証する。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { groupName, replyText } from "../_shared/line.ts";

const SECRET = Deno.env.get("LINE_CHANNEL_SECRET")!;
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function validSignature(body: string, signature: string | null) {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(mac))) === signature;
}

async function register(groupId: string, replyToken: string) {
  const name = await groupName(groupId);
  await db.from("line_groups").upsert({ id: groupId, name });
  await replyText(replyToken, `このグループ${name ? `「${name}」` : ""}を日程調整の通知先として登録しました。`);
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
    if (ev.type === "message" && ev.message?.type === "text" && ev.message.text.trim() === "登録") {
      await register(groupId, ev.replyToken);
    }
  }
  return new Response("ok");
});
