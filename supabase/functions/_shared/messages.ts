// LINE に送る文面をここに集約(口調を変えたいときはこのファイルだけ編集すれば OK)。
// 公式アカウント「秘書」として、丁寧な口調で案内する。
import { fmt } from "./line.ts";

const sama = (names: string[]) => names.map((n) => `${n}様`).join("、");

// 日程調整の開始
export function startMessage(p: {
  title: string; organizer: string; candidates: string[]; deadline: string | null; url: string;
}) {
  return [
    "お疲れさまです。秘書でございます。",
    `${p.organizer}様より、「${p.title}」の日程調整をお預かりいたしました。`,
    "",
    "▼ 候補日時",
    ...p.candidates.map((c, i) => `${i + 1}. ${fmt(c)}`),
    "",
    p.deadline
      ? `お手数ですが、${fmt(p.deadline)}までにご都合をお知らせいただけますと幸いです。`
      : "お手すきの際に、ご都合をお知らせいただけますと幸いです。",
    "ご回答は下記よりお願いいたします。",
    p.url,
  ].join("\n");
}

// 日程の確定
export function confirmMessage(p: {
  title: string; startsAt: string; ok: string[]; maybe: string[]; url: string;
}) {
  return [
    "お待たせいたしました。秘書でございます。",
    `「${p.title}」の日程が、下記のとおり決定いたしました。`,
    "",
    `📅 ${fmt(p.startsAt)}`,
    "",
    ...(p.ok.length ? [`ご参加予定(○): ${sama(p.ok)}`] : []),
    ...(p.maybe.length ? [`調整中(△): ${sama(p.maybe)}`] : []),
    ...(p.ok.length || p.maybe.length ? [""] : []),
    "詳細は下記よりご確認いただけます。",
    p.url,
    "",
    "当日、どうぞよろしくお願いいたします。",
  ].join("\n");
}

// 回答期限のリマインド
export function remindMessage(p: { title: string; deadline: string; names: string[]; url: string }) {
  return [
    "お忙しいところ恐れ入ります。秘書でございます。",
    `「${p.title}」の回答期限が、${fmt(p.deadline)}と迫っております。`,
    "",
    p.names.length
      ? `ご回答済み(${p.names.length}名): ${sama(p.names)}`
      : "現時点で、ご回答はまだいただいておりません。",
    "",
    "まだの方は、お手数ですが下記よりご回答をお願いいたします。",
    p.url,
  ].join("\n");
}
