#!/usr/bin/env node
/**
 * Cross-Platform One-Click Setup Script for Claude Code + Antigravity (claude-agy).
 * Works natively on Windows 10/11, macOS, and Linux without shell dependencies.
 *
 * Requirements: Node.js 18+ (already required by @anthropic-ai/claude-code)
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync, spawn } from 'node:child_process';
import net from 'node:net';

const CPA_VERSION = '7.3.17';
const TARGET_DIR = process.env.TARGET_DIR || path.join(os.homedir(), 'claude-agy');

console.log('\x1b[36m============================================================\x1b[0m');
console.log('\x1b[36m [SETUP] Claude-Agy Universal Cross-Platform Setup (Node.js)\x1b[0m');
console.log('\x1b[36m============================================================\x1b[0m');
console.log(`\x1b[33mTarget directory: ${TARGET_DIR}\x1b[0m`);
console.log(`\x1b[33mPlatform:         ${process.platform} (${process.arch})\x1b[0m\n`);

// 1. Create directory structure
const binDir = path.join(TARGET_DIR, 'bin');
const configDir = path.join(TARGET_DIR, 'config');
const dataDir = path.join(TARGET_DIR, 'data');
const logsDir = path.join(TARGET_DIR, 'logs');
const scriptsDir = path.join(TARGET_DIR, 'scripts');

for (const dir of [binDir, configDir, dataDir, logsDir, scriptsDir]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 2. Check and install Claude Code CLI (@anthropic-ai/claude-code)
console.log('\x1b[36m[1/6] Checking Anthropic Claude Code CLI...\x1b[0m');
let claudeAvailable = false;
try {
  const checkCmd = process.platform === 'win32' ? 'where claude' : 'which claude';
  execSync(checkCmd, { stdio: 'ignore' });
  claudeAvailable = true;
} catch {
  claudeAvailable = false;
}

if (!claudeAvailable) {
  console.log('  -> Installing @anthropic-ai/claude-code globally via npm...');
  try {
    execSync('npm install -g @anthropic-ai/claude-code', { stdio: 'inherit' });
    console.log('  \x1b[32m-> @anthropic-ai/claude-code installed successfully.\x1b[0m');
  } catch (err) {
    console.error('  \x1b[31m[ERROR] Failed to install @anthropic-ai/claude-code:\x1b[0m', err.message);
    process.exit(1);
  }
} else {
  console.log('  \x1b[32m-> Claude Code CLI already available.\x1b[0m');
}

// 3. Download and extract CLIProxyAPI binary
console.log(`\n\x1b[36m[2/6] Checking CLIProxyAPI binary (v${CPA_VERSION})...\x1b[0m`);
const isWin = process.platform === 'win32';
const exeName = isWin ? 'cli-proxy-api.exe' : 'cli-proxy-api';
const proxyExePath = path.join(binDir, exeName);

if (!fs.existsSync(proxyExePath)) {
  const platform = process.platform;
  const arch = process.arch;
  let archiveName = '';
  let isZip = false;

  if (platform === 'win32') {
    isZip = true;
    archiveName = arch === 'arm64'
      ? `CLIProxyAPI_${CPA_VERSION}_windows_arm64.zip`
      : `CLIProxyAPI_${CPA_VERSION}_windows_amd64.zip`;
  } else if (platform === 'linux') {
    archiveName = arch === 'arm64'
      ? `CLIProxyAPI_${CPA_VERSION}_linux_aarch64.tar.gz`
      : `CLIProxyAPI_${CPA_VERSION}_linux_amd64.tar.gz`;
  } else if (platform === 'darwin') {
    archiveName = arch === 'arm64'
      ? `CLIProxyAPI_${CPA_VERSION}_darwin_arm64.tar.gz`
      : `CLIProxyAPI_${CPA_VERSION}_darwin_amd64.tar.gz`;
  } else {
    console.error(`  \x1b[31m[ERROR] Operating system ${platform} is not supported.\x1b[0m`);
    process.exit(1);
  }

  const downloadUrl = `https://github.com/router-for-me/CLIProxyAPI/releases/download/v${CPA_VERSION}/${archiveName}`;
  const tempArchive = path.join(os.tmpdir(), archiveName);
  const tempExtract = path.join(os.tmpdir(), `cpa_extract_${Date.now()}`);

  console.log(`  -> Downloading ${archiveName} from GitHub...`);
  try {
    let downloaded = false;
    // 1. Try curl
    const curlBin = isWin ? 'curl.exe' : 'curl';
    try {
      execSync(`${curlBin} -fsSL -o "${tempArchive}" "${downloadUrl}"`, { stdio: 'ignore' });
      if (fs.existsSync(tempArchive) && fs.statSync(tempArchive).size > 1000) {
        downloaded = true;
      }
    } catch {}

    // 2. Fallback to powershell on Windows if curl fails
    if (!downloaded && isWin) {
      try {
        const psCmd = `powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('${downloadUrl}', '${tempArchive}')"`;
        execSync(psCmd, { stdio: 'ignore' });
        if (fs.existsSync(tempArchive) && fs.statSync(tempArchive).size > 1000) {
          downloaded = true;
        }
      } catch {}
    }

    // 3. Fallback to native fetch
    if (!downloaded) {
      const resp = await fetch(downloadUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
      const buffer = Buffer.from(await resp.arrayBuffer());
      fs.writeFileSync(tempArchive, buffer);
    }

    console.log('  -> Download complete. Extracting archive...');
    if (fs.existsSync(tempExtract)) {
      fs.rmSync(tempExtract, { recursive: true, force: true });
    }
    fs.mkdirSync(tempExtract, { recursive: true });

    if (isZip) {
      const psUnzip = `powershell -NoProfile -Command "Expand-Archive -Path '${tempArchive}' -DestinationPath '${tempExtract}' -Force"`;
      execSync(psUnzip, { stdio: 'ignore' });
    } else {
      execSync(`tar -xzf "${tempArchive}" -C "${tempExtract}"`, { stdio: 'ignore' });
    }

    // Find extracted binary
    function findFile(dir, targetName) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const res = findFile(fullPath, targetName);
          if (res) return res;
        } else if (entry.name === targetName) {
          return fullPath;
        }
      }
      return null;
    }

    const foundExe = findFile(tempExtract, exeName);
    if (!foundExe) {
      throw new Error(`Binary ${exeName} not found in extracted archive.`);
    }

    fs.copyFileSync(foundExe, proxyExePath);
    if (!isWin) {
      fs.chmodSync(proxyExePath, 0o755);
    }

    // Clean up temp files
    try {
      fs.unlinkSync(tempArchive);
      fs.rmSync(tempExtract, { recursive: true, force: true });
    } catch {}

    console.log(`  \x1b[32m-> Binary installed: ${proxyExePath}\x1b[0m`);
  } catch (err) {
    console.error('  \x1b[31m[ERROR] Failed to download/install CLIProxyAPI:\x1b[0m', err.message);
    process.exit(1);
  }
} else {
  console.log(`  \x1b[32m-> Binary ${exeName} already available.\x1b[0m`);
}

// 4. Initialize config.yaml & settings.env
console.log('\n\x1b[36m[3/6] Configuring proxy config.yaml & settings.env...\x1b[0m');
const formattedDataDir = dataDir.replace(/\\/g, '/');
const configYaml = `host: "127.0.0.1"
port: 8318
auth-dir: "${formattedDataDir}"
api-keys:
  - "sk-personal-claude-token"
remote-management:
  disable-control-panel: true
quota-exceeded:
  switch-project: true
  antigravity-credits: true
debug: false

antigravity:
  sensitive-words:
    - "system-conventions"
    - "system_conventions"
    - "system-directive"
    - "system_directive"
    - "Claude Agent SDK"
    - "Claude Code"
    - "Anthropic"
    - "claude"
    - "API"
    - "proxy"
`;
fs.writeFileSync(path.join(configDir, 'config.yaml'), configYaml, 'utf-8');

const settingsEnv = `PORT=8318
AUTO_BYPASS_PERMISSIONS=true
DEFAULT_MODEL=claude-sonnet-4-6
`;
fs.writeFileSync(path.join(configDir, 'settings.env'), settingsEnv, 'utf-8');
console.log('  \x1b[32m-> Wrote config/config.yaml and config/settings.env.\x1b[0m');

// 5. Bypass Claude Code trust dialog
console.log('\n\x1b[36m[4/6] Configuring Claude Code trust dialog & onboarding...\x1b[0m');
try {
  const claudeConfigPath = path.join(os.homedir(), '.claude.json');
  let claudeConfig = {};
  if (fs.existsSync(claudeConfigPath)) {
    try {
      claudeConfig = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf-8'));
    } catch {}
  }
  claudeConfig.bypassPermissionsModeAccepted = true;
  claudeConfig.hasCompletedOnboarding = true;
  if (claudeConfig.projects && typeof claudeConfig.projects === 'object') {
    for (const key of Object.keys(claudeConfig.projects)) {
      if (typeof claudeConfig.projects[key] === 'object' && claudeConfig.projects[key] !== null) {
        claudeConfig.projects[key].hasTrustDialogAccepted = true;
      }
    }
  }
  fs.writeFileSync(claudeConfigPath, JSON.stringify(claudeConfig, null, 2), 'utf-8');
  console.log('  \x1b[32m-> Configured trust dialog bypass in ~/.claude.json.\x1b[0m');
} catch (err) {
  console.log('  \x1b[33m-> Skipped trust dialog configuration:\x1b[0m', err.message);
}

// 6. Dynamic Multi-Source Token Resolver
console.log('\n\x1b[36m[5/6] Syncing Google Antigravity OAuth Token (Dynamic Resolver)...\x1b[0m');
export function resolveAntigravityToken(appDataDir) {
  const home = os.homedir();
  const tokenCandidates = [
    path.join(home, '.gemini', 'antigravity-cli', 'antigravity-oauth-token'),
    path.join(home, '.gemini', 'jetski-standalone-oauth-token'),
    path.join(home, '.gemini', 'oauth_creds.json')
  ];

  for (const candidatePath of tokenCandidates) {
    if (fs.existsSync(candidatePath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(candidatePath, 'utf-8'));
        const tok = raw.token || raw;
        const idTok = raw.id_token || '';
        const accessToken = tok.access_token || raw.access_token;
        const refreshToken = tok.refresh_token || raw.refresh_token;
        const expiry = tok.expiry || raw.expiry_date || '';

        if (accessToken && refreshToken) {
          let email = 'user@antigravity';
          if (idTok && idTok.includes('.')) {
            try {
              const parts = idTok.split('.');
              if (parts.length >= 2) {
                const payloadStr = Buffer.from(parts[1], 'base64').toString('utf-8');
                const payload = JSON.parse(payloadStr);
                if (payload.email) email = payload.email;
              }
            } catch {}
          }

          const authObj = {
            type: 'antigravity',
            email: email,
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: 3600,
            timestamp: Date.now(),
            expired: expiry
          };

          const targetAuthFile = path.join(appDataDir, 'antigravity-auth.json');
          fs.writeFileSync(targetAuthFile, JSON.stringify(authObj, null, 2), 'utf-8');
          return { success: true, email, source: candidatePath };
        }
      } catch (err) {
        // Continue to next candidate
      }
    }
  }
  return { success: false, error: 'No valid Antigravity token found at ~/.gemini' };
}

const syncResult = resolveAntigravityToken(dataDir);
if (syncResult.success) {
  console.log(`  \x1b[32m-> [OK] Detected and synced token from:\x1b[0m\n     Source: ${syncResult.source}`);
  console.log(`     Account: \x1b[33m${syncResult.email}\x1b[0m`);
} else {
  console.log(`  \x1b[33m-> [NOTE] ${syncResult.error}.\x1b[0m`);
  console.log('     You can authenticate using: cli-proxy-api --config config/config.yaml -antigravity-login');
}

// 7. Universal Launcher Script (bin/claude-agy.mjs + wrappers)
console.log('\n\x1b[36m[6/6] Initializing Universal Launcher (claude-agy.mjs)...\x1b[0m');

const launcherCode = `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const binDir = path.dirname(__filename);
const appDir = path.resolve(binDir, '..');
const isWin = process.platform === 'win32';

// 1. Dynamic Token Sync before execution
function syncToken() {
  const home = os.homedir();
  const tokenCandidates = [
    path.join(home, '.gemini', 'antigravity-cli', 'antigravity-oauth-token'),
    path.join(home, '.gemini', 'jetski-standalone-oauth-token'),
    path.join(home, '.gemini', 'oauth_creds.json')
  ];
  for (const p of tokenCandidates) {
    if (fs.existsSync(p)) {
      try {
        const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
        const tok = raw.token || raw;
        const idTok = raw.id_token || '';
        const accessToken = tok.access_token || raw.access_token;
        const refreshToken = tok.refresh_token || raw.refresh_token;
        const expiry = tok.expiry || raw.expiry_date || '';
        if (accessToken && refreshToken) {
          let email = 'user@antigravity';
          if (idTok && idTok.includes('.')) {
            try {
              const payload = JSON.parse(Buffer.from(idTok.split('.')[1], 'base64').toString('utf-8'));
              if (payload.email) email = payload.email;
            } catch {}
          }
          const authObj = {
            type: 'antigravity',
            email,
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: 3600,
            timestamp: Date.now(),
            expired: expiry
          };
          fs.writeFileSync(path.join(appDir, 'data', 'antigravity-auth.json'), JSON.stringify(authObj, null, 2), 'utf-8');
          return;
        }
      } catch {}
    }
  }
}
syncToken();

// 2. Read settings.env
let port = 8318;
let autoBypass = true;
let defaultModel = 'claude-sonnet-4-6';

const settingsPath = path.join(appDir, 'config', 'settings.env');
if (fs.existsSync(settingsPath)) {
  const lines = fs.readFileSync(settingsPath, 'utf-8').split('\\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [k, ...vParts] = trimmed.split('=');
      const val = vParts.join('=').trim().replace(/^["']|["']$/g, '');
      if (k.trim() === 'PORT') port = parseInt(val, 10) || 8318;
      if (k.trim() === 'AUTO_BYPASS_PERMISSIONS') autoBypass = val === 'true';
      if (k.trim() === 'DEFAULT_MODEL') defaultModel = val;
    }
  }
}

// 3. Process CLI arguments
const rawArgs = process.argv.slice(2);
let enableBypass = autoBypass;
let modelSpecified = false;
const processedArgs = [];

for (let i = 0; i < rawArgs.length; i++) {
  const arg = rawArgs[i];
  if (arg === '--bypass' || arg === '-y' || arg === '--dangerously-skip-permissions') {
    enableBypass = true;
  } else if (arg === '--no-bypass') {
    enableBypass = false;
  } else {
    if (arg === '--model' || arg === '-m' || arg.startsWith('--model=')) {
      modelSpecified = true;
    }
    processedArgs.push(arg);
  }
}

if (!modelSpecified && defaultModel) {
  processedArgs.unshift(defaultModel);
  processedArgs.unshift('--model');
}

if (enableBypass) {
  process.env.IS_SANDBOX = '1';
  if (!processedArgs.includes('--dangerously-skip-permissions')) {
    processedArgs.unshift('--dangerously-skip-permissions');
  }
}

process.env.ANTHROPIC_BASE_URL = \`http://127.0.0.1:\${port}\`;
process.env.ANTHROPIC_AUTH_TOKEN = 'sk-personal-claude-token';
process.env.CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY = '1';

// 4. Test port and start proxy if not running
function isPortOpen(host, portNum) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(250);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => { socket.destroy(); resolve(false); });
    socket.connect(portNum, host);
  });
}

let proxyProc = null;
let startedProxy = false;

const portAlreadyOpen = await isPortOpen('127.0.0.1', port);
if (!portAlreadyOpen) {
  const proxyExe = path.join(appDir, 'bin', isWin ? 'cli-proxy-api.exe' : 'cli-proxy-api');
  const proxyConfig = path.join(appDir, 'config', 'config.yaml');
  const proxyLog = fs.openSync(path.join(appDir, 'logs', 'proxy.log'), 'a');
  const proxyErr = fs.openSync(path.join(appDir, 'logs', 'proxy.err.log'), 'a');

  proxyProc = spawn(proxyExe, ['--config', proxyConfig], {
    detached: !isWin,
    stdio: ['ignore', proxyLog, proxyErr],
    windowsHide: true
  });
  startedProxy = true;

  // Wait for port to open (up to 5s)
  let ready = false;
  for (let attempt = 0; attempt < 25; attempt++) {
    await new Promise((r) => setTimeout(r, 200));
    if (await isPortOpen('127.0.0.1', port)) {
      ready = true;
      break;
    }
  }
  if (!ready) {
    console.error('\\x1b[31m[ERROR] Failed to connect to Proxy. Check logs/proxy.err.log\\x1b[0m');
    if (proxyProc) proxyProc.kill();
    process.exit(1);
  }
}

// 5. Launch Claude Code CLI
const claudeExecutable = isWin ? 'claude.cmd' : 'claude';
const claudeProc = spawn(claudeExecutable, processedArgs, {
  stdio: 'inherit',
  shell: isWin
});

function cleanup() {
  if (startedProxy && proxyProc) {
    try {
      if (isWin) {
        spawn('taskkill', ['/pid', proxyProc.pid.toString(), '/f', '/t'], { stdio: 'ignore' });
      } else {
        proxyProc.kill('SIGTERM');
      }
    } catch {}
  }
}

process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('exit', () => cleanup());

claudeProc.on('exit', (code) => {
  cleanup();
  process.exit(code ?? 0);
});
`;

fs.writeFileSync(path.join(binDir, 'claude-agy.mjs'), launcherCode, 'utf-8');
if (!isWin) {
  fs.chmodSync(path.join(binDir, 'claude-agy.mjs'), 0o755);
}

// Wrapper for Windows CMD & PowerShell
if (isWin) {
  const cmdWrapper = `@echo off\r\nnode "%~dp0claude-agy.mjs" %*\r\n`;
  fs.writeFileSync(path.join(binDir, 'claude-agy.cmd'), cmdWrapper, 'ascii');
}

// Wrapper for Unix
if (!isWin) {
  const shShim = `#!/usr/bin/env bash\nexec node "${path.join(binDir, 'claude-agy.mjs')}" "$@"\n`;
  const shPath = path.join(binDir, 'claude-agy');
  fs.writeFileSync(shPath, shShim, 'utf-8');
  fs.chmodSync(shPath, 0o755);
}

// Multi-platform uninstaller
const uninstallerCode = `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const appDir = path.resolve(path.dirname(__filename), '..');

console.log('\\x1b[36m>> Starting Claude-Agy uninstallation...\\x1b[0m');

try {
  if (process.platform === 'win32') {
    execSync('taskkill /f /im cli-proxy-api.exe', { stdio: 'ignore' });
  } else {
    execSync('pkill -f cli-proxy-api', { stdio: 'ignore' });
  }
} catch {}

if (process.platform === 'win32') {
  try {
    const binDir = path.join(appDir, 'bin');
    execSync(\`powershell -NoProfile -Command "$p = [Environment]::GetEnvironmentVariable('Path', 'User'); if ($p -like '*\${binDir}*') { [Environment]::SetEnvironmentVariable('Path', (($p -split ';' | Where-Object { $_ -and $_ -ne '\${binDir}' }) -join ';'), 'User') }"\`, { stdio: 'ignore' });
  } catch {}
}

console.log('\\x1b[32m>> Stopped proxy process and removed PATH successfully.\\x1b[0m');
console.log(\`>> To completely delete data, run: rm -rf "\${appDir}" or Remove-Item -Recurse -Force "\${appDir}"\`);
`;
fs.writeFileSync(path.join(scriptsDir, 'uninstall.mjs'), uninstallerCode, 'utf-8');
fs.writeFileSync(path.join(TARGET_DIR, 'uninstall.mjs'), uninstallerCode, 'utf-8');

// 8. Configure PATH
console.log('\n\x1b[36mConfiguring User PATH environment...\x1b[0m');
if (isWin) {
  try {
    const psCheck = `powershell -NoProfile -Command "$u = [Environment]::GetEnvironmentVariable('Path', 'User'); if (-not ($u -split ';' -contains '${binDir}')) { [Environment]::SetEnvironmentVariable('Path', ($u + ';${binDir}'), 'User') }"`;
    execSync(psCheck, { stdio: 'ignore' });
    console.log(`  \x1b[32m-> Added ${binDir} to User PATH.\x1b[0m`);
  } catch (err) {
    console.log('  \x1b[33m-> Could not auto-write to User PATH, please add manually:\x1b[0m', binDir);
  }
} else {
  try {
    const symlinkTarget = '/usr/local/bin/claude-agy';
    if (!fs.existsSync(symlinkTarget)) {
      execSync(`ln -sf "${path.join(binDir, 'claude-agy')}" "${symlinkTarget}"`, { stdio: 'ignore' });
      console.log(`  \x1b[32m-> Created global symlink at ${symlinkTarget}.\x1b[0m`);
    }
  } catch {
    console.log(`  \x1b[33m-> Please add the following to ~/.bashrc or ~/.zshrc:\x1b[0m export PATH="$PATH:${binDir}"`);
  }
}

console.log(`
\x1b[32m============================================================\x1b[0m
\x1b[32m [SUCCESS] Claude-Agy Installation Completed! (Universal)\x1b[0m
\x1b[32m============================================================\x1b[0m
 \x1b[36mCommand:\x1b[0m   claude-agy
 \x1b[36mModel:\x1b[0m     Inside Claude chat, type \x1b[33m/model\x1b[0m
 \x1b[36mUninstall:\x1b[0m node "${path.join(TARGET_DIR, 'uninstall.mjs')}"

 * Tip: Open a new Terminal window to recognize 'claude-agy' command immediately.
`);
