# Integration Test Triage

> Auto-maintained by the `integration-tests` skill. One row per surface backfill marked
> `🔌 integration` in `tests/Unit/Generated/COVERAGE.md`. Each row carries the **decision**
> — is a real integration test worth it? — one judgment (does a silent break have real
> cost?) plus one lookup (does the dep run locally?), then a verdict.
> The skill is **done** only when no row is left `🟢`/`🟡` unbuilt without explicit user
> sign-off. On a re-run, this file is the resume point: read it first and only work the
> rows that aren't already `✅` / `⚪`.

**The core principle:** the `🔌` flag already settled that a faithful unit stub is
*impossible* — so don't re-assess that. The only thing to decide is whether a silent break
has **real cost** (money, data, access, a visible flow). No real cost → not worth a
real-dependency test, even though the stub was impossible.

**The decision** — one judgment + one lookup. The `🔌` flag already settled faithfulness, so it isn't re-scored. What's left:

| | Asks |
|---|---|
| Blast radius *(the judgment)* | Does a silent break cost money / corrupt data / breach access / break a visible flow? **No → `⚪ skip`.** |
| Runnable locally? *(the lookup)* | Is the named dep present & active on any maintainer's machine? — **read via `wp plugin list` / `wp theme list`, don't ask.** Only splits a *kept* surface into `🟢 build` (yes) vs `🟡 contract` (no); never rescues a no-cost one. (The suite runs locally only, never CI, so the bar is "any maintainer can run it," not CI licensing.) |

**Verdict legend**

| Symbol | Meaning | Terminal? |
|---|---|---|
| 🟢 build | real cost **and** the dep runs locally → real integration test in `tests/Integration/` (local-only, never CI) | no (until built) |
| 🟡 contract | real cost but the dep **can't** run reproducibly (license-gated / external) → recorded-shape contract test in the **unit** tree (`tests/Unit/Generated/`, CI-safe — no real plugin) + note the staging/manual cover | no (until built) |
| ⚪ skip | low blast radius / cosmetic, OR over-classified → send back to backfill as a **stub** (note which) | yes |
| ✅ integration-covered | real integration test written and green | yes |
| ✅ contract-covered | contract test written and green | yes |

**Decision:** real cost + runs locally → `🟢 build`; real cost but can't run reproducibly
→ `🟡 contract`; no cost / cosmetic (or over-classified) → `⚪ skip`.

---

## <Prefix><PascalName>  (wp-content/<base>/<slug>)

_Source `🔌` rows from `COVERAGE.md` · integration target `tests/Integration/<Prefix><PascalName>/`_

| Surface | Source | Named dep | Blast radius | Runnable locally? | Verdict | Test file |
|---|---|---|---|---|---|---|
| `[cart_summary]` | `inc/cart.php:12` | full `WC_Cart` (line items, coupons, tax) | checkout total (money) | yes — WC active | 🟢 build | `Integration/.../CartSummaryTest.php` |
| `mepr_gate_content()` | `inc/mepr.php:8` | `MeprUser` + subscriptions | access control | no — MemberPress premium **not in local dev** | 🟡 contract | `Unit/Generated/.../MeprGateContractTest.php` |
| `order_badge_color()` | `inc/badge.php:30` | `WC_Order` (reads status only) | cosmetic | n/a | ⚪ skip (→ backfill stub) | — |

<!-- Repeat one ## section per source folder that had 🔌 rows. -->

---

### Roll-up

| Folder | 🟢 | 🟡 | ⚪ | ✅ | Total 🔌 |
|---|---|---|---|---|---|
| `<Prefix><PascalName>` | 1 | 1 | 1 | 0 | 3 |

_Done when no `🟢`/`🟡` row is left unbuilt (each is `✅` or has explicit user sign-off),
the integration suite is green, and every covered row is cross-referenced back into
`COVERAGE.md`._
