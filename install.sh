#!/usr/bin/env bash
# install.sh — bootstrap the complete Tenon plugin for one selected host.
#
# This script is part of the same repository release, not a second package manager.  Once the
# native plugin is installed, all routine setup is the normal `tenon setup --<host>` interface.
set -euo pipefail

MARKETPLACE_SOURCE="jefferysha/tenon"
MARKETPLACE_NAME="tenon"
TENON_RELEASE_VERSION="1.0.2"
HOST=""
AUTO_UPDATE=0
DRY_RUN=0
REF_EXPLICIT=0
MARKETPLACE_REF="v${TENON_RELEASE_VERSION}"

usage() {
  cat <<'USAGE'
Usage: install.sh --codex|--claude [--ref <vX.Y.Z>] [--auto-update] [--dry-run]

Installs the complete Tenon plugin into the selected native marketplace, then runs the packaged
`tenon setup --<host>`. Other hosts are adapters and should be deployed from an
already installed Codex or Claude package with `tenon setup --cursor` (and similar flags).
`--dry-run` prints the complete host and packaged setup plan without invoking either host.
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --codex|--claude)
      [ -z "$HOST" ] || { echo "install.sh: choose exactly one host" >&2; exit 2; }
      HOST="${1#--}"
      ;;
    --auto-update) AUTO_UPDATE=1 ;;
    --ref)
      [ $# -ge 2 ] || { echo "install.sh: --ref requires a value" >&2; exit 2; }
      MARKETPLACE_REF="$2"
      REF_EXPLICIT=1
      shift
      ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "install.sh: unsupported argument $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done
[ -n "$HOST" ] || { usage >&2; exit 2; }
[[ "$MARKETPLACE_REF" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || {
  echo "install.sh: --ref must be a complete stable tag vX.Y.Z; got $MARKETPLACE_REF" >&2
  exit 2
}
[ "$HOST" = codex ] || [ "$REF_EXPLICIT" = 0 ] || {
  echo "install.sh: --ref is supported only for Codex Marketplace installs" >&2
  exit 2
}
[ "$MARKETPLACE_REF" = "v${TENON_RELEASE_VERSION}" ] || {
  echo "install.sh: this v${TENON_RELEASE_VERSION} installer can only install v${TENON_RELEASE_VERSION}; fetch the installer from the requested release tag." >&2
  exit 2
}

if [ "$DRY_RUN" = 1 ]; then
  echo "[dry-run] Tenon --${HOST} 一步安装计划："
  case "$HOST" in
    codex)
      echo "  preflight: require codex CLI in PATH (missing: npm install -g @openai/codex; verify: codex --version)"
      echo "  inspect and remove any existing tenon plugin/marketplace registration"
      echo "  codex plugin marketplace add ${MARKETPLACE_SOURCE} --ref ${MARKETPLACE_REF}"
      echo "  codex plugin add tenon@${MARKETPLACE_NAME} --json"
      echo "  codex plugin list --json"
      echo "  packaged setup: read-only codex login status; if needed, print ChatGPT/device/API-key guidance"
      ;;
    claude)
      echo "  inspect and remove any existing tenon plugin/marketplace registration"
      echo "  claude plugin marketplace add ${MARKETPLACE_SOURCE}@${MARKETPLACE_REF}"
      echo "  claude plugin install tenon@${MARKETPLACE_NAME}"
      echo "  claude plugin list --json"
      ;;
  esac
  SETUP_PLAN="tenon setup --${HOST} --yes --dry-run"
  [ "$AUTO_UPDATE" = 1 ] && SETUP_PLAN="${SETUP_PLAN} --auto-update"
  echo "  ${SETUP_PLAN}"
  echo "  verify: exact ${MARKETPLACE_REF} ref + commit, clean checkout, versioned inventory/manifests, packaged assets, managed runtime, and Dashboard readiness"
  echo "[dry-run] 未调用宿主命令，未写入 Tenon 或项目状态。"
  exit 0
fi

resolve_trusted_path_command() {
  local command_name="$1" path_entry
  local -a path_entries=()
  IFS=: read -r -a path_entries <<< "${PATH:-}"
  for path_entry in "${path_entries[@]}"; do
    [ -n "$path_entry" ] || continue
    case "$path_entry" in
      /*) ;;
      *) continue ;;
    esac
    if [ -f "$path_entry/$command_name" ] && [ -x "$path_entry/$command_name" ]; then
      printf '%s\n' "$path_entry/$command_name"
      return 0
    fi
  done
  return 1
}

HOST_BIN="$(resolve_trusted_path_command "$HOST" || true)"
NODE_BIN="$(resolve_trusted_path_command node || true)"
GIT_BIN="$(resolve_trusted_path_command git || true)"

if [ -z "$HOST_BIN" ]; then
  echo "install.sh: ${HOST} CLI was not found in a trusted absolute PATH entry; no plugin or Tenon state was changed." >&2
  if [ "$HOST" = codex ]; then
    echo "Install it first: npm install -g @openai/codex" >&2
  else
    echo "Install it first: npm install -g @anthropic-ai/claude-code" >&2
  fi
  echo "Then verify it is available: ${HOST} --version" >&2
  exit 1
fi
[ -n "$NODE_BIN" ] || { echo "install.sh: node is required before any plugin mutation." >&2; exit 1; }
[ -n "$GIT_BIN" ] || { echo "install.sh: git is required before any plugin mutation." >&2; exit 1; }

host_plugin_list() {
  "$HOST_BIN" plugin list --json
}

host_marketplace_list() {
  "$HOST_BIN" plugin marketplace list --json
}

decode_plugin_state() {
  "$NODE_BIN" -e '
    const host = process.argv[1];
    let text = "";
    process.stdin.on("data", c => { text += c });
    process.stdin.on("end", () => {
      let value;
      try { value = JSON.parse(text); } catch { process.exit(10); }
      const entries = host === "codex" ? value?.installed : value;
      if (!Array.isArray(entries)) process.exit(11);
      const matches = entries.filter((item) => item && typeof item === "object" && (
        host === "codex"
          ? item.pluginId === "tenon@tenon" || (item.name === "tenon" && item.marketplaceName === "tenon")
          : item.id === "tenon@tenon"
      ));
      if (matches.length === 0) { process.stdout.write("absent"); return; }
      if (matches.length !== 1) process.exit(12);
      const item = matches[0];
      if (item.enabled === false || (item.enabled !== undefined && typeof item.enabled !== "boolean")) process.exit(13);
      const root = host === "codex" ? item.source?.path : item.installPath;
      const scope = host === "claude" ? (item.scope ?? "user") : "user";
      if (typeof root !== "string" || !root.startsWith("/") || /[\r\n\t]/u.test(root)
        || typeof item.version !== "string" || /[\r\n\t]/u.test(item.version)
        || typeof scope !== "string" || /[\r\n\t]/u.test(scope)) process.exit(14);
      process.stdout.write(`present\t${root}\t${item.version}\t${scope}`);
    });
  ' "$HOST"
}

decode_marketplace_state() {
  "$NODE_BIN" -e '
    const host = process.argv[1];
    let text = "";
    process.stdin.on("data", c => { text += c });
    process.stdin.on("end", () => {
      let value;
      try { value = JSON.parse(text); } catch { process.exit(20); }
      const entries = host === "codex" ? value?.marketplaces : value;
      if (!Array.isArray(entries)) process.exit(21);
      const matches = entries.filter((item) => item && typeof item === "object" && item.name === "tenon");
      if (matches.length === 0) { process.stdout.write("absent"); return; }
      if (matches.length !== 1) process.exit(22);
      const item = matches[0];
      const root = host === "codex" ? item.root : item.installLocation;
      const source = host === "codex" ? item.marketplaceSource?.source : item.repo;
      const sourceType = host === "codex" ? item.marketplaceSource?.sourceType : item.source;
      if (![root, source, sourceType].every(x => typeof x === "string" && x !== "" && !/[\r\n\t]/u.test(x))
        || !root.startsWith("/")) process.exit(23);
      process.stdout.write(`present\t${root}\t${source}\t${sourceType}`);
    });
  ' "$HOST"
}

read_plugin_state() {
  local inventory
  if ! inventory="$(host_plugin_list)"; then
    echo "install.sh: ${HOST} plugin inventory could not be read; no new mutation was started." >&2
    return 1
  fi
  if ! printf '%s' "$inventory" | decode_plugin_state; then
    echo "install.sh: ${HOST} plugin inventory was malformed or ambiguous." >&2
    return 1
  fi
}

read_marketplace_state() {
  local inventory
  if ! inventory="$(host_marketplace_list)"; then
    echo "install.sh: ${HOST} marketplace inventory could not be read; no new mutation was started." >&2
    return 1
  fi
  if ! printf '%s' "$inventory" | decode_marketplace_state; then
    echo "install.sh: ${HOST} marketplace inventory was malformed or ambiguous." >&2
    return 1
  fi
}

PLUGIN_STATE="$(read_plugin_state)"
IFS=$'\t' read -r PLUGIN_PRESENCE _PLUGIN_ROOT _PLUGIN_VERSION PLUGIN_SCOPE <<< "$PLUGIN_STATE"
if [ "$PLUGIN_PRESENCE" = present ]; then
  if [ "$HOST" = claude ] && [ "$PLUGIN_SCOPE" != user ]; then
    echo "install.sh: existing Claude Tenon plugin is in unsupported scope '$PLUGIN_SCOPE'; refusing to remove it implicitly." >&2
    exit 1
  fi
  if [ "$HOST" = codex ]; then
    "$HOST_BIN" plugin remove "tenon@${MARKETPLACE_NAME}" --json
  else
    "$HOST_BIN" plugin uninstall "tenon@${MARKETPLACE_NAME}" --scope user
  fi
  [ "$(read_plugin_state)" = absent ] || {
    echo "install.sh: ${HOST} reported plugin removal but Tenon is still registered." >&2
    exit 1
  }
fi

MARKETPLACE_STATE="$(read_marketplace_state)"
IFS=$'\t' read -r MARKETPLACE_PRESENCE _MARKETPLACE_ROOT _MARKETPLACE_SOURCE _MARKETPLACE_TYPE <<< "$MARKETPLACE_STATE"
if [ "$MARKETPLACE_PRESENCE" = present ]; then
  if [ "$HOST" = codex ]; then
    "$HOST_BIN" plugin marketplace remove "$MARKETPLACE_NAME" --json
  else
    "$HOST_BIN" plugin marketplace remove "$MARKETPLACE_NAME"
  fi
  [ "$(read_marketplace_state)" = absent ] || {
    echo "install.sh: ${HOST} reported marketplace removal but Tenon is still registered." >&2
    exit 1
  }
fi

case "$HOST" in
  codex)
    "$HOST_BIN" plugin marketplace add "$MARKETPLACE_SOURCE" --ref "$MARKETPLACE_REF" --json
    "$HOST_BIN" plugin add "tenon@${MARKETPLACE_NAME}" --json
    ;;
  claude)
    "$HOST_BIN" plugin marketplace add "${MARKETPLACE_SOURCE}@${MARKETPLACE_REF}"
    "$HOST_BIN" plugin install "tenon@${MARKETPLACE_NAME}"
    ;;
esac

PLUGIN_STATE="$(read_plugin_state)"
IFS=$'\t' read -r PLUGIN_PRESENCE ROOT PLUGIN_VERSION PLUGIN_SCOPE <<< "$PLUGIN_STATE"
[ "$PLUGIN_PRESENCE" = present ] || { echo "install.sh: Tenon plugin is absent after install." >&2; exit 1; }
[ "$PLUGIN_VERSION" = "$TENON_RELEASE_VERSION" ] || {
  echo "install.sh: installed plugin version $PLUGIN_VERSION does not equal release $TENON_RELEASE_VERSION." >&2
  exit 1
}

MARKETPLACE_STATE="$(read_marketplace_state)"
IFS=$'\t' read -r MARKETPLACE_PRESENCE MARKETPLACE_ROOT INSTALLED_SOURCE INSTALLED_SOURCE_TYPE <<< "$MARKETPLACE_STATE"
[ "$MARKETPLACE_PRESENCE" = present ] || { echo "install.sh: Tenon marketplace is absent after install." >&2; exit 1; }
case "$INSTALLED_SOURCE" in
  "$MARKETPLACE_SOURCE"|"https://github.com/${MARKETPLACE_SOURCE}"|"https://github.com/${MARKETPLACE_SOURCE}.git") ;;
  *) echo "install.sh: installed marketplace source is not the official ${MARKETPLACE_SOURCE}." >&2; exit 1 ;;
esac
if [ "$HOST" = codex ]; then
  [ "$INSTALLED_SOURCE_TYPE" = git ] || { echo "install.sh: Codex marketplace is not a Git release checkout." >&2; exit 1; }
else
  [ "$INSTALLED_SOURCE_TYPE" = github ] || { echo "install.sh: Claude marketplace is not a GitHub release checkout." >&2; exit 1; }
fi

for required in \
  ".claude-plugin/plugin.json" \
  ".codex-plugin/plugin.json" \
  "packages/cli/dist/tenon.mjs" \
  "packages/server/dist/dashboard.mjs" \
  "runtime/tenon-bootstrap.mjs" \
  "tools/verify-skills.sh"; do
  [ -f "$ROOT/$required" ] || { echo "install.sh: release asset $required is missing." >&2; exit 1; }
done
[ -d "$ROOT/packages/dashboard-app/dist" ] || { echo "install.sh: Dashboard assets are missing." >&2; exit 1; }

manifest_version() {
  "$NODE_BIN" -e '
    const fs = require("node:fs");
    let value;
    try { value = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); } catch { process.exit(30); }
    if (typeof value?.version !== "string") process.exit(31);
    process.stdout.write(value.version);
  ' "$1"
}
for manifest in "$ROOT/.claude-plugin/plugin.json" "$ROOT/.codex-plugin/plugin.json" \
  "$MARKETPLACE_ROOT/.claude-plugin/plugin.json" "$MARKETPLACE_ROOT/.codex-plugin/plugin.json"; do
  [ "$(manifest_version "$manifest")" = "$TENON_RELEASE_VERSION" ] || {
    echo "install.sh: manifest $manifest does not declare release $TENON_RELEASE_VERSION." >&2
    exit 1
  }
done

TAG_PROOF="$("$NODE_BIN" -e '
  const { spawnSync } = require("node:child_process");
  const [git, repository, tag] = process.argv.slice(1);
  const result = spawnSync(git, [
    "ls-remote",
    repository,
    `refs/tags/${tag}`,
    `refs/tags/${tag}^{}`,
  ], {
    encoding: "utf8",
    timeout: 10_000,
    killSignal: "SIGKILL",
  });
  if (result.error) {
    process.stderr.write(`stable tag proof command failed: ${result.error.message}\n`);
    process.exit(41);
  }
  if (result.status !== 0) {
    process.stderr.write(result.stderr || `stable tag proof exited ${result.status}\n`);
    process.exit(42);
  }
  process.stdout.write(result.stdout);
' "$GIT_BIN" "https://github.com/${MARKETPLACE_SOURCE}.git" "$MARKETPLACE_REF")" || {
  echo "install.sh: stable tag proof command failed or timed out." >&2
  exit 1
}
TARGET_COMMIT="$(printf '%s' "$TAG_PROOF" | "$NODE_BIN" -e '
  const tag = process.argv[1]; let text="";
  process.stdin.on("data", c => { text += c }); process.stdin.on("end", () => {
    const rows = text.trim().split(/\r?\n/u).filter(Boolean).map(line => line.split(/\s+/u));
    const peeled = rows.filter(row => row[1] === `refs/tags/${tag}^{}`).map(row => row[0]);
    const direct = rows.filter(row => row[1] === `refs/tags/${tag}`).map(row => row[0]);
    const candidates = peeled.length > 0 ? peeled : direct;
    const unique = [...new Set(candidates)];
    if (unique.length !== 1 || !/^[a-f0-9]{40}$/u.test(unique[0])) process.exit(40);
    process.stdout.write(unique[0]);
  });
' "$MARKETPLACE_REF")" || { echo "install.sh: stable tag proof failed." >&2; exit 1; }
[ "$("$GIT_BIN" -C "$MARKETPLACE_ROOT" rev-parse HEAD)" = "$TARGET_COMMIT" ] || {
  echo "install.sh: marketplace HEAD does not equal ${MARKETPLACE_REF}." >&2
  exit 1
}
case "$("$GIT_BIN" -C "$MARKETPLACE_ROOT" remote get-url origin)" in
  "$MARKETPLACE_SOURCE"|"https://github.com/${MARKETPLACE_SOURCE}"|"https://github.com/${MARKETPLACE_SOURCE}.git") ;;
  *) echo "install.sh: marketplace Git origin is not official." >&2; exit 1 ;;
esac
"$GIT_BIN" -C "$MARKETPLACE_ROOT" diff --quiet HEAD -- || {
  echo "install.sh: marketplace checkout has tracked modifications." >&2
  exit 1
}
while IFS= read -r untracked; do
  [ -z "$untracked" ] && continue
  [ "$HOST" = codex ] && [ "$untracked" = .codex-marketplace-install.json ] && continue
  echo "install.sh: marketplace checkout has unexpected untracked payload: $untracked" >&2
  exit 1
done < <("$GIT_BIN" -C "$MARKETPLACE_ROOT" ls-files --others --exclude-standard)

if [ "$HOST" = codex ]; then
  CODEX_CONFIG_HOME="${CODEX_HOME:-$HOME/.codex}"
  CODEX_CONFIGURED_REF="$("$NODE_BIN" -e '
    const fs = require("node:fs");
    const [configPath, legacyPath] = process.argv.slice(1);
    const safe = /^[^\u0000-\u001f\u007f"\x27\\]+$/u;
    const read = (path) => { try { return fs.readFileSync(path, "utf8"); } catch (error) {
      if (error?.code === "ENOENT") return null;
      process.exit(50);
    } };
    const config = read(configPath);
    if (config !== null) {
      let inside = false, sections = 0, seen = false, ref = null;
      for (const line of config.split(/\r?\n/u)) {
        const section = /^\s*\[([^\]]+)\]\s*(?:#.*)?$/u.exec(line);
        if (section) {
          inside = section[1].trim() === "marketplaces.tenon";
          if (inside && ++sections > 1) process.exit(51);
          continue;
        }
        if (!inside || /^\s*(?:#.*)?$/u.test(line) || !/^\s*ref\s*=/u.test(line)) continue;
        if (seen) process.exit(52);
        seen = true;
        const assignment = /^\s*ref\s*=\s*(?:"([^"\\\r\n]+)"|\x27([^\x27\r\n]+)\x27)\s*(?:#.*)?$/u.exec(line);
        ref = assignment?.[1] ?? assignment?.[2] ?? null;
        if (ref === null || !safe.test(ref)) process.exit(53);
      }
      if (ref !== null) { process.stdout.write(ref); process.exit(0); }
    }
    const legacy = read(legacyPath);
    if (legacy === null) process.exit(54);
    let value; try { value = JSON.parse(legacy); } catch { process.exit(55); }
    if (typeof value?.ref_name !== "string" || value.ref_name === "" || !safe.test(value.ref_name)) process.exit(56);
    process.stdout.write(value.ref_name);
  ' "$CODEX_CONFIG_HOME/config.toml" "$MARKETPLACE_ROOT/.codex-marketplace-install.json")" || {
    echo "install.sh: Codex marketplace configured ref could not be proven." >&2
    exit 1
  }
  [ "$CODEX_CONFIGURED_REF" = "$MARKETPLACE_REF" ] || {
    echo "install.sh: Codex marketplace configured ref is not ${MARKETPLACE_REF}." >&2
    exit 1
  }
else
  if "$GIT_BIN" -C "$MARKETPLACE_ROOT" symbolic-ref --quiet --short HEAD >/dev/null 2>&1; then
    echo "install.sh: Claude marketplace still tracks a moving branch." >&2
    exit 1
  fi
  [ "$("$GIT_BIN" -C "$MARKETPLACE_ROOT" describe --tags --exact-match HEAD)" = "$MARKETPLACE_REF" ] || {
    echo "install.sh: Claude marketplace is not detached at ${MARKETPLACE_REF}." >&2
    exit 1
  }
fi

if [ "$MARKETPLACE_ROOT" != "$ROOT" ]; then
  for entry in ".claude-plugin/plugin.json" ".codex-plugin/plugin.json" "adapters" "hooks" \
    "packages/cli/dist/tenon.mjs" "packages/dashboard-app/dist" "packages/server/dist/dashboard.mjs" \
    "runtime/tenon-bootstrap.mjs" "skills" "templates" "tools/verify-skills.sh"; do
    "$GIT_BIN" diff --no-index --quiet -- "$MARKETPLACE_ROOT/$entry" "$ROOT/$entry" || {
      echo "install.sh: installed plugin payload differs from the ${MARKETPLACE_REF} marketplace at $entry." >&2
      exit 1
    }
  done
fi
bash "$ROOT/tools/verify-skills.sh" --quiet --root "$ROOT"

ARGS=(setup "--${HOST}" --yes)
[ "$AUTO_UPDATE" = 1 ] && ARGS+=(--auto-update)
node "$ROOT/packages/cli/dist/tenon.mjs" "${ARGS[@]}"
if [ "$HOST" = "codex" ]; then
  echo "Codex requires one local hook trust: open Codex, run /hooks, and trust tenon to enable normal-chat routing."
fi
echo "Tenon installed for --${HOST}. Open a new host session to load its packaged skills and hooks."
