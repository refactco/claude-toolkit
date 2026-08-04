# Changelog — wordpress:plugin-update

Newest first. Written by the Skill Analyzer; verdicts are filled in by code.

## 1.1.0 — 2026-08-04 — minor — Skill Analyzer 2026-W32

**Change:** Fixed five plugin-update template bugs: base64 SSH quoting, baseline-delta health, bounded networkidle, MultiSite routes, and premium-plugin pinning.

**Why:** Five concrete template bugs from workweek fork that each defeat the QA harness: base64 wp-cli, baseline-delta health, networkidle timeout, MultiSite routes, premium-plugin pin. Push fix back to fork.

**Evidence:**
- [F-057] skill.failed · rework · local:plugin-update | The skill's shared SSH transport (config.mjs) breaks on WP Engine's managed SSH gateway, which strips one layer of quoting, silently breaking the data-integrity HARD gate and admin-session minting. | quote: "This silently broke `data-integrity.mjs`, which is a HARD rollback gate, and `mint-admin-session.mjs` entirely." | fix: Document that remote wp-cli commands must be base64-encoded (not raw-quoted) since managed hosts like WP Engine re-parse and strip quoting, and note this in the Preflight/SSH section. | workweek-website/47954600
- [F-058] skill.failed · rework · local:plugin-update | The shipped health.spec.ts template gates on an absolute zero JS-error count instead of baseline-delta, so pre-existing site errors would cause every future plugin update to auto-rollback. | quote: "This site has two pre-existing ones (`Unexpected token ';'` and `analytics is not defined`), so **every plugin update would have auto-rolled-back**." | fix: Instruct Setup to make the health check baseline-delta like the broken-links check, comparing against a captured pre-existing-errors baseline rather than asserting zero. | workweek-website/47954600
- [F-059] skill.failed · rework · local:plugin-update | The shipped visual.spec.ts template waits on an unbounded `networkidle` load state, so pages with streaming/podcast embeds hang until the full 90s test timeout instead of falling through. | quote: "Found it: line 23 waits for `networkidle` with **no timeout**, so the `.catch()` can never fire within the test window — it hangs until the 90s test timeout." | fix: Bound `waitForLoadState("networkidle")` with an explicit timeout in the shipped visual.spec.ts template so pages with persistent connections don't stall the whole test budget. | workweek-website/47954600
- [F-060] skill.missing-instruction · rework · local:plugin-update | Setup's route-discovery step (S5) only samples the main site's sitemap, leaving all subsites of a MultiSite network unQA'd — a plugin update could break 12 microsites and still pass green. | quote: "A plugin update that broke a creator microsite would pass QA completely green." | fix: Add a Setup step to detect MultiSite (`wp site list`) and require at least one baseline route per distinct subsite/theme, not just the main site's sitemap. | workweek-website/47954600
- [F-061] skill.missing-instruction · friction · local:plugin-update | E6's version-pinned `wp plugin update <slug> --version=<to>` assumes wordpress.org-hosted plugins; it fails outright for premium/off-directory plugins like Gravity Forms, which the skill never flags. | quote: "Version-pinning routes through the wordpress.org API, and Gravity Forms is premium/off-directory, so there's nothing to pin against." | fix: Note in E6 that premium/off-directory plugins can't be version-pinned via WP-CLI's npm registry lookup, and give the unpinned `wp plugin update <slug>` fallback for that case. | workweek-website/47954600

**Expectation:** Plugin-update templates no longer auto-rollback on pre-existing errors, hang on networkidle, or skip subsites/premium plugins.

**Verdict:** still collecting
<!-- radar:expectation id=2026-W32-wordpress-plugin-update metric=findings.skill.failed baseline=3 target=0 window=4w -->
