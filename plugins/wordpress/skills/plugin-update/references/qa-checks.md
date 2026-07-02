# plugin-update — QA check catalog

The portable catalog of what the QA layer *can* check after a plugin update. It
is **presence-driven and generic**: on every project the skill detects which
patterns exist, runs the matching check, and **skips (logs `n/a`) what isn't
present** — so the same skill does the right thing on a blog, a magazine, or a
shop.

## Three governing rules (apply to every row)

1. **Detect-and-skip.** Only check what the page actually has. Absent → skip + log, never fail.
2. **Delta-vs-baseline, not absolute.** Compare a pre-update baseline captured on the *same staging build* to the post-update state. Staging is often intentionally degraded (SEO-stripped, caching-off) and pre-existing debt is identical to prod — so only a delta *attributable to the update* is trustworthy.
3. **Flaky/third-party → SOFT.** The auto-rollback (HARD) path must be deterministic. Anything timing-, network-, or third-party-dependent **flags for a human; it never auto-rolls-back.**

### Always-checked vs checked-if-present (the QA model)

Two buckets, split by a single test: **does the check need a feature to exist?**

- **ALWAYS** (no feature required — tests that the *page/site itself* is healthy, true on 100% of pages): page renders / no WSOD, no PHP fatals, no broken first-party images, no failed first-party assets, no raw-output leaks, content present, no uncaught JS errors; and site-wide: no *new* server fatals, data-integrity (versions / content counts / cron), wp-admin loads, visual diff. These run on **every** update regardless of which plugin changed.
- **IF-PRESENT** (detect-and-skip — a check tied to a specific element/feature; absent → skip, never fail): nav / dropdown / mobile menu / footer / breadcrumbs, search, load-more, filters, pagination, table-of-contents, lightbox, social share, **forms of every kind** (contact / newsletter / popup / event / HubSpot / Mailchimp), checkout, maps, cookie banner, login.

**Forms specifically** are checked on every update (any plugin — a cache/SEO/JS-optimizer plugin breaks a form as easily as the form plugin), in two parts: **render + required-fields = HARD** (gates), **real submit = SOFT** (flags). See the Interactive/functional rows below.

Status legend: ✅ built · 🟡 written/planned · ⬜ backlog.

**Classification (default):** the interactive user-flows are treated as **HARD** (they gate auto-rollback) — made safe against false-rollback via (a) first-party-only link scoping, (b) **baseline-delta** link checks (only links an update *newly* breaks gate), and (c) `retries:2` for timing/Ajax blips. Every selector-bound check is **config-driven + detect-and-skip**: it runs only on a project that declared that selector at Setup (`qa.selectors` / `qa.probes`), so an unconfigured site skips it rather than failing. If a project declares a third-party newsletter embed (`qa.selectors.newsletterSignup`), that render check gates too, by choice — coupling rollback to the provider's uptime (documented trade-off; dial back to flag-only if undesired, or simply leave it undeclared). Only the **visual diff** layer is SOFT by nature (content churn makes it advisory).

---

## Rendering & assets
| Check | Detect | Assert | Gate | Status |
|---|---|---|---|---|
| Page renders / no WSOD | every route | not the critical-error screen | HARD | ✅ |
| Visual diff | every route | viewport screenshot matches baseline (masked) | SOFT | ✅ |
| Broken images | `<img>` on page | no first-party `src` returns 4xx/5xx | HARD | ✅ |
| Missing CSS/JS / failed requests | network responses | no first-party 4xx/5xx asset/API request | HARD | ✅ |
| Web fonts / icon glyphs | icon-font/SVG use | fonts load (no missing glyphs / FOUT) | SOFT | ⬜ |
| Layout sanity | each breakpoint | no horizontal scroll / obvious overlap | SOFT | ⬜ |

## Runtime & network
| Check | Detect | Assert | Gate | Status |
|---|---|---|---|---|
| Server PHP fatals | debug.log diff | no new fatal/uncaught since snapshot | HARD | ✅ |
| Uncaught JS errors | page load | no `pageerror` | HARD | ✅ (health) |
| Console errors | page load | collected + reported (noisy → not a gate) | SOFT | ✅ (health) |
| Failed network requests | page load | no first-party 4xx/5xx asset/API request | HARD | ✅ |
| Mixed content | https page | no `http://` subresources | SOFT | ⬜ |
| Raw-output leaks | page text | no leaked `Fatal/Parse/Warning…in .php` or `�` mojibake | HARD | ✅ |

## HTTP & routing
| Check | Detect | Assert | Gate | Status |
|---|---|---|---|---|
| Status codes | every route | non-5xx (404 route → 404) | HARD | ✅ |
| Custom 404 | bad URL | renders the theme 404 | HARD | ✅ |
| Redirects | known redirects | no loops; trailing-slash / http→https / www behave | SOFT | ⬜ |
| Permalinks / rewrite | pretty URLs | resolve (catches rewrite-not-flushed, e.g. sitemap 404) | HARD | ⬜ |
| Status regression (delta) | every route | a 2xx route not turning 4xx/5xx after update | HARD | ✅ (SEO/output plugins¹; status is also covered always by error-signals) |
| Compression + cache headers | response headers | present-before header not vanishing (delta) | SOFT | ✅ (SEO/output plugins¹) |
| SEO head-output (mapped) | `<head>` | present-before title/canonical/robots/OG/JSON-LD not disappearing (delta) | HARD (structural) | ✅ (SEO/output plugins¹) |
| Security headers (regression) | response headers | a present-before security header not vanishing (delta) | SOFT | ✅ (SEO/output plugins¹) |

¹ These come from `fingerprint.mjs` and run **only when the updated plugin is an SEO/output plugin** (Yoast, Rank Math, AIOSEO, SEOPress, …) or its changelog touches `<head>`/meta/schema/sitemap/assets — see SKILL.md E4. For an ordinary feature plugin they'd compare identical pages, so they're skipped.

## Interactive / functional
| Check | Detect | Assert | Gate | Status |
|---|---|---|---|---|
| Site search | search input | match → results; nonsense → empty state | HARD | ✅ |
| Mobile hamburger | toggle at mobile width | tap → drawer opens, links present | HARD | ✅ |
| Nav-menu links | nav `<a>` | every first-party target resolves (baseline-delta: only NEW breaks gate) | HARD | ✅ |
| Footer links | footer `<a>` | every first-party target resolves (baseline-delta) | HARD | ✅ |
| Dropdown / mega-menu | submenu markup | click opens, submenu container shows | HARD | ✅ |
| Table of contents | TOC + `#` anchors | each link jumps to a real heading | HARD | ✅ |
| CTA buttons (anchor) | `#`-anchor buttons | anchor targets a real section | HARD | ✅ |
| Galleries / lightbox | lightbox markup | opener click → lightbox opens | HARD | ✅ |
| Social share / copy-link | share block | share controls present | HARD | ✅ |
| Filters (taxonomy/date/keyword) | filter form | apply → results re-render, no error | HARD | ✅ |
| Load-more — click | load-more button | click → more items load | HARD | ✅ |
| Newsletter (embedded 3rd-party) | `qa.selectors.newsletterSignup` (declared at Setup) | renders + email field present (3rd-party: gates; retries absorb blips — documented coupling) | HARD | ✅ if declared |
| **Any form — render + required fields** | `<form>` / plugin container (WPForms · Gravity · CF7 · Ninja · HubSpot · Mailchimp · generic) — auto-discovered on every route, no form id hardcoded | the form + each required field still render — **baseline-delta**: only a form/field the update *newly* removes gates; honeypot/`aria-hidden` fields ignored | HARD | ✅ (`forms.spec.ts` + `lib/forms.ts`) |
| **Any form — real submit + confirmation** | a fillable, first-party, non-captcha form | fill (faker, every value stamped `QA-TEST`) → submit → confirmation: WP-configured message where server-readable (`form-config.mjs`), else success-shape + 2xx. Captcha → **skip** (kept real); server-confirmed (GF `_validate_only`, CF7 REST) is reliable, browser-only (WPForms/Ninja) is timing-dependent | **SOFT** (flags, never auto-rollback) · runs **staging + prod smoke** | ✅ (`forms-submit.spec.ts`) |
| Breadcrumbs | breadcrumb nav | links resolve | SOFT | ⬜ |
| Back-to-top | the control | click scrolls to top | SOFT | ⬜ |
| Accordions / tabs / toggles | the widget | click expands/switches | SOFT | ⬜ |
| Load-more — infinite scroll | scroll-trigger attr | scroll → more items load | SOFT | ⬜ (click-based load-more is built; infinite-scroll is backlog) |
| Pagination | pager links | next page loads | SOFT | ⬜ |
| Event-submission form | **declared** in `qa.flows.submitEvent` (Setup auto-detects by active plugin + content shortcode) | a generic form (fields + submit) renders at that path | HARD render | ✅ if declared |
| Login / account | login form | render + validate; real login on-demand | SOFT | ⬜ |
| **Checkout** (commerce) | cart/WooCommerce | add-to-cart → cart correct → reach payment page | HARD | ⬜ (commerce sites only) |
| Maps / calendars / embeds | embed markup | the embed renders | SOFT | ⬜ |
| Cookie banner / popups / announcement bar | the widget | accept/dismiss works | SOFT | ⬜ |

**Form coverage limits (by design):** the engine (`lib/forms.ts`) is generic and presence-based, with these honest gaps — none of which can false-fail: (a) **file-upload** fields can't be auto-filled with fake data (excluded from fill + signature); (b) **multi-step / conditional** forms whose required fields don't all appear in one pass are reported **inconclusive**, never submitted blindly; (c) forms behind a **login** aren't discovered (unauthenticated navigation only); (d) **honeypots** (`aria-hidden`/off-screen/zero-size) are skipped so the spam trap stays un-tripped. The real submit creates real **entries + an admin email notification** on staging *and* production every run — values are stamped `QA-TEST` so entries are filterable, and `form-cleanup.mjs` removes the stored ones afterward (the email can't be un-sent).

## Data & content integrity
| Check | Detect | Assert | Gate | Status |
|---|---|---|---|---|
| DB migration ran clean | debug.log + plugin version | no migration fatal (widened error-signals); version not moved *backward* | HARD | ✅ |
| Plugin deactivated by update | active-state diff | a present-active plugin not becoming inactive | HARD | ✅ |
| No content loss | counts before/after | published count per post type not dropping | HARD | ✅ |
| Cron queue intact | wp-cli | cron queue not emptied | HARD | ✅ |
| Settings survived | per-plugin option diff | option keys/sizes not collapsed-to-empty | SOFT | ⬜ |
| Custom fields / meta intact | sample meta | unchanged | SOFT | ⬜ |

## WordPress operational
| Check | Detect | Assert | Gate | Status |
|---|---|---|---|---|
| wp-admin loads | admin URL (SSH-minted session) | dashboard renders, not bounced to login, no fatal | HARD | ✅ |
| Block editor screen | edit screen | renders server-side, no PHP fatal (JS-mount = manual: site delays JS) | HARD | ✅ |
| Plugin's settings page | its admin page (`PLUGIN_UPDATE_SETTINGS_PAGE`) | loads, no fatal | HARD | ✅ |
| REST API + wp-cron | endpoints | respond | SOFT | ⬜ |
| Shortcodes / widgets render | content | no raw shortcode/widget output | HARD | ⬜ (overlaps raw-output) |
| Translations load | i18n | text domains load (no `_load_textdomain` fatal) | SOFT | ⬜ |

## Integrations & email
| Check | Detect | Assert | Gate | Status |
|---|---|---|---|---|
| Analytics/tag presence | server HTML | GTM/GA/Ahrefs/pixel present + not duplicated, vs baseline | SOFT (loud on missing) | ✅ (SEO/output plugins¹) |
| Form notifications send | wp_mail path | `wp_mail()` returns true / no mailer error; arrival on-demand via sandbox inbox | SOFT | ⬜ |
| Payment gateway / CRM / search service | their config | still connected (sites that have them) | SOFT | ⬜ (skip if absent) |
| Transactional emails | password-reset/comment | deliverability (on-demand) | SOFT | ⬜ |

## Performance
| Check | Detect | Assert | Gate | Status |
|---|---|---|---|---|
| Asset-manifest diff | enqueued assets | net-new / dropped scripts+styles vs baseline (plugin loading site-wide) | SOFT | ✅ (SEO/output plugins¹) |
| Core Web Vitals (LCP/CLS/TBT) | Playwright | advisory median, before/after | SOFT (never gate — timing) | ⬜ |

## Broken links
| Check | Detect | Assert | Gate | Status |
|---|---|---|---|---|
| In-content links | `.entry-content` links | only new 200→404/5xx attributable to the update (retry/backoff) | SOFT | ⬜ |

## Caching
| Check | Detect | Assert | Gate | Status |
|---|---|---|---|---|
| Negative-cache invariant | logged-in request | logged-in cookie is BYPASS/private, never HIT | SOFT | ⬜ |
| Purge / stale-HTML | post-promote prod | fresh HTML after cache bust | SOFT (prod smoke only) | ⬜ |

## Cross-browser & responsive
| Check | Detect | Assert | Gate | Status |
|---|---|---|---|---|
| Mobile/tablet functional+health | viewport projects | functional + health pass at 393×851 / 768×1024 (Chromium) | HARD | ⬜ |
| Per-viewport screenshots | viewport projects | viewport-only diff vs baseline | SOFT | ⬜ |
| Other engines (WebKit/Firefox) | on-demand | functional-only, never a screenshot/rollback gate | SOFT | ⬜ |

---

## Explicitly excluded (out of scope for this skill)
- **SEO/structured-data beyond the mapped head-output diff** — schema *validation*, heading-hierarchy, alt-text coverage, noindex-leak audits. (Belongs to the dedicated `seo-audit` skill.)
- **Vulnerability scanning beyond the headers/endpoint diff** — known-CVE lookups, exposed-file scans, SSL/XML-RPC hardening. (Site-hardening, not update-delta QA.)
- **Post-deploy observability** — error-rate/uptime monitoring, backup-restorability testing. (The existing production *smoke check* after promotion stays; ongoing monitoring does not.)
