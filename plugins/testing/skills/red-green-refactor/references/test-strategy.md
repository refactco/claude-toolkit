# Test Strategy — Detecting & Running Unit Tests (WordPress)

How the `red-green-refactor` skill discovers the project's unit-test tooling, sets it up if it's missing, and runs the red→green→refactor loop. This harness currently runs **unit tests only** — there is no end-to-end / browser layer. The focus is **WordPress**: our WordPress application lives at `apps/wordpress/` (the **WordPress project root**), and its PHPUnit tests run inside the wp-env tests container.

> **Canonical test location — do not hunt for it.** Unit tests always live in **`tests/Unit/`** under the WordPress project root: `apps/wordpress/tests/Unit/`. **Never `cd` through plugin/theme directories looking for a `tests/` folder.** There is exactly one tests directory and it is at the project root. If it doesn't exist yet, create it there (§2b) — don't go searching for an alternative.

> When you need exact, current syntax for a framework (PHPUnit flags, wp-env commands), use the `find-docs` skill / `ctx7` rather than relying on memory — versions drift.

## Table of contents

1. The single test layer
2. Detecting / setting up the unit runner (WordPress)
3. Running the loop in practice
4. Watching a test fail for the right reason
5. Branching & commits

---

## 1. The single test layer

| Layer | Purpose | Speed | Scope | Tooling |
|---|---|---|---|---|
| **Unit** (the loop) | Drive & verify behaviour one step at a time; gate "done"; leave a regression suite behind | fast | a function/class/behaviour, booted against the WP test environment | PHPUnit **9.6** (pinned in `tests/composer.json`) via the wp-env tests container (`WP_UnitTestCase`) |

Write many small, fast unit tests. The slice's **acceptance criterion** (the Given/When/Then in the plan) is the human-readable definition of done — it is verified by the slice's unit tests plus a manual check, **not** by an automated browser/e2e test.

## 2. Detecting / setting up the unit runner (WordPress)

**Look in exactly one place: `apps/wordpress/tests/Unit/`.** Confirm WordPress (the repo has `apps/wordpress/` and/or a `.wp-env.json`), then check whether `apps/wordpress/tests/Unit/` exists. That single check is the whole detection step. **Do not `cd` into plugin/theme directories, and do not enumerate `wp-content/plugins/*` or `wp-content/themes/*` looking for `tests/` folders** — there is one tests directory, at the project root.

Tests run **inside the wp-env tests container** against an isolated tests database (`WP_UnitTestCase` wipes tables between tests — never point it at the dev instance). Nothing is installed on the host: the container provides PHP and Composer, and the WordPress PHPUnit test library lives at `/wordpress-phpunit` inside the container (wp-env sets `WP_TESTS_DIR` to it).

**Critical version rule:** the container also bundles a *global* `phpunit` binary, but it is PHPUnit **10.x** and the bundled WP test library still calls `PHPUnit\Util\Test::parseTestMethodAnnotations()`, which PHPUnit 10 removed — every test errors. **Never run the global `phpunit`.** PHPUnit is pinned to `^9.6` (with `yoast/phpunit-polyfills ^1.1`) in `apps/wordpress/tests/composer.json`, and every test command runs the pinned binary: `./vendor/bin/phpunit` with `--env-cwd=tests`.

### 2a. Harness already exists (the normal case) — new-machine bootstrap

The harness is committed at `apps/wordpress/tests/` (`phpunit.xml.dist`, `bootstrap.php`, `composer.json` + lock, `Unit/`). On a machine where tests have never run, do exactly these three steps — nothing else:

1. **Start the stack** (Docker Desktop must be running):

   ```bash
   npx wp-env start
   ```

   Run it in the background and wait for it to exit — the **first** start downloads images and can take ~10 minutes; later starts take ~30–60 s. Success looks like `WordPress test site started at …` and `✔ Done!`. wp-env 11.x starts **both** the dev and tests instances by default (it prints a deprecation warning about this — expected noise). Sanity check: `docker ps --format '{{.Names}}' | grep tests-wordpress`. Don't poll for a `tests-cli` container — that service is run-on-demand, not long-running.

   If the project was set up via refact-os: `/refact wp-env setup` **stops the tests instance by default** to save resources. TDD needs it — use `/refact wp-env setup --with-tests` (persists `wpEnv.withTests: true` in `.refact-os.json`).

2. **Install the test dependencies in the container** — required when `apps/wordpress/tests/vendor/` is absent (it's gitignored). Composer runs *inside* the container but writes through the bind mount onto the host, so this is once per clone; it survives container restarts and even `wp-env destroy`:

   ```bash
   npx wp-env run tests-cli --env-cwd=tests composer install
   ```

3. **Verify green:**

   ```bash
   npm run test:php   # = wp-env run tests-cli --env-cwd=tests ./vendor/bin/phpunit
   ```

   Expect `OK (N tests, N assertions)`. Expected noise that is **not** a failure: `PHP Warning: Constant WP_MEMORY_LIMIT already defined` (our `.wp-env.json` sets it; the WP test bootstrap re-defines it), and the `Installing...` / `Running as single site...` header (the suite reinstalls the tests-DB tables on every run; the dev DB is untouched).

If any step misbehaves, match the exact symptom in the table in §4 before debugging blind.

### 2b. No harness yet — scaffold it (legitimate first-slice / walking-skeleton work)

1. **Get the tests instance up** — see step 1 of §2a (same commands, same caveats).

2. **Make the tests dir visible inside the container.** This project's `.wp-env.json` uses `core: null` and maps only selected paths into `/var/www/html`. The WP project root itself is **not** mounted — files at `apps/wordpress/` (root level) do not exist in the container, and `--env-cwd=.` lands in WordPress core, where PHPUnit finds no config and just prints its help text. Add a **directory** mapping:

   ```json
   "mappings": {
     "...": "...",
     "tests": "./apps/wordpress/tests"
   }
   ```

   Two hard rules learned the painful way:
   - **Map directories only.** A single-file mapping (e.g. `"phpunit.xml.dist": "./apps/wordpress/phpunit.xml.dist"`) makes `wp-env start` fail on macOS Docker/virtiofs with an OCI `error mounting … is outside of rootfs` error. This is why *all* harness files live inside `tests/` rather than at the WP root.
   - **Mapping changes only apply after another `npx wp-env start`.** And if a start fails mid-way, the tests containers are left down — every later `wp-env run` then fails with `service "tests-cli" is not running`. Always read the start output.

3. **Create the harness files — all inside `apps/wordpress/tests/`** (use the committed files in this repo as templates):
   - `phpunit.xml.dist` — `bootstrap="bootstrap.php"`, one testsuite pointing at `./Unit`.
   - `bootstrap.php` — must do these in this order: (1) resolve `WP_TESTS_DIR` with fallback `/wordpress-phpunit`; (2) `require __DIR__ . '/vendor/autoload.php'` — the polyfills **must** load before the WP core bootstrap; (3) `tests_add_filter('muplugins_loaded', …)` requiring each plugin main file under test via `dirname(__DIR__) . '/wp-content/plugins/<slug>/<slug>.php'`; (4) `require $_tests_dir . '/includes/bootstrap.php'` last.
   - `composer.json` — pin `"phpunit/phpunit": "^9.6"` and `"yoast/phpunit-polyfills": "^1.1"` as `require-dev`. The polyfills are **not** bundled in the container, and polyfills 2.x pairs with PHPUnit 10 (which the WP test library can't run) — this exact pairing matters.
   - `.gitignore` — `/vendor/` and `.phpunit.result.cache`.
   - `Unit/` — the test files.

4. **Install the dev deps in the container** (not `composer require` at the WP root — there is no root `composer.json` and the root isn't mounted):

   ```bash
   npx wp-env run tests-cli --env-cwd=tests composer install
   ```

5. **Add the npm entry point** (`package.json` at the repo root):

   ```json
   "scripts": {
     "test:php": "wp-env run tests-cli --env-cwd=tests ./vendor/bin/phpunit"
   }
   ```

6. **Git hygiene:** `apps/wordpress/.gitignore` ignores `wp-content/plugins/*` — a new plugin must be allowlisted (`!wp-content/plugins/<slug>/`) or `git add` refuses it. Commit `tests/composer.lock`; never commit `tests/vendor/` or `.phpunit.result.cache`.

### Conventions

- **Test runner** (full suite, also the pre-commit check):
  ```bash
  npm run test:php
  # equivalently:
  npx wp-env run tests-cli --env-cwd=tests ./vendor/bin/phpunit
  ```
  (The official docs show `cli`; use `tests-cli` so it's explicit the run depends on the tests instance being up.)
- **Run a single test** (the inner-loop default, for speed):
  ```bash
  npx wp-env run tests-cli --env-cwd=tests ./vendor/bin/phpunit --filter test_method_name
  ```
- **Test file naming: the file name must equal the class name.** `WalkingSkeletonTest.php` declares `class WalkingSkeletonTest extends WP_UnitTestCase`. Do **not** use the legacy WP `test-*.php` / `Test_Feature` convention — PHPUnit (9.6+ as configured here) derives the class from the filename and reports `Class test-foo cannot be found … No tests executed!`. Method naming stays WP-style: `public function test_does_thing()`.
- **Bootstrap:** `apps/wordpress/tests/bootstrap.php` (contract in §2b step 3). When a new plugin comes under test, add its `require` to the existing loader callback — don't create a second bootstrap.
- **Assertion style:** standard PHPUnit assertions plus WordPress helpers — `$this->assertSame($expected, $actual)`, and the WP fixture factory for data: `$post_id = self::factory()->post->create();`. Prefer `assertSame` over `assertEquals` (strict, no type juggling).
- **`wp-env run` takes a real executable, not a shell string.** `npx wp-env run tests-cli "pwd; ls"` fails with exit 127 (`executable file not found in $PATH`). For compound commands use `bash -c '…'`; otherwise run separate commands.
- **Project structure** (host ↔ container):
  ```
  apps/wordpress/                   ← WordPress project root (NOT itself mounted in the container)
    wp-content/                     ← mounted at /var/www/html/wp-content
      plugins/<slug>/<slug>.php     ← code under test, required by tests/bootstrap.php
    tests/                          ← mounted at /var/www/html/tests (mapping in .wp-env.json)
      phpunit.xml.dist              ← bootstrap="bootstrap.php"; suite dir ./Unit
      bootstrap.php                 ← polyfills autoload → WP test lib → plugin require(s)
      composer.json                 ← pins phpunit ^9.6 + yoast/phpunit-polyfills ^1.1
      composer.lock                 ← committed
      .gitignore                    ← /vendor/  .phpunit.result.cache
      vendor/                       ← composer install output (on the host via the mount; gitignored)
      Unit/
        WalkingSkeletonTest.php     ← file name == class name
  ```
  Inside the container, `tests/` and `wp-content/` are siblings under `/var/www/html`, mirroring `apps/wordpress/` on the host — that's why `dirname(__DIR__) . '/wp-content/plugins/…'` in the bootstrap resolves in both worlds.

> **The tests containers must be running for every Red and Green run** — the runner shells into Docker. If `wp-env run` errors with `service "tests-cli" is not running` or "no such container", run `npx wp-env start` (in the background; wait for `✔ Done!`) and read its output for mount errors. See the `wp-env` skill for the stack itself.

**Rule:** prefer the entry point the project already defines (`npm run test:php`, `tests/phpunit.xml.dist`) over inventing a command — it encodes the project's intended invocation.

## 3. Running the loop in practice

- **Project directory:** the WordPress app lives at `apps/wordpress/` (the WordPress project root), with tests at `apps/wordpress/tests/Unit/` and the code under test under `apps/wordpress/wp-content/`. Record `apps/wordpress/` in the plan's **Project directory** field. All test commands run the pinned binary in the tests container: `npx wp-env run tests-cli --env-cwd=tests ./vendor/bin/phpunit …`. The git branch is still cut at the repo root.
- **Inner loop:** run just the single test(s) for the behaviour under development (`… ./vendor/bin/phpunit --filter test_method_name`) for a fast red→green→refactor rhythm.
- **Full green check:** before committing a slice, run the whole suite (`npm run test:php`) and confirm it's green.

## 4. Watching a test fail for the right reason

Never skip the red step. After writing a test, run it and read the failure:
- A **good** red: the assertion fails because the behaviour/feature is genuinely absent (e.g. `Failed asserting that false is true`, or the unregistered shortcode passing through literally).
- A **bad** red: a PHP fatal/parse error, a missing class/autoload, a container that isn't running, or a misconfigured bootstrap. Fix the test/harness until it fails for the *intended* reason, then proceed. "If you cannot articulate why a test fails, you do not yet understand the requirement."

**Known bad-red signatures** (every one of these was hit while standing up this harness — match the symptom before debugging blind):

| Symptom (exact output) | Actual cause | Fix |
|---|---|---|
| `phpunit` dumps its own help/usage text; nothing runs | No `phpunit.xml.dist` at the cwd — wrong `--env-cwd` (the WP root isn't mounted in the container) | Run with `--env-cwd=tests` |
| `service "tests-cli" is not running` / "no such container" | Tests instance down, or the last `wp-env start` failed (e.g. a bad mapping) | `npx wp-env start`; read its output for mount errors |
| `The PHPUnit Polyfills library is a requirement for running the WP test suite.` | `tests/vendor/` missing on this machine | `npx wp-env run tests-cli --env-cwd=tests composer install` |
| `Error: Call to undefined method PHPUnit\Util\Test::parseTestMethodAnnotations()` | Ran the container's **global** PHPUnit 10 | Run `./vendor/bin/phpunit` (pinned 9.6) |
| `Class <name> cannot be found in …/<file>.php` + `No tests executed!` | Test file name ≠ class name | Rename so `FooTest.php` declares `class FooTest` |
| `error mounting … is outside of rootfs` during `wp-env start` | Single-**file** mapping in `.wp-env.json` | Map directories only; keep harness files inside `tests/` |
| exit 127, `executable file not found in $PATH` | Passed a shell string (`"pwd; ls"`) to `wp-env run` | Use `bash -c '…'` or separate commands |

**Harmless noise — not a red:** `Constant WP_MEMORY_LIMIT already defined` warnings, wp-env's deprecation warning about starting both environments, and the `Installing...` / `Running as single site...` header on each run.

## 5. Branching & commits

- **One feature branch for the whole feature** (not one per slice) — `feat/<feature-slug>`, cut from the **source branch**: the first of `stage`, `staging`, `main` that exists.

  ```bash
  # pick the base branch: stage → staging → main (first that exists, local or origin)
  for b in stage staging main; do
    if git rev-parse --verify --quiet "$b" >/dev/null || git rev-parse --verify --quiet "origin/$b" >/dev/null; then
      BASE="$b"; break
    fi
  done
  git switch -c feat/<feature-slug> "$BASE"   # or origin/$BASE if base is remote-only
  ```

  Record the chosen `BASE` (the source branch) in the plan — `tdd` opens the PR back into it.
- **Commit once per slice**, after that slice's refactor is done and the full suite is green. Conventional Commits, e.g. `feat(<feature-slug>): <slice goal> [slice NN]` (`test:` for a commit that's only the failing test, `refactor:` for cleanup-only). Keep commits small and green-only.
- **Never commit a red bar.** (Solo across sessions, you may *leave* a red test in the working tree as a resume marker — but don't commit it.)
