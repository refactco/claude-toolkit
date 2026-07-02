---
name: render-deliverable
description: Scaffold a designed, print-ready HTML render shell (the Refact design system) next to a markdown deliverable and wire it to fetch the .md at runtime — serve over HTTP, save to PDF. Use to render a proposal, addendum, or client doc to a polished HTML/PDF.
pattern: procedure
when_to_use: You have a markdown deliverable (proposal, addendum, brief, report, one-pager) and want a polished, branded, print-ready HTML/PDF version. Triggers — "render this to HTML", "make a PDF of the proposal", "a designed version of this doc", "turn this markdown into the nice format".
when_not_to_use: Plain internal notes, emails sent as plain text, or content that ships as raw markdown; or when a shell already exists for the file (only re-run with --force to regenerate). For promoting a finished artifact to the client folder, use create-deliverable.
next_skills: []
sub_agents: []
---

# Render Deliverable

Turn a markdown deliverable into a polished, print-ready document using the shared
Refact design system — editorial Swiss layout, Inter + Source Serif 4, claret accent on
warm cream, with a full print stylesheet (running header, page numbers, page breaks).

**How it works:** the content stays single-sourced in the `.md`. The skill scaffolds a
sibling `*.html` **render shell** that holds the design system and *fetches the `.md` at
runtime*, so you edit prose in markdown and the HTML/PDF always reflects it.

## Steps

1. **Pick the markdown source** — a deliverable in `docs/deliverables/<type>/` (or a draft
   in `docs/internal/<type>/` you want to review as a designed doc).

2. **Generate the shell:**
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/skills/render-deliverable/render.mjs <path/to/deliverable.md> \
        [--title "Doc Title"] [--header "Running header"] [--force]
   ```
   Writes `<same-dir>/<same-basename>.html`. Title defaults to the first `# H1` (or the
   filename); the print running-header defaults to the title. Refuses to overwrite an
   existing shell unless `--force`.

3. **Author with the design-system components** (optional) — drop these as HTML islands
   in the `.md` for richer layout; see `assets/shell.html` for the full CSS and markup:
   `cover`, `cover-letter`, `toc`, `section-divider`, `callout` / `callout major`,
   `pull-quote`, `portfolio-plate` / `portfolio-card`, `team-grid`, `figure` (inline SVG).
   Plain markdown also renders well on its own. Automatic touches: an `h2` like `2. Name`
   gets Swiss section numbering; a table whose last header is *Fee/Payment/Cost* gets
   emphasized pricing styling; the page `<title>` is taken from the first `# H1`.

4. **View / export to PDF:**
   ```bash
   python3 -m http.server 8765      # from the project root
   ```
   Open the `.html` under `http://localhost:8765/…` in Chrome → **Cmd+P → Save as PDF**
   (Letter, default margins, "Background graphics" on). Viewing needs HTTP — `file://`
   can't fetch the `.md`.

5. **Single source of truth** — edit content in the `.md`; the `.html` is regenerable.
   Don't hand-edit a generated shell except to evolve the **shared** design system in
   `assets/shell.html` (which improves it for every deliverable).

## Notes

- The `.md`, its `.html` shell, and the exported PDF live together in the same folder, so
  they travel as a set when a draft is promoted from `internal/` to `deliverables/`.
- When the deliverable is sent, promote it with **create-deliverable** (Task → Output).
- The design system is brand process, not project content — nothing client-specific is
  baked into the shell.
