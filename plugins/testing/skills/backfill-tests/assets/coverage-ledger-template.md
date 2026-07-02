# Generated Test Coverage Ledger

> Auto-maintained by the `backfill-tests` skill. One row per **observable surface**
> in the maintained code under test. The skill is **done** only when no row is left
> `🔲 deferred` without explicit user sign-off — a green suite with open deferred
> rows is *not* done. On a re-run, this file is the resume point: read it first and
> only work the rows that aren't already `✅` / `🔌` / `⛔` / `⚪`.

**Disposition legend**

| Symbol | Meaning | Terminal? |
|---|---|---|
| ✅ covered | test written and green (incl. via a hand-written stub) | yes |
| 🔌 integration | reachable, but a **complex** third-party dep (deep object graph) can't be faked without reimplementing the library — **dep named in Notes**; deferred to a separate integration suite this skill does not build | yes |
| ⛔ blocked | untestable **as written** — no seam to control a non-deterministic / external effect without a source change (`time()`, `rand()`, direct socket) — **seam named in Notes** | yes |
| ⚪ excluded | a test would add no *meaningful* safety — **(A)** it would only **restate the source** (config glue, single-fallback getter, `wp_kses` pass-through, single literal op, boolean field read, literal regex), **(B)** already pinned by another row (wrapper/duplicate), or **(C)** **low blast radius** — genuine logic but admin-only chrome / cosmetic label / self-correcting editor convenience. Note the reason: `⚪ excluded (low-impact: <why>)` | yes |
| 🔲 deferred | reachable, and clears **both axes** — real logic (pinning needs reasoning the source doesn't state: a winner among inputs, a parsed/accumulated result, a boundary/clamp, a built query) **and** real blast radius (front-end output, stored data, security, indexing, money, which-content) — even if short. Not yet written; **incl. a surface blocked only by a _simple_ stubbable dep**. Must resolve before done | no |

**Surface kinds:** shortcode · filter · action · function · method · rest-route · render-callback

---

## <Prefix><PascalName>  (wp-content/<base>/<slug>)

_Generated target: `tests/Unit/Generated/<Prefix><PascalName>/`_

| Surface | Kind | Source | Disposition | Test file | Notes |
|---|---|---|---|---|---|
| `[order_total]` | shortcode | `includes/cart.php:12` | ✅ covered | `OrderTotalShortcodeTest.php` | empty + summed cases |
| `[testimonials]` | shortcode | `inc/short-code.php:55` | ✅ covered | `TestimonialsShortcodeTest.php` | stubbed ACF `get_field(..,'option')` (simple value) |
| `my_shop_related_posts()` | function | `inc/related.php:40` | 🔲 deferred | — | reachable; needs post + term fixtures |
| `mepr_gate_content()` | filter | `inc/mepr.php:8` | 🔌 integration | — | complex `MeprUser` object graph — too costly to fake |
| `cache_buster_token()` | function | `inc/assets.php:20` | ⛔ blocked | — | raw `time()` — no seam without a source change |
| `register_theme_assets()` | action | `inc/setup.php:3` | ⚪ excluded | — | `wp_enqueue_*` glue, no logic |
| `collapse_meta_box()` | filter | `inc/admin.php:14` | ⚪ excluded | — | low-impact: adds `closed` class to an admin postbox — no data/front-end effect |

<!-- Repeat one ## section per confirmed folder. -->

---

### Roll-up

| Folder | ✅ | 🔲 | 🔌 | ⛔ | ⚪ | Total |
|---|---|---|---|---|---|---|
| `<Prefix><PascalName>` | 2 | 1 | 1 | 1 | 1 | 6 |

_Done when the 🔲 column is **0** across every folder (or each remaining 🔲 has an explicit user sign-off noted beside it)._
