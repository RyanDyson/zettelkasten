# Getting Started with ZettelKasten

Welcome to your **vault**. This page is rendered from a temp markdown file
(`/public/temp-note.md`) by the note renderer. See also
[Getting Started](getting-started.md) and return to the
[graph view](/).

## Core principles

1. Your notes are yours — plain files on disk, portable by design.
2. Notes are atoms; *links* between them create the knowledge network.
3. Everything has a shortcut. Try `Ctrl+K` for the command palette.

## Quick tips

- Use the **graph view** on the home page to see connections.
- Tag freely with `#topics` — loose tags beat rigid folders.
- Daily notes are auto-created the first time you launch each day.

## What's on the roadmap

- [x] Vault onboarding
- [x] Network renderer
- [ ] Late relating across folders
- [ ] Inline backlink autocomplete

> A note should be an *idea*, not a document. Write small,
> link often, and revisit later.

| Feature        | Status | Notes                          |
| -------------- | ------ | ------------------------------ |
| Graph view     | ✅      | Renders every link in a vault |
| Frontmatter    | ✅      | Editable properties panel      |
| Git sync       | ✅      | Optional, auto-commits         |
| Vault sharing  | 🔜      | Planned                        |

```ts
// Code blocks are highlighted too.
const vault = await openVault({ path: "D:/testing/Gett..." });
console.log(`${vault.notes.length} notes loaded`);
```
