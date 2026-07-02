---
name: cloudflare
description: Cloudflare client-zone operations — site triage, WAF/firewall rules, cache debugging, DNS onboarding, email DNS audits (SPF/DKIM/DMARC/MX), Zero Trust/Access (protect wp-login.php), Bot Fight Mode, Turnstile, DDoS tuning, Tunnel, Email Routing. Excludes Workers, Pages, AI, storage (KV/D1/R2).
pattern: procedure
when_to_use: Any Cloudflare-fronted domain task, even when "Cloudflare" is not named — site down/slow/attacked/bot-flooded, high origin CPU, block IP/country/UA, office allowlist, geo-restrict, spam/scanner/AI-crawler rules, low cache hit rate, onboarding a new domain or nameserver change, WP Engine GES handoff, audit email DNS, protect wp-login.php with email OTP, tune Bot Fight Mode, add Turnstile to forms, triage false positives.
when_not_to_use: Workers, Pages, AI, storage (KV/D1/R2), or other Cloudflare compute-platform tasks.
next_skills: []
sub_agents: []
references:
  - waf
  - bot-management
  - ddos
  - turnstile
  - cache-reserve
  - email-routing
  - tunnel
---

# Cloudflare Skill — Refact

Use the decision trees below to find the right workflow, then load the relevant references.

## How to Use This Skill

### File Structure

```
SKILL.md                          ← you are here (also: narration, MCP table, zone-resolve, role check)
workflows/                        ← step-by-step operational guides
  dns-onboarding.md               ← onboard a new client domain
  cache-debug.md                  ← fix low cache hit rate
  waf-rules.md                    ← write WAF / firewall rules
  zero-trust-wp-login.md          ← protect wp-login.php with email OTP
  email-dns-audit.md              ← audit SPF / DKIM / DMARC / MX (read-only)
  site-triage.md                  ← diagnose down/slow/flooded site end-to-end
references/
  wordpress/                      ← WP / WP Engine specific gotchas + patterns
  waf/ bot-management/ ddos/ ...  ← Cloudflare product references
```

### Reading Order

1. Read **Cross-workflow conventions** (below) — every workflow assumes these.
2. Use a decision tree to pick the right workflow.
3. Open the workflow file.
4. When a workflow says "see references/...", open that file for deeper context.
5. Product references (`waf/`, `bot-management/`, etc.) are feature-level docs — load them when you need API details beyond what the workflow covers.

---

## Decision Trees

### "The site is down / up and down / slow / being flooded — I don't know why yet"

```
→ workflows/site-triage.md  ← START HERE for any unknown incident

The triage workflow pulls traffic data (status codes, IPs, user-agents,
paths, countries, TTFB) via GraphQL analytics, identifies the pattern,
then applies the right fix. Use it when you don't yet know what's wrong.
```

### "Client reports site is being attacked / getting hammered"

```
Do you already know the attack vector?
├─ No → workflows/site-triage.md (it will identify it for you)
├─ Brute-force on /wp-login.php
│  └─ → workflows/zero-trust-wp-login.md
├─ Form spam / bot signups
│  ├─ Identify the pattern first (see references/wordpress/spam-bot-patterns.md)
│  └─ → workflows/waf-rules.md + references/turnstile/ (for Turnstile)
├─ Scanners / vulnerability probes / bad IPs
│  └─ → workflows/waf-rules.md
├─ Country / ASN / user-agent block
│  └─ → workflows/waf-rules.md
├─ High traffic volume / DDoS
│  └─ → references/ddos/ (DDoS protection is on by default; this is for tuning)
└─ Bot crawlers hammering the site
   ├─ Legitimate crawlers (Google) → cache-debug workflow to absorb the load
   └─ Unwanted AI crawlers → workflows/waf-rules.md
```

### "Client reports slow site / high origin CPU"

```
Is cache hit rate low?
├─ Yes (or unknown) → workflows/cache-debug.md
└─ No (cache is fine, origin is slow) → origin issue, not Cloudflare
```

### "Onboarding a new client domain"

```
→ workflows/dns-onboarding.md
   Check first: is domain already on WP Engine GES?
   → references/wordpress/wp-engine-ges-dns.md
```

### "Check / verify email deliverability for a domain"

```
→ workflows/email-dns-audit.md
   Covers: SPF (single record, includes, +all trap), DKIM (per provider),
   DMARC (policy level, rua= presence), MX (exists, redundancy).
   Also compares live DNS against the Cloudflare zone if domain is on our account.
   Read-only — does not change any records.
```

### "Client wants to office-allowlist or restrict geo"

```
→ workflows/waf-rules.md
   For office allowlist: references/wordpress/waf-skip-pattern.md
   For geo-restrict: references/wordpress/waf-common-patterns.md
```

### "Something is blocking real users / false positives"

```
What's triggering the challenge?
├─ Bot Fight Mode is over-aggressive → references/wordpress/bot-fight-mode.md (exempt paths)
├─ Office IP getting challenged → workflows/waf-rules.md (skip rule at position 1)
├─ wp-login.php login broken after WAF change → references/wordpress/managed-challenge-post-trap.md
└─ Access app not blocking anything → references/wordpress/wp-engine-ges-access.md
```

---

## Product Index (what's kept in this skill)

| Product | Entry File | When |
|---------|------------|------|
| WAF | `references/waf/README.md` | Deep WAF product docs |
| Bot Management | `references/bot-management/README.md` | Bot Management subscription features |
| DDoS Protection | `references/ddos/README.md` | DDoS tuning |
| Turnstile | `references/turnstile/README.md` | CAPTCHA / form spam |
| Cache Reserve | `references/cache-reserve/README.md` | Cache Reserve setup |
| Email Routing | `references/email-routing/README.md` | Email routing rules |
| Tunnel | `references/tunnel/README.md` | Cloudflare Tunnel (origin connectivity) |

---

## Cross-workflow conventions

Every workflow in this skill assumes the conventions below. Workflows reference this section by name (e.g., *"Narration: see SKILL.md § Narration"*) instead of repeating them.

### Narration

Before **every cloudflare tool call**, output one sentence (under 15 words) explaining what the call does and why. Never call a tool silently.

Format: state the action + the reason in plain language. No filler ("I'll now...", "Let me..."). Just the fact.

Examples:
- *"Fetching response headers three times to see if cache progresses from MISS to HIT."*
- *"Listing DNS records on the zone to check for the wpeproxy CNAME (GES detection)."*
- *"Querying GraphQL for the top 10 source IPs in the last 15 minutes."*
- *"Reading the WAF rules reference to confirm the expression syntax before writing the rule."*
- *"Searching docs for the current Bot Fight Mode exempt-path behavior."*

If several calls run in parallel in one message, narrate them together in one sentence (e.g., *"Pulling status-code mix, top IPs, and top paths in parallel to triage the spike."*) rather than one line per call.

### MCP servers

| Server | URL | Used by |
|---|---|---|
| `cloudflare-api` | https://mcp.cloudflare.com/mcp | all workflows |
| `cloudflare-docs` | https://docs.mcp.cloudflare.com/mcp | all workflows |
| `cloudflare-graphql` | https://graphql.mcp.cloudflare.com/mcp | cache-debug, waf-rules, site-triage |
| `cloudflare-audit-logs` | https://auditlogs.mcp.cloudflare.com/mcp | zero-trust-wp-login, site-triage |
| `cloudflare-dns-analytics` | https://dns-analytics.mcp.cloudflare.com/mcp | dns-onboarding |

All transport: `http`. **Do not ask the user to install these — install them yourself via Bash, then only ask for OAuth.**

#### MCP is the ONLY supported toolchain (read this before any other step)

Every workflow in this skill depends on the `mcp__cloudflare_*` tools. Until those tools are loaded into the session, you **cannot** triage traffic, resolve a zone, write a rule, or audit DNS. There is no fallback path.

**Forbidden shortcuts — do not take any of these, ever:**
- Do **not** check `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_EMAIL`, `CF_API_KEY`, or any other Cloudflare env var as a way to "proceed without MCP." Their presence is irrelevant to this skill. Do not echo, test, or reference them.
- Do **not** call the Cloudflare REST API with `curl`, `wget`, `httpie`, `fetch`, or any HTTP client.
- Do **not** use `wrangler`, `flarectl`, or any other Cloudflare CLI as a substitute for the MCP servers.
- Do **not** "optimize for getting data fast" by improvising. If MCP is missing, the only correct next action is to install it (or stop and hand off).

If you catch yourself reaching for env vars or curl because MCP isn't there, **stop** — that is the exact failure mode this section exists to prevent. Go back to the install path below.

#### Installing MCP servers for Claude Code Agent
**Step 1 — detect what's installed (one Bash call):**
```bash
claude mcp list
```

**Step 2 — install whatever's missing for the workflow you're about to run.** Run these in parallel; they're idempotent and only the servers actually needed should be installed (see "Used by" column). User scope so it persists across sessions:
```bash
claude mcp add --transport http --scope user cloudflare-api https://mcp.cloudflare.com/mcp
claude mcp add --transport http --scope user cloudflare-docs https://docs.mcp.cloudflare.com/mcp
claude mcp add --transport http --scope user cloudflare-graphql https://graphql.mcp.cloudflare.com/mcp
claude mcp add --transport http --scope user cloudflare-audit-logs https://auditlogs.mcp.cloudflare.com/mcp
claude mcp add --transport http --scope user cloudflare-dns-analytics https://dns-analytics.mcp.cloudflare.com/mcp
```

**Step 3 — verify connection status:**
```bash
claude mcp list
```
Each server should show `✓ Connected`. If a server shows `✗ Failed to connect`, stop and tell the user — do not retry installs. If servers show `Needs authentication`, classify each one before proceeding:

- **Pre-existing server, unauthenticated** → its tool schemas (including `authenticate` / `complete_authentication`) are already loaded into this session. Use the in-session auth path (Step 4a). No restart needed.
- **Newly installed this session** → its schemas are *not* loaded yet. Use the restart path (Step 4b).

You can tell them apart: if `mcp__cloudflare-api__authenticate` (or the equivalent for whichever server) appears in your available tools, it's pre-existing. If it doesn't, it was just added and needs a restart first.

**Step 4a — in-session OAuth (preferred when schemas are loaded).** For each unauthenticated, pre-existing Cloudflare MCP, run its `authenticate` tool. It returns a URL. Show the URL to the user with a one-line instruction:

> Cloudflare needs OAuth for `cloudflare-api`. Open this URL, sign in **as Super Administrator on the account that owns the target zone** (Domain Admin silently fails on Access/Bot Fight Mode actions), approve scopes, then tell me "done":
> {{url}}

Then wait for the user's confirmation. When they confirm, call the matching `complete_authentication` tool to finalize. Repeat per server. Do this in parallel across servers when multiple need auth — show all URLs in one message, wait once, then call all `complete_authentication` tools together.

**Step 4b — restart-then-OAuth (only when servers were just added this session).** Newly added servers won't appear in `/mcp` and their `authenticate` tool isn't callable until Claude Code reloads MCP config. Tell the user, in this order:

> 1. **Quit and reopen Claude Code** (the new Cloudflare servers won't show up in `/mcp` until you do).
> 2. After it restarts, run `/mcp` — you should see `cloudflare-api`, `cloudflare-graphql`, etc. listed as *Needs authentication*.
> 3. Select each one and complete the OAuth flow in the browser, signing in as **Super Administrator** on the account that owns the target zone.
> 4. Tell me when that's done and I'll resume.

List only the servers that actually need this path (newly installed + unauthenticated), not all five.

**While the user is authenticating, keep moving on anything that doesn't need auth.** `cloudflare-docs` requires no OAuth — if it's connected, use it to pre-fetch the API shapes, expression syntax, or product docs the workflow will need. Stage the planned tool calls so they're ready to fire the moment auth completes. Do not sit idle.

**Step 5 — after the user confirms auth, re-run `claude mcp list` to verify `✓ Connected` on the relevant servers**, then resume the workflow. If you used Step 4b (restart path), the new session will lose conversation state — leave the user a one-line resume note ("Once you're back and `/mcp` shows everything green, say *resume* and I'll pick up at the preflight for {{domain}}.") before they restart.

### Resolve the zone

Most workflows start by resolving the client domain to a `zone_id`:

```javascript
await execute(async (cloudflare) => {
  const zones = await cloudflare.zones.list({ name: "{{client_domain}}" });
  if (!zones.result.length) return "Zone not found on this account.";
  const z = zones.result[0];
  return { zone_id: z.id, name: z.name, plan: z.plan.name, account: z.account.name };
});
```

### Role check (run before every session)

| Task | Minimum role |
|---|---|
| Manage DNS records on an existing zone | Domain Administrator |
| Write WAF custom rules on one zone | Domain Administrator |
| Create a new zone | **Super Administrator** |
| Create a Zero Trust / Access app | **Super Administrator** |
| Enable Bot Fight Mode | **Super Administrator** |
| Account-level custom ruleset across zones | **Super Administrator** + Enterprise |

```javascript
await execute(async (cloudflare) => {
  const accounts = await cloudflare.accounts.list();
  return accounts.result.map(a => ({ name: a.name, id: a.id, roles: a.roles || [] }));
});
```

If the requested action exceeds the current role, stop and tell the user to request elevation. Do not attempt workarounds.

---

## WP Engine GES — the universal gotcha

When a client's apex CNAME points at `*.wpeproxy.com`, WP Engine's Global Edge Security (GES) is in front of the origin. In that state:

- **Our WAF rules do nothing** — GES's Cloudflare sees the traffic, not ours.
- **Our Cache Rules do nothing** — same reason.
- **Our Access apps do nothing** — same reason.

Check for GES early on any new client zone:
```javascript
await execute(async (cloudflare) => {
  const zones = await cloudflare.zones.list({ name: "{{client_domain}}" });
  if (!zones.result.length) return { state: "no-zone" };
  const records = await cloudflare.dns.records.list({ zone_id: zones.result[0].id, per_page: 200 });
  const ges = records.result.filter(r => (r.content || "").match(/wpeproxy\.com/i));
  return { state: ges.length > 0 ? "ges-detected" : "no-ges", ges_records: ges };
});
```

For the full picture: `references/wordpress/wp-engine-ges-dns.md` (DNS context) or `references/wordpress/wp-engine-ges-access.md` (Access context).
