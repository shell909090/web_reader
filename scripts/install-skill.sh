#!/usr/bin/env bash
set -euo pipefail

source_dir="$(realpath "${1:?Repository path is required}/web_reader")"
: "${HOME:?HOME is required}"
[[ -f "$source_dir/SKILL.md" ]] || { echo "Missing SKILL.md: $source_dir" >&2; exit 1; }
targets=("$HOME/.claude/skills/web-reader" "$HOME/.agents/skills/web-reader")

# Preflight both destinations so a known conflict never leaves a partial install.
for target in "${targets[@]}"; do
    if [[ -L "$target" ]] && [[ "$(realpath "$target" 2>/dev/null || true)" == "$source_dir" ]]; then
        continue
    fi
    if [[ -e "$target" || -L "$target" ]]; then
        echo "Skill destination already exists: $target" >&2
        exit 1
    fi
done

# Legacy discovery paths can expose an older installation a second time.
# Leave existing user-managed skills untouched and identify them for migration.
for legacy in "$HOME/.codex/skills/web-reader" "${XDG_CONFIG_HOME:-$HOME/.config}/opencode/skills/web-reader"; do
    if [[ -e "$legacy" || -L "$legacy" ]]; then
        echo "Warning: another skill installation may cause duplicates: $legacy" >&2
    fi
done

for target in "${targets[@]}"; do
    if [[ -L "$target" ]]; then
        continue
    fi
    mkdir -p "$(dirname "$target")"
    ln -sT "$source_dir" "$target"
    echo "Linked $target -> $source_dir"
done
