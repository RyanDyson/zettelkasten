import { test } from "node:test";
import assert from "node:assert/strict";
import { matchMentions, rankedMentionNotes } from "./note-mentions";
import type { ConceptMention } from "./api";

const vitamin: ConceptMention = {
  concept: "vitamin c",
  terms: ["vitamin c", "ascorbic acid"],
  notes: [
    { note_id: "fruits", title: "Apples", score: 1, concepts: ["vitamin c"] },
    {
      note_id: "vitamin",
      title: "Vitamin_C_Test",
      score: 0.93,
      concepts: ["vitamin c"],
    },
  ],
};

test("vitamin C matches case and wrapping, but not parts of words", () => {
  const text =
    "Oranges contain Vitamin C. vitamin\nC is helpful. Multivitamin C is different; vitamin cat isn't a match. Ascorbic acid.";
  assert.deepEqual(
    matchMentions(text, [vitamin]).map((m) => text.slice(m.from, m.to)),
    ["Vitamin C", "vitamin\nC", "Ascorbic acid"],
  );
});

test("overlapping aliases are deduplicated and literal regex characters are safe", () => {
  const mentions = [
    { ...vitamin, terms: ["vitamin", "vitamin C", "Vitamin C", "C++", ""] },
  ];
  assert.deepEqual(
    matchMentions("vitamin C and C++", mentions).map((m) => [m.from, m.to]),
    [
      [0, 9],
      [14, 17],
    ],
  );
  assert.deepEqual(matchMentions("vitamin C", [{ ...vitamin, notes: [] }]), []);
});

test("the dedicated vitamin note is first, while ambiguous matches remain available", () => {
  assert.deepEqual(
    rankedMentionNotes(vitamin).map((n) => n.note_id),
    ["vitamin", "fruits"],
  );
  assert.equal(vitamin.notes[0].note_id, "fruits");
});
