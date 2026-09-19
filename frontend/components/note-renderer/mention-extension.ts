import { createExtension, type ExtensionOptions } from "@blocknote/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node } from "@tiptap/pm/model";
import type { ConceptMention } from "@/lib/api";
import { matchMentions } from "@/lib/note-mentions";

type State = { mentions: ConceptMention[]; decorations: DecorationSet };
const key = new PluginKey<State>("note-mentions");

function decorate(doc: Node, mentions: ConceptMention[]) {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock || node.type.spec.code) return;
    // Map the full textblock so a phrase can span bold/italic text nodes.
    const text = node.textBetween(0, node.content.size, "", (leaf) =>
      leaf.type.name === "hardBreak" ? "\n" : "\uFFFC",
    );
    for (const match of matchMentions(text, mentions)) {
      let protectedContent = false;
      node.nodesBetween(match.from, match.to, (child) => {
        if (
          child.marks.some(
            (mark) => mark.type.name === "link" || mark.type.name === "code",
          )
        )
          protectedContent = true;
      });
      if (protectedContent) continue;
      decorations.push(
        Decoration.inline(pos + 1 + match.from, pos + 1 + match.to, {
          class: "note-mention",
          "data-note-mention": match.mention.concept,
          role: "button",
          tabindex: "0",
          "aria-label": `Related notes for ${match.mention.concept}`,
          title: `View ${match.mention.notes.length} related ${match.mention.notes.length === 1 ? "note" : "notes"}`,
        }),
      );
    }
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

export const NoteMentions = createExtension(
  ({
    editor,
    options,
  }: ExtensionOptions<{ onOpen: (mention: ConceptMention) => void }>) => {
    function open(target: EventTarget | null, state: State | undefined) {
      const element =
        target instanceof Element
          ? target.closest("[data-note-mention]")
          : null;
      const mention = state?.mentions.find(
        (item) => item.concept === element?.getAttribute("data-note-mention"),
      );
      if (!mention) return false;
      options.onOpen(mention);
      return true;
    }
    return {
      key: "noteMentions",
      prosemirrorPlugins: [
        new Plugin<State>({
          key,
          state: {
            init: () => ({ mentions: [], decorations: DecorationSet.empty }),
            apply(tr, previous) {
              const mentions = tr.getMeta(key) as ConceptMention[] | undefined;
              if (!tr.docChanged && !mentions) return previous;
              const current = mentions ?? previous.mentions;
              return {
                mentions: current,
                decorations: decorate(tr.doc, current),
              };
            },
          },
          props: {
            decorations: (state) => key.getState(state)?.decorations,
            handleClick: (view, _pos, event) =>
              open(event.target, key.getState(view.state)),
            handleDOMEvents: {
              keydown(view, event) {
                if (
                  (event.key === "Enter" || event.key === " ") &&
                  open(event.target, key.getState(view.state))
                ) {
                  event.preventDefault();
                  return true;
                }
                return false;
              },
            },
          },
        }),
      ],
      setMentions(mentions: ConceptMention[]) {
        editor.transact((tr) => tr.setMeta(key, mentions));
      },
    } as const;
  },
);
