// 名簿(グループのメンバー名)と回答者名の照合。全角/半角・空白・大文字小文字の違いは無視する。
export const norm = (s: string) => s.normalize("NFKC").replace(/\s+/g, "").toLowerCase();

// 未回答者 = 名簿 − 回答済みの人 − 幹事(幹事は回答していなくてもよい)
export function unansweredNames(members: string[], organizer: string, answered: string[]): string[] {
  const done = new Set(answered.map(norm));
  const org = norm(organizer);
  return members.filter((m) => norm(m) !== org && !done.has(norm(m)));
}

// 回答が必要な人数(名簿 − 幹事)
export const requiredCount = (members: string[], organizer: string) =>
  members.filter((m) => norm(m) !== norm(organizer)).length;
