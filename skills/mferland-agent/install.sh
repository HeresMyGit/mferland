#!/usr/bin/env sh
set -eu

BASE_URL="${MFERLAND_AGENT_SKILL_BASE_URL:-https://game.mfergpt.lol/skills/mferland-agent}"
TARGET_DIR="${MFERLAND_AGENT_SKILL_DIR:-$HOME/.codex/skills/mferland-agent}"

download() {
  source_path="$1"
  target_path="$TARGET_DIR/$source_path"
  mkdir -p "$(dirname "$target_path")"
  curl -fsSL "$BASE_URL/$source_path" -o "$target_path"
}

mkdir -p "$TARGET_DIR/scripts"

download "install.sh"
download "SKILL.md"
download "scripts/.env.example"
download "scripts/create-wallet.ts"
download "scripts/doctor.ts"
download "scripts/package.json"
download "scripts/tsconfig.json"
download "scripts/mferland-agent-runner.ts"

chmod +x "$TARGET_DIR/install.sh"

cat <<EOF
Installed mferland-agent skill to:
  $TARGET_DIR

Next:
  cd "$TARGET_DIR/scripts"
  npm install
  cp .env.example .env
  # edit .env with an agent-controlled wallet key
  npm run doctor
  npm run start
EOF
