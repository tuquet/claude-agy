# 🚀 Claude-Agy (`claude-agy`)

> Run Anthropic's **Claude Code CLI** powered by **Google Antigravity OAuth** quotas with zero API token cost, on-demand proxy lifecycle management, and dynamic model discovery.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](#-installation)
[![Scoop](https://img.shields.io/badge/Scoop-Available-brightgreen.svg)](#1-windows-via-scoop-recommended)

---

## 🏗️ Architecture & Execution Flow

Claude-Agy wraps Claude Code CLI and coordinates with a background reverse proxy (`CLIProxyAPI`) that dynamically maps requests to Google's Antigravity backend:

```mermaid
flowchart TD
    A["Run claude-agy [args]"] --> B{"Is port 8318<br/>already open?"}
    B -- "No" --> C["Spawn cli-proxy-api in background<br/>(Track PID)"]
    B -- "Yes" --> D["Launch Claude Code CLI<br/>(Gateway Model Discovery = 1)"]
    C --> D
    D --> E["Claude Code sends requests to<br/>http://127.0.0.1:8318"]
    E --> F["cli-proxy-api filters sensitive words<br/>+ routes to Antigravity"]
    F --> G["Google Antigravity Backend<br/>(Enterprise OAuth Quota)"]
    G --> F
    F --> D
    D --> H["User exits Claude<br/>(/exit or Ctrl+C)"]
    H --> I["Auto-terminate Proxy PID on exit<br/>(Free port 8318, 0MB residual RAM)"]
```

---

## ✨ Key Features

- **Zero API Token Cost**: Utilizes your existing Google Antigravity OAuth quota directly.
- **On-Demand Proxy Lifecycle**: Starts the reverse proxy automatically on port `8318` when you run `claude-agy`, and terminates the process when you exit (0 MB RAM overhead when idle).
- **Dynamic Multi-Source Token Resolver**: Automatically detects OAuth tokens from Antigravity CLI (`antigravity-cli`), Antigravity IDE (`jetski-standalone-oauth-token`), and OAuth credentials (`oauth_creds.json`).
- **Dynamic Model Discovery (`/model`)**: Query and switch models on the fly (Sonnet 3.7 / 4.6, Opus Thinking, Gemini 3.8 Flash High) without maintaining static alias tables.
- **Root & Sandbox Permission Bypass**: Seamless headless execution (`IS_SANDBOX=1` and automated `.claude.json` trust acceptance) for uninterrupted developer workflows.
- **Strict ASCII & Cross-Platform Invariance**: Pure PowerShell 5.1/7+, Node.js, and Bash implementations with zero Windows-1252 ANSI encoding pitfalls.

---

## 📦 Installation

### 1. Windows via Scoop (Recommended)

If you use [Scoop](https://scoop.sh):

```powershell
# Add Tuquet Scoop Bucket
scoop bucket add tuquet https://github.com/tuquet/tuquet-scoop-bucket

# Install Claude-Agy
scoop install claude-agy
```

*To update anytime:*
```powershell
scoop update claude-agy
```

---

### 2. Universal Node.js Installer (Windows, macOS, Linux)

Requires Node.js 18+:

```bash
# Run one-line installer
curl -fsSL https://raw.githubusercontent.com/tuquet/claude-agy/main/setup.mjs | node
```

Or from local clone:
```bash
node setup.mjs
```

---

### 3. Windows Direct (PowerShell)

Open PowerShell and run:

```powershell
irm https://raw.githubusercontent.com/tuquet/claude-agy/main/scripts/setup.ps1 | iex
```

---

### 4. Linux / macOS / WSL (Bash)

Open terminal and run:

```bash
curl -fsSL https://raw.githubusercontent.com/tuquet/claude-agy/main/scripts/setup.sh | bash
```

---

## ⚡ Quick Start

Once installed, use the global command:

```powershell
# Launch interactive chat
claude-agy

# Inside chat, switch models dynamically
/model

# Run one-shot prompt
claude-agy -p "Write an async HTTP client in Rust"

# Specify a model explicitly
claude-agy --model claude-opus-4-6-thinking
```

---

## 📁 Directory Structure

```text
├── bin/
│   ├── claude-agy            # Primary CLI launcher (bash / ps1 & cmd)
│   └── cli-proxy-api         # Native reverse proxy binary
├── config/
│   ├── config.yaml           # Minimalist proxy configuration
│   └── settings.env          # Environment settings (port, model, auto-bypass)
├── data/
│   └── antigravity-auth.json # Synced OAuth credentials
├── logs/
│   └── proxy.log             # Proxy logs
├── scripts/
│   ├── setup.mjs             # Universal Node.js setup
│   ├── setup.ps1             # Windows PowerShell setup
│   ├── setup.sh              # Linux / macOS setup
│   ├── uninstall.ps1         # Windows uninstaller
│   └── uninstall.sh          # Linux / macOS uninstaller
└── README.md
```

---

## 🗑️ Uninstallation

### Windows (Scoop)
```powershell
scoop uninstall claude-agy
```

### Windows (Direct)
```powershell
& "$env:USERPROFILE\claude-agy\uninstall.ps1"
```

### Linux / macOS
```bash
~/claude-agy/uninstall.sh
```

---

## 📜 License

This project is licensed under the [MIT License](LICENSE).
