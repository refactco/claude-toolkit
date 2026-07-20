---
name: editorial-config-applier
description: Apply WordPress editorial-config edits — admin menu order, field visibility/order, listing pagination, directory filters, component states — without custom code where possible.
pattern: procedure
when_to_use: "WordPress editorial or admin config ticket: reorder admin menu, group menu items, remove/collapse/hide a backend field (e.g. Dek/subhead), reorder metadata fields (Alt Text, Title, Caption, Credit), cap a listing to N with Load More, add a specialty/category dropdown filter to a directory search, tweak component button hover/focus/rest colors; client feedback batch on a WP site"
when_not_to_use: "Non-WordPress sites, PHP plugin architecture changes, database migrations, new post types from scratch, or anything requiring custom theme code when the request says avoid custom code."
next_skills: []
sub_agents: []
---

Follow the request's constraint order: prefer built-in settings > ACF/field-group config > minimal theme code. If the client says "easy, don't custom code," never introduce custom code.

1. Classify the ticket into one or more operations below. For batch/client-feedback tickets, split into one operation per subtask and apply each independently.

2. Locate targets. Run `scripts/find_targets.sh "<term>"` to map a human label to files/registrations. Contract: takes a search term (field label, menu title, listing/component name); returns matching file paths + line numbers for menu registrations (`add_menu_page`/`add_submenu_page`), ACF/field-group definitions, template loops, and component CSS. Do not scan by hand.

**Admin menu order/grouping**
- Reorder via `menu_order`/`custom_menu_order` filter or the menu plugin already in use; do NOT add nesting WordPress can't support.
- Group related items by adjacency when true nesting is unavailable; note the limitation in the ticket reply.

**Field visibility toggle**
- To hide: remove the field from the edit-screen field group (keep the field + data unless removal is explicit).
- Prefer "collapsed by default" over deletion when the request is reconsidered or data must survive — set the field/group to closed/collapsed rather than unregistering.

**Field reordering**
- Reorder entries within the field group definition to the requested sequence. Confirm final order back to the requester (e.g. Caption → Credit → Alt Text → Title → File URL).

**Listing pagination (cap + Load More)**
- Set the query/loop limit to the requested count (~10) and add a Load More control that fetches the next page (AJAX/`load_more` handler already present in theme if any).
- Apply to every landing page named in the ticket; verify each independently.

**Directory filter dropdown**
- Add the dropdown to the specified search box, populated from the relevant taxonomy/specialty terms; wire the selected value into the existing query so results filter accordingly.

**Component button states**
- Edit only the named component's CSS. Adjust rest/hover/focus colors as described (e.g. red at rest, band fill on hover); keep focus states accessible (visible outline, sufficient contrast).

3. Verify each change in the WP admin/editor and on the front end. For batches, re-check every subtask; do not mark done until all are confirmed.

4. Reply with a per-item summary: what changed, any built-in limitation hit (e.g. fixed menu structure), and any deviation from the literal request (e.g. collapsed instead of removed) with the reason.
