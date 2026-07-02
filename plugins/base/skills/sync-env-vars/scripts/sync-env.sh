#!/usr/bin/env bash
#
# sync-env.sh - keep a local .env and the project's 1Password item aligned.
#
# Primary command:
#   sync            Pick the newer complete value source (.env or 1Password),
#                   mirror it to the older source, and regenerate .env.example.
#
# Advanced commands retained for diagnostics:
#   diff            Compare .env and the 1Password item, showing a value preview (first 5 chars).
#   keys-diff       Compare .env and .env.example key sets.
#   push <KEY>      Push one non-empty .env value to 1Password.

set -euo pipefail

CMD="${1:-}"
if [ $# -gt 0 ]; then shift; fi

# Track whether the caller pinned the location (via flag or env var). When it is
# not pinned, the script resolves the single correct env directory instead of
# blindly defaulting to the repo root. See resolve_env_dir / maybe_resolve_paths.
PATHS_EXPLICIT=0
[ -n "${ENV_FILE:-}" ] && PATHS_EXPLICIT=1
[ -n "${EXAMPLE_FILE:-}" ] && PATHS_EXPLICIT=1
ENV_FILE="${ENV_FILE:-.env}"
EXAMPLE_FILE="${EXAMPLE_FILE:-.env.example}"
FIXED_VAULT="Env Variables & Secrets"
PROJECT_OVERRIDE="${PROJECT_ITEM:-}"
ASSUME_YES="${SYNC_ENV_ASSUME_YES:-0}"
SOURCE_OVERRIDE=""
VAULT_ID=""
ITEM_ID=""

die() { echo "ERROR: $*" >&2; exit 1; }
warn() { echo "WARN: $*" >&2; }

usage() {
  die "usage: sync-env.sh {sync [--yes] [--source env|vault] [--project <item>] [--env-file <path>] [--example-file <path>]|diff|keys-diff|push <KEY>}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --yes)
      ASSUME_YES=1
      shift
      ;;
    --source)
      SOURCE_OVERRIDE="${2:-}"
      [ "$SOURCE_OVERRIDE" = "env" ] || [ "$SOURCE_OVERRIDE" = "vault" ] || die "--source must be env or vault"
      shift 2
      ;;
    --project)
      PROJECT_OVERRIDE="${2:-}"
      [ -n "$PROJECT_OVERRIDE" ] || die "--project requires a 1Password item title"
      shift 2
      ;;
    --env-file)
      ENV_FILE="${2:-}"
      [ -n "$ENV_FILE" ] || die "--env-file requires a path"
      PATHS_EXPLICIT=1
      shift 2
      ;;
    --example-file)
      EXAMPLE_FILE="${2:-}"
      [ -n "$EXAMPLE_FILE" ] || die "--example-file requires a path"
      PATHS_EXPLICIT=1
      shift 2
      ;;
    *)
      if [ "$CMD" = "push" ] && [ -z "${PUSH_KEY:-}" ]; then
        PUSH_KEY="$1"
        shift
      else
        usage
      fi
      ;;
  esac
done

require_op() {
  command -v op >/dev/null 2>&1 || die "1Password CLI (op) not installed"
  op whoami >/dev/null 2>&1 || die "op not authenticated. Set OP_SERVICE_ACCOUNT_TOKEN in your shell."
}

require_jq() {
  command -v jq >/dev/null 2>&1 || die "jq not installed (needed for env sync). Install with 'brew install jq'."
}

to_pascal() {
  local raw word out=""
  raw="${1//[^A-Za-z0-9]/ }"
  for word in $raw; do
    out="${out}$(printf '%s' "${word:0:1}" | tr '[:lower:]' '[:upper:]')${word:1}"
  done
  printf '%s' "$out"
}

# Build the default 1Password item title from the resolved env-file location.
# Rules (see sync-env-vars SKILL.md "1Password Item Naming Rules"):
#   - root  .env.example  -> "<Project> - Local"
#   - apps/<app>/...      -> "<Project>/<App> - Local"
#   - other nested dirs   -> "<Project>/<Parent> - Local"
project_from_name() {
  local project env_dir first second parent suffix=""
  project="$(to_pascal "$(basename "$PWD")")"
  [ -n "$project" ] || project="Project"

  env_dir="$(dirname "${ENV_FILE:-.env}")"
  env_dir="${env_dir#./}"

  if [ -z "$env_dir" ] || [ "$env_dir" = "." ]; then
    printf '%s - Local' "$project"
    return 0
  fi

  first="${env_dir%%/*}"
  if [ "$first" = "apps" ] && [ "$env_dir" != "apps" ]; then
    second="${env_dir#apps/}"
    second="${second%%/*}"
    suffix="$(to_pascal "$second")"
  else
    parent="${env_dir##*/}"
    suffix="$(to_pascal "$parent")"
  fi

  [ -n "$suffix" ] || { printf '%s - Local' "$project"; return 0; }
  printf '%s/%s - Local' "$project" "$suffix"
}

# Print the unique directories (relative to CWD, "." for root) that contain a
# file named $1, ignoring dependency/build noise and apps/wordpress.
find_env_dirs() {
  find . -type f -name "$1" \
    -not -path '*/node_modules/*' \
    -not -path '*/.git/*' \
    -not -path '*/.next/*' \
    -not -path '*/dist/*' \
    -not -path '*/build/*' \
    -not -path '*/vendor/*' \
    -not -path '*/apps/wordpress/*' 2>/dev/null \
    | sed -e 's#/[^/]*$##' -e 's#^\./##' -e 's#^$#.#' \
    | sort -u
}

# Env accessor patterns, kept identical to the skill's "Codebase Discovery
# Search Method" so file-location detection and key extraction agree.
ENV_ACCESSOR_PATTERNS=(
  -e 'process\.env\.[A-Z0-9_]+'
  -e "process\.env\[['\"][A-Z0-9_]+['\"]\]"
  -e 'import\.meta\.env\.[A-Z0-9_]+'
  -e "os\.environ(\.get)?\(['\"][A-Z0-9_]+['\"]"
  -e "os\.getenv\(['\"][A-Z0-9_]+['\"]"
  -e "getenv\(['\"][A-Z0-9_]+['\"]"
  -e "ENV\[['\"][A-Z0-9_]+['\"]\]"
  -e "\benv\(['\"][A-Z0-9_]+['\"]"
)

# Print the top-level segments (first path component under CWD, "." for files at
# the root) of every file that reads an env var. Used only when no .env or
# .env.example exists yet, to place the file where env vars are actually used.
# .cursor, .claude, and agents are excluded: they contain tooling/skill files
# that reference accessor patterns as documentation, not actual app code.
find_accessor_top_segments() {
  command -v rg >/dev/null 2>&1 || return 0
  rg -l --no-messages "${ENV_ACCESSOR_PATTERNS[@]}" \
    -g '!node_modules' -g '!.git' -g '!.next' -g '!dist' -g '!build' \
    -g '!vendor' -g '!apps/wordpress/**' \
    -g '!.cursor/**' -g '!.claude/**' -g '!agent/**' . 2>/dev/null \
    | sed -e 's#^\./##' \
    | awk -F/ '{ if (NF > 1) print $1; else print "." }' \
    | sort -u
}

# Resolve the single directory where the repo's .env belongs. Priority:
#   1. an existing .env.example  (strongest: it declares the keys)
#   2. an existing .env
#   3. the directory where env accessors live (Codebase Discovery patterns)
#   4. the repo root as a last resort
# If a step yields more than one candidate the location is ambiguous: stop and
# ask the caller to pin it with --env-file/--example-file rather than guessing.
resolve_env_dir() {
  local dirs n
  dirs="$(find_env_dirs '.env.example')"
  [ -n "$dirs" ] || dirs="$(find_env_dirs '.env')"
  [ -n "$dirs" ] || dirs="$(find_accessor_top_segments)"
  [ -n "$dirs" ] || { printf '.\n'; return 0; }

  n="$(printf '%s\n' "$dirs" | grep -c .)"
  if [ "$n" -gt 1 ]; then
    warn "Multiple candidate env locations found:"
    printf '  %s\n' $dirs >&2
    die "Ambiguous env location. Re-run pinning one site, e.g.: --env-file <dir>/.env --example-file <dir>/.env.example"
  fi
  printf '%s\n' "$dirs"
}

# When the caller did not pin paths, point ENV_FILE/EXAMPLE_FILE at the resolved
# directory so the script never silently writes env files to the repo root.
maybe_resolve_paths() {
  [ "$PATHS_EXPLICIT" = "1" ] && return 0
  local dir
  dir="$(resolve_env_dir)"
  if [ "$dir" = "." ] || [ -z "$dir" ]; then
    ENV_FILE=".env"
    EXAMPLE_FILE=".env.example"
  else
    ENV_FILE="$dir/.env"
    EXAMPLE_FILE="$dir/.env.example"
  fi
  echo "Env location: ${dir:-.} (.env -> $ENV_FILE)"
}

read_example_header() {
  local name="$1"
  [ -f "$EXAMPLE_FILE" ] || return 0
  awk -v name="$name" '
    BEGIN { target=tolower(name) }
    tolower($0) ~ "^[[:space:]]*#[[:space:]]*" target ":" {
      sub(/^[^:]*:[[:space:]]*/, "")
      print
      exit
    }
  ' "$EXAMPLE_FILE"
}

ensure_headers() {
  local existing_project project tmp
  existing_project="$(read_example_header "1password_project" || true)"
  project="${PROJECT_OVERRIDE:-${existing_project:-$(project_from_name)}}"
  VAULT="$FIXED_VAULT"
  PROJECT="$project"

  [ -f "$EXAMPLE_FILE" ] || return 0

  tmp="$(mktemp)"
  {
    printf '# 1password_vault: %s\n' "$VAULT"
    printf '# 1password_project: %s\n' "$PROJECT"
    awk '
      BEGIN { skipped=0 }
      /^[[:space:]]*#[[:space:]]*1password_(vault|project):/ { skipped=1; next }
      {
        if (skipped == 1 && emitted_blank != 1) {
          print ""
          emitted_blank=1
        }
        print
      }
    ' "$EXAMPLE_FILE"
  } > "$tmp"
  mv "$tmp" "$EXAMPLE_FILE"
}

load_headers() {
  ensure_headers
  VAULT="$FIXED_VAULT"
  PROJECT="$(read_example_header "1password_project" || true)"
  PROJECT="${PROJECT_OVERRIDE:-$PROJECT}"
  [ -n "$PROJECT" ] || PROJECT="$(project_from_name)"
}

# Print "KEY<TAB>VALUE" for each assignment in a dotenv file. User-facing commands
# only surface a short value preview (first 5 chars) via compare_plan.
parse_env() {
  local f="$1"
  [ -f "$f" ] || return 0
  local line key raw lineno=0
  while IFS= read -r line || [ -n "$line" ]; do
    lineno=$((lineno + 1))
    case "${line#"${line%%[![:space:]]*}"}" in ''|'#'*) continue ;; esac

    if [[ "$line" =~ ^[[:space:]]*export[[:space:]] ]]; then
      warn "$f:$lineno: \"export \" prefix is not supported; line skipped. Use bare KEY=VALUE."
      continue
    fi

    [[ "$line" == *=* ]] || continue
    key="${line%%=*}"
    raw="${line#*=}"
    key="${key//[[:space:]]/}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue

    if [[ "$raw" != \"*\" && "$raw" != \'*\' && "$raw" =~ [[:space:]]\# ]]; then
      warn "$f:$lineno: $key has an inline \"# ...\" comment; the whole value is used."
    fi

    raw="${raw%\"}"; raw="${raw#\"}"; raw="${raw%\'}"; raw="${raw#\'}"
    printf '%s\t%s\n' "$key" "$raw"
  done < "$f"
}

env_value() {
  local _val
  _val="$(awk -F'\t' -v k="$1" '$1==k {sub(/^[^\t]*\t/,""); print; exit}' < <(parse_env "$ENV_FILE") 2>/dev/null)" || true
  printf '%s' "$_val"
}

file_mtime() {
  local f="$1"
  [ -f "$f" ] || return 1
  if stat -f %m "$f" >/dev/null 2>&1; then
    stat -f %m "$f"
  else
    stat -c %Y "$f"
  fi
}

date_to_epoch() {
  local ts="$1" body tz
  [ -n "$ts" ] || return 1
  # GNU date understands full ISO 8601 (offset and fractional seconds) directly.
  # -d is a GNU-only flag; BSD/macOS date rejects it, so this is skipped there.
  if date -d "$ts" +%s >/dev/null 2>&1; then
    date -d "$ts" +%s
    return 0
  fi
  # BSD/macOS date: split off any fractional seconds and the timezone
  # designator, then parse with %z. Critically, preserve the real offset
  # (e.g. +03:30) instead of discarding it and assuming UTC.
  if [[ "$ts" =~ ^(.*T[0-9]{2}:[0-9]{2}:[0-9]{2})(\.[0-9]+)?(Z|[+-][0-9]{2}:?[0-9]{2})$ ]]; then
    body="${BASH_REMATCH[1]}"
    tz="${BASH_REMATCH[3]}"
    if [ "$tz" = "Z" ]; then
      tz="+0000"
    else
      tz="${tz/:/}"
    fi
    date -j -u -f "%Y-%m-%dT%H:%M:%S%z" "${body}${tz}" +%s 2>/dev/null
  else
    # No timezone information present: assume UTC.
    body="${ts%%.*}"
    date -j -u -f "%Y-%m-%dT%H:%M:%S" "$body" +%s 2>/dev/null
  fi
}

# True only when op's stderr indicates the item genuinely does not exist,
# as opposed to a transient/auth/rate-limit failure that must not be treated
# as "no item" (otherwise sync builds a wrong all-ADD plan or duplicates items).
op_err_is_not_found() {
  printf '%s' "$1" | grep -qiE "isn'?t an item|not found|no item matched|doesn'?t exist|no object matched"
}

# Print current service-account rate-limit usage to stderr (best effort).
# Only called on the failure path to turn an opaque "Forbidden" into something
# actionable. May itself make one request, which is acceptable when already failing.
ratelimit_hint() {
  command -v op >/dev/null 2>&1 || return 0
  local out
  out="$(op service-account ratelimit 2>/dev/null)" || return 0
  [ -n "$out" ] || return 0
  warn "Current 1Password service account rate-limit usage:"
  printf '%s\n' "$out" >&2
}

# Fetch the project item as JSON.
# - Success: prints JSON.
# - Genuine "item not found": prints nothing, returns 0 (caller treats as no item).
# - Any other failure (Forbidden, rate limit, network): dies with the real error
#   instead of silently masking it as an empty vault.
fetch_vault_json() {
  local out err rc msg target vault_ref
  err="$(mktemp)"
  target="${ITEM_ID:-$PROJECT}"
  vault_ref="${VAULT_ID:-$VAULT}"
  out="$(op item get "$target" --vault "$vault_ref" --format json 2>"$err")" && rc=0 || rc=$?
  if [ "$rc" -eq 0 ] && [ -n "$out" ]; then
    rm -f "$err"
    printf '%s' "$out"
    return 0
  fi
  msg="$(cat "$err")"
  rm -f "$err"
  if op_err_is_not_found "$msg"; then
    return 0
  fi
  warn "1Password lookup for '$PROJECT' failed: ${msg:-unknown error}"
  ratelimit_hint
  die "Could not read the 1Password item (transient API/auth error, not 'not found'). Aborting to avoid a wrong sync plan; re-run sync."
}

vault_updated_epoch() {
  local json="$1" ts
  [ -n "$json" ] || return 1
  ts="$(printf '%s' "$json" | jq -r '.updatedAt // .updated_at // .lastEditedAt // empty')"
  date_to_epoch "$ts"
}

vault_fields() {
  local json="$1"
  [ -n "$json" ] || return 0
  printf '%s' "$json" | jq -r '
    .fields[]?
    | select((.label // "") | test("^[A-Za-z_][A-Za-z0-9_]*$"))
    | select((.value // "") != "")
    | [.label, (.value // "")] | @tsv
  '
}

kv_keys() {
  cut -f1 "$1" | sort -u
}

empty_value_keys() {
  awk -F'\t' 'NF == 1 || $2 == "" { print $1 }' "$1"
}

secret_like_key() {
  [[ "$1" =~ (^|_)(SECRET|PASSWORD|PASS|TOKEN|PRIVATE|API_KEY|ACCESS_KEY|CLIENT_SECRET|JWT|SESSION|COOKIE|SALT|DSN)(_|$) ]] \
    || [[ "$1" =~ (DATABASE_URL|DB_URL|REDIS_URL|MONGO_URL|PRIVATE_KEY)$ ]]
}

dotenv_value() {
  local val="$1"
  if [[ "$val" =~ ^[A-Za-z0-9_./:@%+=,-]*$ ]]; then
    printf '%s' "$val"
  else
    val="${val//\\/\\\\}"
    val="${val//\"/\\\"}"
    val="${val//\$/\\\$}"
    val="${val//\`/\\\`}"
    printf '"%s"' "$val"
  fi
}

write_env_file() {
  local kv="$1" tmp key val
  tmp="$(mktemp)"
  while IFS=$'\t' read -r key val; do
    [ -n "$key" ] || continue
    printf '%s=%s\n' "$key" "$(dotenv_value "$val")" >> "$tmp"
  done < <(sort -u "$kv")
  mv "$tmp" "$ENV_FILE"
}

write_example_file() {
  local kv="$1" tmp old_kv key val default
  tmp="$(mktemp)"
  old_kv="$(mktemp)"
  parse_env "$EXAMPLE_FILE" > "$old_kv" 2>/dev/null || true

  {
    printf '# 1password_vault: %s\n' "$VAULT"
    printf '# 1password_project: %s\n\n' "$PROJECT"
    while IFS=$'\t' read -r key val; do
      [ -n "$key" ] || continue
      if secret_like_key "$key"; then
        printf '%s=\n' "$key"
      else
        default="$(awk -F'\t' -v k="$key" '$1==k {sub(/^[^\t]*\t/,""); print; exit}' "$old_kv")"
        printf '%s=%s\n' "$key" "$(dotenv_value "$default")"
      fi
    done < <(sort -u "$kv")
  } > "$tmp"
  mv "$tmp" "$EXAMPLE_FILE"
  rm -f "$old_kv"
}

compare_plan() {
  local source="$1" target="$2" target_name="$3"
  awk -F'\t' -v target="$target_name" '
    function preview(v,   p) {
      p = substr(v, 1, 5)
      if (length(v) > 5) p = p "..."
      return p
    }
    FNR==NR { s[$1]=$2; keys[$1]=1; next }
    { t[$1]=$2; keys[$1]=1 }
    END {
      for (k in keys) {
        if ((k in s) && !(k in t)) printf "ADD_TO_%s\t%s\t%s\n", target, k, preview(s[k])
        else if ((k in s) && (k in t) && s[k] != t[k]) printf "CHANGE_IN_%s\t%s\t%s\n", target, k, preview(s[k])
        else if (!(k in s) && (k in t)) printf "REMOVE_FROM_%s\t%s\t%s\n", target, k, preview(t[k])
        else printf "SAME\t%s\t%s\n", k, preview(s[k])
      }
    }
  ' "$source" "$target" | sort -t$'\t' -k2
}

confirm_vault_replacement() {
  [ "$ASSUME_YES" = "1" ] && return 0
  echo
  echo "Vault replacement requires explicit confirmation."
  echo "Re-run after user confirmation with SYNC_ENV_ASSUME_YES=1 or --yes."
  echo "This may add, overwrite, and delete fields in '$PROJECT' in '$VAULT'."
  exit 3
}

apply_env_to_vault() {
  local source_kv="$1" target_kv="$2" key val
  local item_ref="${ITEM_ID:-$PROJECT}" vault_ref="${VAULT_ID:-$VAULT}"
  local edits=() assignments=() item_exists=0

  # Decide edit vs create. Re-verify existence only when we read no fields, so a
  # transient read error earlier can never make us create a duplicate item.
  if [ -s "$target_kv" ]; then
    item_exists=1
  elif op item get "$PROJECT" --vault "$VAULT" >/dev/null 2>&1; then
    item_exists=1
  fi

  if [ "$item_exists" -eq 1 ]; then
    while IFS= read -r key; do
      [ -n "$key" ] || continue
      edits+=("${key}[delete]")
    done < <(comm -13 <(kv_keys "$source_kv") <(kv_keys "$target_kv"))

    while IFS=$'\t' read -r key val; do
      [ -n "$key" ] || continue
      edits+=("${key}[password]=${val}")
    done < "$source_kv"

    # One edit call for all add/change/delete actions instead of one request per
    # key, to stay well under service-account rate limits.
    if [ "${#edits[@]}" -gt 0 ]; then
      op item edit "$item_ref" --vault "$vault_ref" "${edits[@]}" >/dev/null
    fi
  else
    while IFS=$'\t' read -r key val; do
      [ -n "$key" ] || continue
      assignments+=("${key}[password]=${val}")
    done < "$source_kv"
    op item create --category "Secure Note" --vault "$VAULT" --title "$PROJECT" "${assignments[@]}" >/dev/null
  fi
}

bootstrap_message() {
  cat <<EOF
BOOTSTRAP_REQUIRED
No local .env and no known 1Password item were found for '$PROJECT'.

Choose one bootstrap path:
1. Provide an existing 1Password item title, then run:
   .claude/scripts/sync-env.sh sync --project "<exact item title>"
2. Discover env keys from the codebase, collect values from the user, create .env, then run:
   .claude/scripts/sync-env.sh sync --yes
EOF
}

run_sync() {
  require_op
  require_jq
  maybe_resolve_paths
  load_headers

  local tmpdir env_kv vault_kv vault_json env_exists vault_exists env_time vault_time source empty_keys plan_target
  tmpdir="$(mktemp -d)"
  SYNC_ENV_TMPDIR="$tmpdir"
  trap 'rm -rf "${SYNC_ENV_TMPDIR:-}"' EXIT
  env_kv="$tmpdir/env.tsv"
  vault_kv="$tmpdir/vault.tsv"

  parse_env "$ENV_FILE" > "$env_kv"
  env_exists=0
  [ -f "$ENV_FILE" ] && env_exists=1

  vault_json="$(fetch_vault_json)"
  vault_exists=0
  [ -n "$vault_json" ] && vault_exists=1
  if [ "$vault_exists" -eq 1 ]; then
    VAULT_ID="$(printf '%s' "$vault_json" | jq -r '.vault.id // empty')"
    ITEM_ID="$(printf '%s' "$vault_json" | jq -r '.id // empty')"
  fi
  vault_fields "$vault_json" > "$vault_kv"

  if [ "$env_exists" -eq 0 ] && [ "$vault_exists" -eq 0 ]; then
    bootstrap_message
    exit 4
  fi

  if [ -n "$SOURCE_OVERRIDE" ]; then
    source="$SOURCE_OVERRIDE"
  elif [ "$env_exists" -eq 1 ] && [ "$vault_exists" -eq 0 ]; then
    source="env"
  elif [ "$env_exists" -eq 0 ] && [ "$vault_exists" -eq 1 ]; then
    source="vault"
  else
    env_time="$(file_mtime "$ENV_FILE" || true)"
    vault_time="$(vault_updated_epoch "$vault_json" || true)"
    if [ -z "$env_time" ] || [ -z "$vault_time" ] || [ "$env_time" = "$vault_time" ]; then
      echo "AMBIGUOUS_DIRECTION"
      echo "Could not determine whether .env or 1Password was edited last."
      echo "Re-run with --source env or --source vault after the user chooses which source should win."
      exit 5
    elif [ "$env_time" -gt "$vault_time" ]; then
      source="env"
    else
      source="vault"
    fi
  fi

  echo "Vault:   $VAULT"
  echo "Project: $PROJECT"
  echo "Source:  $source"
  echo

  if [ "$source" = "env" ]; then
    empty_keys="$(empty_value_keys "$env_kv" | tr '\n' ' ')"
    if [ -n "$empty_keys" ]; then
      echo "EMPTY_VALUES_IN_ENV"
      echo "Refusing to mirror empty .env values to 1Password: $empty_keys"
      echo "Fill the values or remove those keys from .env before syncing."
      exit 6
    fi
    echo "Replacement plan for 1Password (STATUS<tab>KEY<tab>value preview, first 5 chars):"
    compare_plan "$env_kv" "$vault_kv" "VAULT"
    confirm_vault_replacement
    apply_env_to_vault "$env_kv" "$vault_kv"
    write_example_file "$env_kv"
    echo
    echo "Synced .env -> 1Password and regenerated $EXAMPLE_FILE."
  else
    echo "Replacement plan for .env (STATUS<tab>KEY<tab>value preview, first 5 chars):"
    compare_plan "$vault_kv" "$env_kv" "ENV"
    write_env_file "$vault_kv"
    write_example_file "$vault_kv"
    echo
    echo "Synced 1Password -> $ENV_FILE and regenerated $EXAMPLE_FILE."
  fi
}

case "$CMD" in
  sync)
    run_sync
    ;;

  diff)
    require_op
    require_jq
    maybe_resolve_paths
    load_headers
    vault_json="$(fetch_vault_json)"
    tmpdir="$(mktemp -d)"
    SYNC_ENV_TMPDIR="$tmpdir"
    trap 'rm -rf "${SYNC_ENV_TMPDIR:-}"' EXIT
    parse_env "$ENV_FILE" > "$tmpdir/env.tsv"
    vault_fields "$vault_json" > "$tmpdir/vault.tsv"
    echo "Vault:   $VAULT"
    echo "Project: $PROJECT"
    compare_plan "$tmpdir/env.tsv" "$tmpdir/vault.tsv" "VAULT"
    ;;

  keys-diff)
    maybe_resolve_paths
    [ -f "$ENV_FILE" ] || die "$ENV_FILE not found"
    [ -f "$EXAMPLE_FILE" ] || die "$EXAMPLE_FILE not found"
    envk="$(parse_env "$ENV_FILE" | cut -f1 | sort -u)"
    exk="$(parse_env "$EXAMPLE_FILE" | cut -f1 | sort -u)"
    comm -23 <(printf '%s\n' "$envk") <(printf '%s\n' "$exk") | sed 's/^/ONLY_ENV      /'
    comm -13 <(printf '%s\n' "$envk") <(printf '%s\n' "$exk") | sed 's/^/ONLY_EXAMPLE  /'
    ;;

  push)
    require_op
    maybe_resolve_paths
    load_headers
    key="${PUSH_KEY:-}"
    [ -n "$key" ] || die "usage: push <KEY>"
    val="$(env_value "$key")"
    [ -n "$val" ] || die "$key has no value in $ENV_FILE; refusing to push empty"
    if op item get "$PROJECT" --vault "$VAULT" >/dev/null 2>&1; then
      op item edit "$PROJECT" --vault "$VAULT" "${key}[password]=${val}" >/dev/null
      echo "pushed $key -> op://${VAULT}/${PROJECT}/${key}"
    else
      op item create --category "Secure Note" --vault "$VAULT" --title "$PROJECT" "${key}[password]=${val}" >/dev/null
      echo "created item '$PROJECT' and pushed $key"
    fi
    ;;

  *)
    usage
    ;;
esac
