import type { ConceptMention } from "./api";

export type MentionMatch = {
  from: number;
  to: number;
  mention: ConceptMention;
};
const word = /[\p{L}\p{N}_]/u;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function matchMentions(
  text: string,
  mentions: ConceptMention[],
): MentionMatch[] {
  const matches: MentionMatch[] = [];
  for (const mention of mentions) {
    if (!mention.notes.length) continue;
    for (const term of new Set(
      mention.terms.map((term) => term.trim()).filter(Boolean),
    )) {
      const pattern = new RegExp(
        term.split(/\s+/).map(escape).join("\\s+"),
        "giu",
      );
      for (const match of text.matchAll(pattern)) {
        const from = match.index!;
        const to = from + match[0].length;
        if (
          (from && word.test(text[from - 1]) && word.test(match[0][0])) ||
          (to < text.length &&
            word.test(text[to]) &&
            word.test(match[0].at(-1)!))
        )
          continue;
        matches.push({ from, to, mention });
      }
    }
  }
  // Longest term wins at a given position; never nest overlapping decorations.
  matches.sort(
    (a, b) =>
      a.from - b.from ||
      b.to - a.to ||
      a.mention.concept.localeCompare(b.mention.concept),
  );
  const result: MentionMatch[] = [];
  for (const match of matches) {
    if (!result.length || match.from >= result[result.length - 1].to)
      result.push(match);
  }
  return result;
}

export function rankedMentionNotes(mention: ConceptMention) {
  const normalize = (value: string) =>
    value
      .toLocaleLowerCase()
      .replace(/[_\W]+/g, " ")
      .trim();
  const affinity = (title: string) =>
    mention.terms.some((term) =>
      ` ${normalize(title)} `.includes(` ${normalize(term)} `),
    )
      ? 1
      : 0;
  return [...mention.notes].sort(
    (a, b) =>
      affinity(b.title) - affinity(a.title) ||
      b.score - a.score ||
      a.title.localeCompare(b.title) ||
      a.note_id.localeCompare(b.note_id),
  );
}
