const TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!;

export async function pushText(to: string, text: string) {
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
  });
  if (!res.ok) throw new Error(`LINE push failed: ${res.status} ${await res.text()}`);
}

export async function replyText(replyToken: string, text: string) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
  });
}

export async function groupName(groupId: string): Promise<string | null> {
  const res = await fetch(`https://api.line.me/v2/bot/group/${groupId}/summary`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  return res.ok ? (await res.json()).groupName ?? null : null;
}

// グループの人数(Bot自身は含まない)。取得できないときは null。
export async function groupMemberCount(groupId: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.line.me/v2/bot/group/${groupId}/members/count`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!res.ok) { console.error("group member count failed", res.status, await res.text()); return null; }
    const j = await res.json();
    return typeof j.count === "number" ? j.count : null;
  } catch (e) { console.error("group member count error", e); return null; }
}

export const fmt = (iso: string) =>
  new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short",
    hour: "2-digit", minute: "2-digit",
  });
