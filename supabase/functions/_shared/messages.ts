// LINE に送る文面をここに集約(口調を変えたいときはこのファイルだけ編集すれば OK)。
// 公式アカウント「秘書」として、丁寧な口調で案内する。
import { fmt } from "./line.ts";

const sama = (names: string[]) => names.map((n) => `${n}様`).join("、");
// 備考があれば「田中様(19時まで)」の形にする
type Person = { name: string; note?: string | null };
const withNote = (list: Person[]) => list.map((r) => `${r.name}様${r.note ? `(${r.note})` : ""}`).join("、");
const place = (location?: string | null) => (location ? [`📍 場所・URL: ${location}`] : []);

// 日程調整の開始
export function startMessage(p: {
  title: string; organizer: string; candidates: string[]; deadline: string | null;
  location?: string | null; url: string;
}) {
  return [
    "お疲れさまです。秘書でございます。",
    `${p.organizer}様より、「${p.title}」の日程調整をお預かりいたしました。`,
    "",
    "▼ 候補日時",
    ...p.candidates.map((c, i) => `${i + 1}. ${fmt(c)}`),
    ...(p.location ? ["", ...place(p.location)] : []),
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
  title: string; startsAt: string; ok: Person[]; maybe: Person[]; location?: string | null; url: string;
}) {
  return [
    "お待たせいたしました。秘書でございます。",
    `「${p.title}」の日程が、下記のとおり決定いたしました。`,
    "",
    `📅 ${fmt(p.startsAt)}`,
    ...place(p.location),
    "",
    ...(p.ok.length ? [`ご参加予定(○): ${withNote(p.ok)}`] : []),
    ...(p.maybe.length ? [`調整中(△): ${withNote(p.maybe)}`] : []),
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

// 全員の回答が揃ったとき(幹事宛)
export function completeMessage(p: {
  title: string; organizer: string; url: string;
  slots: { startsAt: string; ok: number; maybe: number; no: number }[];
}) {
  return [
    `${p.organizer}様、秘書でございます。(幹事の${p.organizer}様へのご連絡です)`,
    `「${p.title}」について、皆様のご回答が出そろいました。`,
    "",
    "▼ 回答状況",
    ...p.slots.map((s, i) => `${i + 1}. ${fmt(s.startsAt)}  ○${s.ok}  △${s.maybe}  ×${s.no}`),
    "",
    "内容をご確認のうえ、日程のご決定をお願いいたします。",
    p.url,
  ].join("\n");
}

// 内容の変更(幹事が編集したとき)
export function updateMessage(p: { title: string; lines: string[]; url: string }) {
  return [
    "ご連絡でございます。秘書です。",
    `「${p.title}」の日程調整に、変更がございました。`,
    "",
    ...p.lines.map((l) => `・${l}`),
    "",
    "お手数ですが、あらためてご都合のご確認をお願いいたします。",
    p.url,
  ].join("\n");
}

// イベントの削除(中止)
export function cancelMessage(p: { title: string; organizer: string; wasConfirmed: boolean }) {
  return [
    "ご連絡でございます。秘書です。",
    `${p.organizer}様のご判断により、「${p.title}」の日程調整は取りやめとなりました。`,
    ...(p.wasConfirmed ? ["確定済みの日程も、白紙となります。"] : []),
    "",
    "ご対応のほど、よろしくお願いいたします。",
  ].join("\n");
}
