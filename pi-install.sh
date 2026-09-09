#!/usr/bin/env bash
# pi-install.sh — install this skills bundle onto the current machine's pi.
#
# This is the pi-specific installer (the skill bundle is harness-portable;
# other harnesses—opencode, commandcode, codex, cursor—have their own
# install path: run their /setup-harness flow instead, or copy skills/ and
# agents/ to the harness's skill/agent dir by hand).
#
# One command to get a fresh Pi machine fully set up from this repo:
#   bash install.sh
#
# What it does (idempotent — safe to re-run):
#   1. Copies skills/  -> ~/.pi/agent/skills/        (each <name>/SKILL.md the pi <name> skill)
#   2. Copies agents/  -> ~/.pi/agent/agents/        (pi custom agent personas, e.g. comment-sicko)
#   3. Installs the bundled pi extension (.pi/background-task-runner/) into pi's extension discovery
#   4. Ensures pi's needed npm packages are installed (pi-subagents, commandcode provider)
#   5. Skips existing files when unchanged (copies only what differs)
#
# Env overrides:
#   SKILLS_DEST       skill dir (default $PI_CODING_AGENT_DIR/skills or ~/.pi/agent/skills)
#   AGENTS_DEST       agent dir (default $PI_CODING_AGENT_DIR/agents  or ~/.pi/agent/agents)
#   PI_PACKAGES       space-separated package sources (default the two this repo needs)
#   NO_PI_PACKAGES=1  skip the `pi install` step
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PI_CONF="${PI_CODING_AGENT_DIR:-"$HOME/.pi/agent"}"
SKILLS_DEST="${SKILLS_DEST:-"$PI_CONF/skills"}"
AGENTS_DEST="${AGENTS_DEST:-"$PI_CONF/agents"}"
EXT_DEST="${EXT_DEST:-"$PI_CONF/extensions"}"

mkdir -p "$SKILLS_DEST" "$AGENTS_DEST" "$EXT_DEST"

echo "Installing skills to: $SKILLS_DEST"
echo "Installing agents to: $AGENTS_DEST"

# --- skills ---------------------------------------------------------------
if [[ -d "$HERE/skills" ]]; then
  copied=0; skipped=0; updated=0
  for sk in "$HERE"/skills/*/; do
    [[ -d "$sk" ]] || continue
    name="$(basename "$sk")"
    if [[ -f "$sk/SKILL.md" ]]; then
      mkdir -p "$SKILLS_DEST/$name"
      # sync all files under the skill dir (SKILL.md + references/ etc.)
      for f in "$sk"*; do
        rel="${f#"$sk"}"
        if [[ -d "$f" ]]; then
          mkdir -p "$SKILLS_DEST/$name/$rel"
          cp -R "$f/." "$SKILLS_DEST/$name/$rel/"
        elif [[ -f "$f" ]]; then
          if [[ -f "$SKILLS_DEST/$name/$rel" ]] && cmp -s "$f" "$SKILLS_DEST/$name/$rel"; then
            skipped=$((skipped+1))
          else
            cp "$f" "$SKILLS_DEST/$name/$rel"
            [[ -f "$SKILLS_DEST/$name/$rel" ]] && updated=$((updated+1))
          fi
        fi
      done
    fi
  done
  echo "skills: copied/updated $updated, already up to date $skipped."
fi

# --- agents ---------------------------------------------------------------
# Agent files are written with Claude Code tool names. pi-subagents wants pi's
# built-ins (read, write, edit, bash, grep, find, ls) and fails loudly on
# anything else, so the `tools:` frontmatter line is translated on copy:
# Read/Write/Edit/Bash/Grep -> lowercase, Glob -> find, web and mcp__ tools
# dropped (pi has no built-in equivalent). Names already in pi form pass through.
translate_tools() {
  awk '
    /^---$/ { fm++; print; next }
    fm==1 && /^tools:/ {
      sub(/^tools:[[:space:]]*/, "")
      n = split($0, parts, ",")
      out = ""
      for (i = 1; i <= n; i++) {
        t = parts[i]; gsub(/^[[:space:]]+|[[:space:]]+$/, "", t)
        if (t == "Read") t = "read"
        else if (t == "Write") t = "write"
        else if (t == "Edit") t = "edit"
        else if (t == "Bash") t = "bash"
        else if (t == "Grep") t = "grep"
        else if (t == "Glob") t = "find"
        else if (t == "WebFetch" || t == "WebSearch" || t ~ /^mcp__/) continue
        out = out (out == "" ? "" : ", ") t
      }
      if (out != "") print "tools: " out
      next
    }
    { print }
  ' "$1"
}
if [[ -d "$HERE/agents" ]]; then
  n=0
  for a in "$HERE"/agents/*.md; do
    [[ -f "$a" ]] || continue
    translate_tools "$a" > "$AGENTS_DEST/$(basename "$a")"
    n=$((n+1))
  done
  echo "agents: installed $n persona file(s)."
fi

# --- bundled pi extension -------------------------------------------------
if [[ -d "$HERE/.pi/background-task-runner" ]]; then
  dest="$EXT_DEST/background-task-runner"
  mkdir -p "$dest"
  # copy source + package.json, but never node_modules/ or tsconfig scaffolding
  for f in "$HERE/.pi/background-task-runner/"*; do
    b="$(basename "$f")"
    [[ "$b" == "node_modules" || "$b" == "tsconfig.json" ]] && continue
    if [[ -d "$f" ]]; then
      cp -R "$f" "$dest/"
    else
      cp "$f" "$dest/"
    fi
  done
  echo "extension: installed background-task-runner to $dest"
fi

# --- pi npm packages ------------------------------------------------------
if [[ "${NO_PI_PACKAGES:-0}" != "1" ]] && command -v pi >/dev/null 2>&1; then
  for pkg in ${PI_PACKAGES:-npm:@tintinweb/pi-subagents npm:pi-commandcode-provider}; do
    if ! pi list 2>/dev/null | grep -q "${pkg#npm:}"; then
      echo "installing pi package: $pkg"
      pi install "$pkg" || echo "  (failed to install $pkg — install manually)"
    else
      echo "pi package already installed: ${pkg#npm:}"
    fi
  done
else
  echo "(skipped pi package install — pi not on PATH or NO_PI_PACKAGES set)"
fi

echo ""
echo "✓ install complete. Run \`pi\` with the project trusted (-a) so project-local"
echo "  extensions/skills load, and run /setup-harness once per repo."