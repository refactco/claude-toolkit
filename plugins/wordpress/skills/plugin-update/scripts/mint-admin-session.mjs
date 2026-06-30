#!/usr/bin/env node
// Mint a short-lived authenticated admin session over the SSH access the skill
// already has — NO password stored anywhere. Generates WordPress auth cookies
// server-side via WP-CLI (wp_generate_auth_cookie) for an existing admin, and
// writes them as a Playwright storageState file (gitignored) for admin.spec.ts.
//
//   node agent/skills/plugin-update/scripts/mint-admin-session.mjs [--env staging] [--allow-prod-write]
//
// It creates a REAL WP session token server-side (persisted ~2h in usermeta so
// the cookie validates) and binds short-lived auth cookies to it. Because a prod
// admin session is a real credential, it REFUSES `production` without
// --allow-prod-write (staging only by default).
// Output: <snapshotDir>/<env>.admin-state.json  (live cookies — never commit;
// snapshotDir is gitignored).

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadConfig, getEnv, buildSshArgv, snapshotDir } from "./lib/config.mjs";

const arg = (f, d) => {
  const i = process.argv.indexOf(f);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};

function main() {
  const envName = process.env.PLUGIN_UPDATE_ENV || arg("--env", "staging");
  if (envName === "production" && !process.argv.includes("--allow-prod-write")) {
    process.stderr.write(
      "mint-admin-session: REFUSING to mint a PRODUCTION admin session without --allow-prod-write.\n" +
        "  It persists a real ~2h admin login server-side. Run admin QA on staging; pass --allow-prod-write only with deliberate approval.\n",
    );
    process.exit(2);
  }
  const config = loadConfig();
  const env = getEnv(config, envName);
  const host = new URL(env.url).hostname; // hostname (no port) for the cookie domain

  // One read-only eval: pick an admin, compute the logged_in + secure_auth
  // cookies + COOKIEHASH + expiry. Nothing is written to the site.
  // Create a real session token (WP rejects cookies not bound to one since 4.0),
  // then bind both cookies to it. Short-lived (2h). Output JSON because the
  // cookie value itself contains "|" (username|expiration|token|hmac).
  const php =
    '$us=get_users(array("role"=>"administrator","number"=>1,"fields"=>"ID")); ' +
    '$uid=(int)(isset($us[0])?$us[0]:0); $e=time()+7200; ' +
    '$m=WP_Session_Tokens::get_instance($uid); $t=$m->create($e); ' +
    'echo json_encode(array(COOKIEHASH,$uid,wp_generate_auth_cookie($uid,$e,"logged_in",$t),wp_generate_auth_cookie($uid,$e,"secure_auth",$t),$e));';
  const { file, args } = buildSshArgv(env, ["eval", php]);
  const res = spawnSync(file, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (res.error) {
    process.stderr.write(`mint-admin-session: SSH/WP-CLI spawn failed: ${res.error.message}\n`);
    process.exit(1);
  }
  const out = res.stdout || "";
  const s = out.indexOf("["), e2 = out.lastIndexOf("]");
  let parsed = null;
  if (s !== -1 && e2 > s) { try { parsed = JSON.parse(out.slice(s, e2 + 1)); } catch {} }
  if (!parsed || parsed.length < 5) {
    process.stderr.write(`mint-admin-session: could not mint cookies (no admin user, or WP-CLI error).\n${res.stderr || out}\n`);
    process.exit(1);
  }
  const [hash, uid, loggedIn, secureAuth, exp] = parsed;
  if (!uid || uid === "0") {
    process.stderr.write("mint-admin-session: no administrator user found on this environment.\n");
    process.exit(1);
  }
  const expires = parseInt(exp, 10) || Math.floor(Date.now() / 1000) + 7200;
  const cookie = (name, value) => ({ name, value, domain: host, path: "/", expires, httpOnly: true, secure: true, sameSite: "Lax" });
  const storageState = {
    cookies: [cookie(`wordpress_logged_in_${hash}`, loggedIn), cookie(`wordpress_sec_${hash}`, secureAuth)],
    origins: [],
  };

  fs.mkdirSync(snapshotDir(config), { recursive: true });
  const outFile = path.join(snapshotDir(config), `${envName}.admin-state.json`);
  fs.writeFileSync(outFile, JSON.stringify(storageState, null, 2) + "\n");
  process.stdout.write(`mint-admin-session: wrote admin session for user ${uid} (expires 2h) → ${config.snapshotDir}/${envName}.admin-state.json\n`);
}

main();
