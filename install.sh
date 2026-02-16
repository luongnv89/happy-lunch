#!/usr/bin/env bash
# ============================================================================
# Happy-Lunch Installer
# Telegram Happy Dashboard Launcher — secure launch gateway for Happy CLI
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/luongnv89/happy-lunch/main/install.sh | bash
#
# Or with options:
#   curl -fsSL https://raw.githubusercontent.com/luongnv89/happy-lunch/main/install.sh | bash -s -- \
#     --token YOUR_BOT_TOKEN \
#     --users 123456789 \
#     --workspace /home/user/projects \
#     --install-dir /opt/happy-lunch \
#     --service
# ============================================================================

set -euo pipefail

# --- Defaults ---------------------------------------------------------------
INSTALL_DIR="${HOME}/.happy-lunch"
WORKSPACE_ROOT=""
TELEGRAM_BOT_TOKEN=""
ALLOWED_USERS=""
ALLOWED_TOOLS="claude,codex"
STARTUP_TIMEOUT=8000
INSTALL_SERVICE=false
SERVICE_USER="${USER}"
NODE_MIN_VERSION=18

# --- Colors -----------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# --- Helpers ----------------------------------------------------------------
info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# --- Parse Arguments --------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --token)          TELEGRAM_BOT_TOKEN="$2"; shift 2 ;;
    --users)          ALLOWED_USERS="$2"; shift 2 ;;
    --workspace)      WORKSPACE_ROOT="$2"; shift 2 ;;
    --tools)          ALLOWED_TOOLS="$2"; shift 2 ;;
    --timeout)        STARTUP_TIMEOUT="$2"; shift 2 ;;
    --install-dir)    INSTALL_DIR="$2"; shift 2 ;;
    --service)        INSTALL_SERVICE=true; shift ;;
    --service-user)   SERVICE_USER="$2"; shift 2 ;;
    -h|--help)
      cat <<'HELP'
Happy-Lunch Installer

OPTIONS:
  --token TOKEN         Telegram Bot Token (required)
  --users IDS           Comma-separated Telegram user IDs (required)
  --workspace PATH      Workspace root directory containing projects (required)
  --tools TOOLS         Comma-separated allowed tools (default: claude,codex)
  --timeout MS          Startup timeout in ms (default: 8000)
  --install-dir PATH    Installation directory (default: ~/.happy-lunch)
  --service             Install as systemd/launchd service
  --service-user USER   User to run the service as (default: current user)
  -h, --help            Show this help message

EXAMPLES:
  # Interactive install (prompts for required values)
  bash install.sh

  # Non-interactive install
  bash install.sh --token "123:ABC" --users "12345" --workspace "/home/me/projects"

  # Install as a system service
  bash install.sh --token "123:ABC" --users "12345" --workspace "/home/me/projects" --service

  # One-liner from GitHub
  curl -fsSL https://raw.githubusercontent.com/luongnv89/happy-lunch/main/install.sh | bash
HELP
      exit 0
      ;;
    *) error "Unknown option: $1. Use --help for usage." ;;
  esac
done

# --- Banner -----------------------------------------------------------------
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║       🍱 Happy-Lunch Installer           ║${NC}"
echo -e "${BOLD}║   Telegram Happy Dashboard Launcher      ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""

# --- Detect OS & Architecture -----------------------------------------------
detect_os() {
  local os
  os="$(uname -s)"
  case "$os" in
    Linux*)  echo "linux" ;;
    Darwin*) echo "macos" ;;
    *)       error "Unsupported operating system: $os" ;;
  esac
}

detect_arch() {
  local arch
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64) echo "x86_64" ;;
    arm64|aarch64) echo "arm64" ;;
    *)             echo "$arch" ;;
  esac
}

OS="$(detect_os)"
ARCH="$(detect_arch)"
info "Detected: ${OS} (${ARCH})"

# --- Check Node.js ----------------------------------------------------------
check_node() {
  if ! command -v node &>/dev/null; then
    warn "Node.js not found."
    install_node
  fi

  local node_version
  node_version="$(node --version | sed 's/^v//' | cut -d. -f1)"
  if [[ "$node_version" -lt "$NODE_MIN_VERSION" ]]; then
    warn "Node.js v${node_version} found, but v${NODE_MIN_VERSION}+ is required."
    install_node
  fi

  success "Node.js $(node --version) detected"
}

install_node() {
  info "Attempting to install Node.js..."

  if [[ "$OS" == "macos" ]]; then
    if command -v brew &>/dev/null; then
      info "Installing Node.js via Homebrew..."
      brew install node
    else
      error "Homebrew not found. Install Node.js >= ${NODE_MIN_VERSION} manually: https://nodejs.org"
    fi
  elif [[ "$OS" == "linux" ]]; then
    if command -v apt-get &>/dev/null; then
      info "Installing Node.js via NodeSource..."
      curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
      sudo apt-get install -y nodejs
    elif command -v dnf &>/dev/null; then
      info "Installing Node.js via dnf..."
      sudo dnf install -y nodejs
    elif command -v yum &>/dev/null; then
      info "Installing Node.js via NodeSource..."
      curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
      sudo yum install -y nodejs
    else
      error "No supported package manager found. Install Node.js >= ${NODE_MIN_VERSION} manually: https://nodejs.org"
    fi
  fi

  if ! command -v node &>/dev/null; then
    error "Node.js installation failed. Install manually: https://nodejs.org"
  fi
  success "Node.js $(node --version) installed"
}

check_node

# --- Check git --------------------------------------------------------------
if ! command -v git &>/dev/null; then
  error "git is not installed. Please install git first."
fi
success "git $(git --version | awk '{print $3}') detected"

# --- Check tmux -------------------------------------------------------------
check_tmux() {
  if ! command -v tmux &>/dev/null; then
    warn "tmux not found. tmux is required for headless launches (Telegram bot)."
    if [[ "$OS" == "macos" ]]; then
      if command -v brew &>/dev/null; then
        info "Installing tmux via Homebrew..."
        brew install tmux
      else
        warn "Install tmux manually: brew install tmux"
        warn "Happy-Lunch will still work, but headless launches will fail."
      fi
    elif [[ "$OS" == "linux" ]]; then
      if command -v apt-get &>/dev/null; then
        info "Installing tmux via apt..."
        sudo apt-get install -y tmux
      elif command -v dnf &>/dev/null; then
        info "Installing tmux via dnf..."
        sudo dnf install -y tmux
      elif command -v yum &>/dev/null; then
        info "Installing tmux via yum..."
        sudo yum install -y tmux
      else
        warn "Install tmux manually using your package manager."
        warn "Happy-Lunch will still work, but headless launches will fail."
      fi
    fi
  fi

  if command -v tmux &>/dev/null; then
    success "tmux $(tmux -V | awk '{print $2}') detected"
  else
    warn "tmux is not installed — headless launches will not work"
  fi
}

check_tmux

# --- Check Happy CLI (Claude Code) -----------------------------------------
check_happy() {
  local missing=()

  if ! command -v happy &>/dev/null; then
    missing+=("happy (Claude Code)")
  else
    success "happy (Claude Code) $(happy --version 2>/dev/null | head -1 | awk '{print $NF}') detected"
  fi

  # Check for codex only if it's in the allowed tools
  if [[ "$ALLOWED_TOOLS" == *"codex"* ]]; then
    if ! command -v codex &>/dev/null; then
      missing+=("codex (OpenAI Codex)")
    else
      success "codex detected"
    fi
  fi

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo ""
    warn "Missing tool binaries:"
    for tool in "${missing[@]}"; do
      echo -e "  ${YELLOW}•${NC} ${tool}"
    done
    echo ""
    info "Install Claude Code with: npm install -g @anthropic-ai/claude-code"
    if [[ "$ALLOWED_TOOLS" == *"codex"* ]]; then
      info "Install Codex with: npm install -g @openai/codex"
    fi
    warn "Happy-Lunch will install, but launches will fail until these tools are available."
    echo ""
  fi
}

check_happy

# --- Interactive prompts for missing required values -------------------------
prompt_value() {
  local var_name="$1" prompt_text="$2" current_val="$3" required="${4:-true}"
  if [[ -z "$current_val" ]]; then
    if [[ -t 0 ]]; then
      read -rp "$(echo -e "${YELLOW}?${NC} ${prompt_text}: ")" current_val
      if [[ "$required" == "true" && -z "$current_val" ]]; then
        error "${prompt_text} is required."
      fi
    else
      if [[ "$required" == "true" ]]; then
        error "${prompt_text} is required. Pass it via --$(echo "$var_name" | tr '[:upper:]' '[:lower:]' | tr '_' '-') flag."
      fi
    fi
  fi
  echo "$current_val"
}

TELEGRAM_BOT_TOKEN="$(prompt_value "TOKEN" "Telegram Bot Token" "$TELEGRAM_BOT_TOKEN" "true")"
ALLOWED_USERS="$(prompt_value "USERS" "Allowed Telegram User IDs (comma-separated)" "$ALLOWED_USERS" "true")"
WORKSPACE_ROOT="$(prompt_value "WORKSPACE" "Workspace root directory (absolute path)" "$WORKSPACE_ROOT" "true")"

# Validate workspace exists
if [[ ! -d "$WORKSPACE_ROOT" ]]; then
  error "Workspace directory does not exist: $WORKSPACE_ROOT"
fi
success "Workspace root verified: $WORKSPACE_ROOT"

# --- Clone / Update Repository -----------------------------------------------
info "Installing to: $INSTALL_DIR"

if [[ -d "$INSTALL_DIR/.git" ]]; then
  info "Existing installation found. Updating..."
  cd "$INSTALL_DIR"
  git fetch origin
  git reset --hard origin/main
  success "Updated to latest version"
else
  if [[ -d "$INSTALL_DIR" ]]; then
    warn "Directory exists but is not a git repo. Removing..."
    rm -rf "$INSTALL_DIR"
  fi
  info "Cloning repository..."
  git clone https://github.com/luongnv89/happy-lunch.git "$INSTALL_DIR"
  success "Repository cloned"
fi

cd "$INSTALL_DIR"

# --- Install Dependencies ---------------------------------------------------
info "Installing dependencies..."
npm ci --production=false
success "Dependencies installed"

# --- Build ------------------------------------------------------------------
info "Building project..."
npm run build
success "Build complete"

# --- Generate Configuration -------------------------------------------------
info "Generating configuration..."

# Convert comma-separated users to JSON array
IFS=',' read -ra USER_ARRAY <<< "$ALLOWED_USERS"
USERS_JSON="["
for i in "${!USER_ARRAY[@]}"; do
  [[ $i -gt 0 ]] && USERS_JSON+=","
  USERS_JSON+="${USER_ARRAY[$i]// /}"
done
USERS_JSON+="]"

# Convert comma-separated tools to JSON array
IFS=',' read -ra TOOL_ARRAY <<< "$ALLOWED_TOOLS"
TOOLS_JSON="["
for i in "${!TOOL_ARRAY[@]}"; do
  [[ $i -gt 0 ]] && TOOLS_JSON+=","
  TOOLS_JSON+="\"${TOOL_ARRAY[$i]// /}\""
done
TOOLS_JSON+="]"

cat > "$INSTALL_DIR/config.json" <<EOF
{
  "workspaceRoot": "${WORKSPACE_ROOT}",
  "allowedTelegramUsers": ${USERS_JSON},
  "allowedTools": ${TOOLS_JSON},
  "startupTimeoutMs": ${STARTUP_TIMEOUT},
  "auditLogDir": "./logs"
}
EOF
success "config.json created"

# Write .env
cat > "$INSTALL_DIR/.env" <<EOF
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
EOF
chmod 600 "$INSTALL_DIR/.env"
success ".env created (permissions: 600)"

# Create logs directory
mkdir -p "$INSTALL_DIR/logs"

# --- Verify Installation ----------------------------------------------------
info "Verifying installation..."

if [[ ! -f "$INSTALL_DIR/dist/index.js" ]]; then
  error "Build verification failed: dist/index.js not found"
fi
success "Build output verified"

# Quick config validation
cd "$INSTALL_DIR"
node -e "
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
if (!config.workspaceRoot) throw new Error('Missing workspaceRoot');
if (!config.allowedTelegramUsers?.length) throw new Error('Missing allowedTelegramUsers');
if (!config.allowedTools?.length) throw new Error('Missing allowedTools');
console.log('Config validation passed');
" || error "Configuration validation failed"
success "Configuration validated"

# --- Install as Service (optional) ------------------------------------------
install_service() {
  if [[ "$OS" == "linux" ]]; then
    install_systemd_service
  elif [[ "$OS" == "macos" ]]; then
    install_launchd_service
  fi
}

install_systemd_service() {
  info "Installing systemd service..."

  local node_path
  node_path="$(which node)"
  local service_file="/etc/systemd/system/happy-lunch.service"

  sudo tee "$service_file" > /dev/null <<EOF
[Unit]
Description=Happy-Lunch Telegram Bot
Documentation=https://github.com/luongnv89/happy-lunch
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}
ExecStart=${node_path} ${INSTALL_DIR}/dist/index.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=happy-lunch

# Environment
EnvironmentFile=${INSTALL_DIR}/.env

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=${INSTALL_DIR}/logs
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

  sudo systemctl daemon-reload
  sudo systemctl enable happy-lunch
  sudo systemctl start happy-lunch

  sleep 2
  if sudo systemctl is-active --quiet happy-lunch; then
    success "systemd service installed and running"
  else
    warn "Service installed but may not be running. Check: sudo systemctl status happy-lunch"
  fi

  info "Service commands:"
  echo "  sudo systemctl status happy-lunch    # Check status"
  echo "  sudo systemctl stop happy-lunch      # Stop"
  echo "  sudo systemctl start happy-lunch     # Start"
  echo "  sudo systemctl restart happy-lunch   # Restart"
  echo "  sudo journalctl -u happy-lunch -f    # View logs"
}

install_launchd_service() {
  info "Installing launchd service..."

  local node_path
  node_path="$(which node)"
  local plist_path="${HOME}/Library/LaunchAgents/com.happy-lunch.bot.plist"
  local log_dir="${INSTALL_DIR}/logs"

  mkdir -p "${HOME}/Library/LaunchAgents"

  cat > "$plist_path" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.happy-lunch.bot</string>

    <key>ProgramArguments</key>
    <array>
        <string>${node_path}</string>
        <string>${INSTALL_DIR}/dist/index.js</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${INSTALL_DIR}</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>TELEGRAM_BOT_TOKEN</key>
        <string>${TELEGRAM_BOT_TOKEN}</string>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>

    <key>StandardOutPath</key>
    <string>${log_dir}/launchd-stdout.log</string>

    <key>StandardErrorPath</key>
    <string>${log_dir}/launchd-stderr.log</string>

    <key>ThrottleInterval</key>
    <integer>10</integer>
</dict>
</plist>
EOF

  launchctl unload "$plist_path" 2>/dev/null || true
  launchctl load -w "$plist_path"

  sleep 2
  if launchctl list | grep -q "com.happy-lunch.bot"; then
    success "launchd service installed and loaded"
  else
    warn "Service installed but may not be loaded. Check: launchctl list | grep happy-lunch"
  fi

  info "Service commands:"
  echo "  launchctl list | grep happy-lunch              # Check status"
  echo "  launchctl unload ${plist_path}                 # Stop"
  echo "  launchctl load -w ${plist_path}                # Start"
  echo "  tail -f ${log_dir}/launchd-stdout.log          # View logs"
}

if [[ "$INSTALL_SERVICE" == "true" ]]; then
  install_service
fi

# --- Summary ----------------------------------------------------------------
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║     ✅ Installation Complete!             ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BOLD}Installation directory:${NC} $INSTALL_DIR"
echo -e "${BOLD}Workspace root:${NC}        $WORKSPACE_ROOT"
echo -e "${BOLD}Allowed users:${NC}         $ALLOWED_USERS"
echo -e "${BOLD}Allowed tools:${NC}         $ALLOWED_TOOLS"
echo ""

# --- Component status summary ---
echo -e "${BOLD}Component status:${NC}"
if command -v node &>/dev/null; then
  echo -e "  ${GREEN}✓${NC} Node.js $(node --version)"
else
  echo -e "  ${RED}✗${NC} Node.js — not found"
fi
if command -v tmux &>/dev/null; then
  echo -e "  ${GREEN}✓${NC} tmux $(tmux -V | awk '{print $2}')"
else
  echo -e "  ${RED}✗${NC} tmux — install with: brew install tmux (macOS) or apt install tmux (Linux)"
fi
if command -v happy &>/dev/null; then
  echo -e "  ${GREEN}✓${NC} happy (Claude Code)"
else
  echo -e "  ${RED}✗${NC} happy — install with: npm install -g @anthropic-ai/claude-code"
fi
if [[ "$ALLOWED_TOOLS" == *"codex"* ]]; then
  if command -v codex &>/dev/null; then
    echo -e "  ${GREEN}✓${NC} codex"
  else
    echo -e "  ${RED}✗${NC} codex — install with: npm install -g @openai/codex"
  fi
fi
if command -v git &>/dev/null; then
  echo -e "  ${GREEN}✓${NC} git $(git --version | awk '{print $3}')"
else
  echo -e "  ${RED}✗${NC} git — not found"
fi
echo ""

if [[ "$INSTALL_SERVICE" == "true" ]]; then
  echo -e "${BOLD}Service:${NC} Installed and running"
  if [[ "$OS" == "linux" ]]; then
    echo -e "  Logs: ${BLUE}sudo journalctl -u happy-lunch -f${NC}"
  else
    echo -e "  Logs: ${BLUE}tail -f ${INSTALL_DIR}/logs/launchd-stdout.log${NC}"
  fi
else
  echo -e "${BOLD}To start manually:${NC}"
  echo -e "  cd $INSTALL_DIR && npm start"
  echo ""
  echo -e "${BOLD}To install as a service later:${NC}"
  echo -e "  cd $INSTALL_DIR && bash install.sh --service"
fi

echo ""
echo -e "${BOLD}To update:${NC}"
echo -e "  cd $INSTALL_DIR && git pull && npm ci && npm run build"
echo ""
echo -e "${BOLD}Uninstall:${NC}"

if [[ "$OS" == "linux" ]]; then
  echo -e "  sudo systemctl stop happy-lunch && sudo systemctl disable happy-lunch"
  echo -e "  sudo rm /etc/systemd/system/happy-lunch.service && sudo systemctl daemon-reload"
fi
if [[ "$OS" == "macos" ]]; then
  echo -e "  launchctl unload ~/Library/LaunchAgents/com.happy-lunch.bot.plist"
  echo -e "  rm ~/Library/LaunchAgents/com.happy-lunch.bot.plist"
fi
echo -e "  rm -rf $INSTALL_DIR"
echo ""
