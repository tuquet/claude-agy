#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const binDir = path.dirname(__filename);
const appDir = path.resolve(binDir, '..');
const isWin = process.platform === 'win32';

function isValidToken(p) {
  if (!p || !fs.existsSync(p)) return false;
  try {
    const stat = fs.statSync(p);
    if (!stat.isFile() || stat.size > 1024 * 1024 || stat.size < 20) return false;
    const json = JSON.parse(fs.readFileSync(p, 'utf-8'));
    if (!json) return false;
    const tok = json.token || json;
    return !!(tok.access_token || json.access_token || tok.refresh_token || json.refresh_token);
  } catch { return false; }
}

function findToken(explicitPath) {
  if (explicitPath && isValidToken(explicitPath)) return explicitPath;
  if (process.env.ANTIGRAVITY_TOKEN_PATH && isValidToken(process.env.ANTIGRAVITY_TOKEN_PATH)) {
    return process.env.ANTIGRAVITY_TOKEN_PATH;
  }
  if (process.env.GEMINI_TOKEN_PATH && isValidToken(process.env.GEMINI_TOKEN_PATH)) {
    return process.env.GEMINI_TOKEN_PATH;
  }

  const settingsPath = path.join(appDir, 'config', 'settings.env');
  if (fs.existsSync(settingsPath)) {
    try {
      const lines = fs.readFileSync(settingsPath, 'utf-8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const [k, ...vParts] = trimmed.split('=');
          const key = k.trim();
          const val = vParts.join('=').trim().replace(/^["']|["']$/g, '');
          if ((key === 'ANTIGRAVITY_TOKEN_PATH' || key === 'TOKEN_PATH') && isValidToken(val)) {
            return val;
          }
        }
      }
    } catch {}
  }

  const home = os.homedir();
  const candidates = [
    path.join(home, '.gemini', 'antigravity-cli', 'antigravity-oauth-token'),
    path.join(home, '.gemini', 'jetski-standalone-oauth-token'),
    path.join(home, '.gemini', 'oauth_creds.json'),
    path.join(home, '.gemini', 'antigravity', 'oauth_creds.json'),
    path.join(home, '.gemini', 'antigravity-ide', 'oauth_creds.json')
  ];
  if (isWin) {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    candidates.push(path.join(appData, 'Antigravity', 'oauth_creds.json'));
    candidates.push(path.join(appData, 'Antigravity IDE', 'oauth_creds.json'));
    candidates.push(path.join(localAppData, 'antigravity', 'oauth_creds.json'));
  } else {
    candidates.push(path.join(home, '.config', 'Antigravity', 'oauth_creds.json'));
    candidates.push(path.join(home, '.config', 'antigravity', 'oauth_creds.json'));
    candidates.push(path.join(home, 'Library', 'Application Support', 'Antigravity', 'oauth_creds.json'));
  }
  for (const c of candidates) {
    if (isValidToken(c)) return c;
  }

  const geminiDir = path.join(home, '.gemini');
  if (fs.existsSync(geminiDir)) {
    const skipDirs = new Set(['brain', 'history', 'tmp', 'code_tracker', 'crashes', 'browser_recordings', 'conversations', 'implicit', 'playground', 'plugins', 'skills']);
    try {
      for (const ent of fs.readdirSync(geminiDir, { withFileTypes: true })) {
        const fullPath = path.join(geminiDir, ent.name);
        if (ent.isFile() && /token|oauth|cred|auth|\.json$/i.test(ent.name) && isValidToken(fullPath)) return fullPath;
        if (ent.isDirectory() && !skipDirs.has(ent.name)) {
          try {
            for (const sub of fs.readdirSync(fullPath, { withFileTypes: true })) {
              const subPath = path.join(fullPath, sub.name);
              if (sub.isFile() && /token|oauth|cred|auth|\.json$/i.test(sub.name) && isValidToken(subPath)) return subPath;
            }
          } catch {}
        }
      }
    } catch {}
  }
  return null;
}

function syncToken(explicitPath) {
  const tokenFile = findToken(explicitPath);
  if (!tokenFile) return;
  try {
    const raw = JSON.parse(fs.readFileSync(tokenFile, 'utf-8'));
    const tok = raw.token || raw;
    const idTok = raw.id_token || '';
    const accessToken = tok.access_token || raw.access_token;
    const refreshToken = tok.refresh_token || raw.refresh_token;
    const expiry = tok.expiry || raw.expiry_date || '';
    const projectId = raw.project_id || tok.project_id || 'aicode-consumers';
    if (!accessToken && !refreshToken) return;

    let email = 'user@antigravity';
    if (idTok && idTok.includes('.')) {
      try {
        const payload = JSON.parse(Buffer.from(idTok.split('.')[1], 'base64').toString('utf-8'));
        if (payload.email) email = payload.email;
      } catch {}
    }
    if (email === 'user@antigravity') {
      if (raw.email) email = raw.email;
      else {
        const gaPath = path.join(os.homedir(), '.gemini', 'google_accounts.json');
        if (fs.existsSync(gaPath)) {
          try {
            const ga = JSON.parse(fs.readFileSync(gaPath, 'utf-8'));
            if (typeof ga.active === 'string' && ga.active.includes('@')) email = ga.active;
          } catch {}
        }
      }
    }
    const authObj = {
      type: 'antigravity',
      email,
      access_token: accessToken,
      refresh_token: refreshToken,
      project_id: projectId,
      disabled: false,
      expires_in: 3600,
      timestamp: Date.now(),
      expired: expiry
    };
    const dataDir = path.join(appDir, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'antigravity-auth.json'), JSON.stringify(authObj, null, 2), 'utf-8');
  } catch {}
}

// 0. Handle self-update
if (process.argv.length === 3 && (process.argv[2] === 'update' || process.argv[2] === 'upgrade' || process.argv[2] === '--update')) {
  console.log('\x1b[36m============================================================\x1b[0m');
  console.log('\x1b[36m Updating Claude-Agy & Claude Code CLI...\x1b[0m');
  console.log('\x1b[36m============================================================\x1b[0m');

  const isScoop = appDir.includes(path.join('scoop', 'apps'));
  if (isScoop) {
    console.log('>> Updating Scoop package...');
    try {
      execSync('scoop update && scoop update claude-agy', { stdio: 'inherit', shell: true });
    } catch {}
  } else {
    console.log('>> Updating Claude-Agy from GitHub...');
    try {
      if (isWin) {
        execSync('powershell -NoProfile -Command "irm https://raw.githubusercontent.com/tuquet/claude-agy/main/scripts/setup.ps1 | iex"', { stdio: 'inherit' });
      } else {
        execSync('curl -fsSL https://raw.githubusercontent.com/tuquet/claude-agy/main/scripts/setup.sh | bash', { stdio: 'inherit' });
      }
    } catch {}
  }

  console.log('\n>> Updating Claude Code CLI...');
  try {
    const claudeExe = isWin ? 'claude.cmd' : 'claude';
    execSync(claudeExe + ' update', { stdio: 'inherit', shell: true });
  } catch {}

  console.log('\n>> Re-synchronizing Antigravity token...');
  syncToken(process.env.ANTIGRAVITY_TOKEN_PATH || null);

  console.log('\n\x1b[32m[SUCCESS] Claude-Agy is fully up to date!\x1b[0m');
  process.exit(0);
}

// 1. Read settings.env
let port = 8318;
let autoBypass = true;
let defaultModel = 'claude-sonnet-4-6';
let configTokenPath = null;

const settingsPath = path.join(appDir, 'config', 'settings.env');
if (fs.existsSync(settingsPath)) {
  const lines = fs.readFileSync(settingsPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [k, ...vParts] = trimmed.split('=');
      const val = vParts.join('=').trim().replace(/^["']|["']$/g, '');
      if (k.trim() === 'PORT') port = parseInt(val, 10) || 8318;
      if (k.trim() === 'AUTO_BYPASS_PERMISSIONS') autoBypass = val === 'true';
      if (k.trim() === 'DEFAULT_MODEL') defaultModel = val;
      if (k.trim() === 'ANTIGRAVITY_TOKEN_PATH' || k.trim() === 'TOKEN_PATH') configTokenPath = val;
    }
  }
}

// 2. Process CLI arguments
const rawArgs = process.argv.slice(2);
let enableBypass = autoBypass;
let modelSpecified = false;
let customTokenPath = process.env.ANTIGRAVITY_TOKEN_PATH || process.env.GEMINI_TOKEN_PATH || configTokenPath;
const processedArgs = [];

for (let i = 0; i < rawArgs.length; i++) {
  const arg = rawArgs[i];
  if (arg === '--bypass' || arg === '-y' || arg === '--dangerously-skip-permissions') {
    enableBypass = true;
  } else if (arg === '--no-bypass') {
    enableBypass = false;
  } else if (arg === '--token-path' || arg === '-t') {
    if (i + 1 < rawArgs.length) {
      customTokenPath = rawArgs[++i];
    }
  } else if (arg.startsWith('--token-path=')) {
    customTokenPath = arg.substring(13).replace(/^["']|["']$/g, '');
  } else {
    if (arg === '--model' || arg === '-m' || arg.startsWith('--model=')) {
      modelSpecified = true;
    }
    processedArgs.push(arg);
  }
}

syncToken(customTokenPath);

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

process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
process.env.ANTHROPIC_AUTH_TOKEN = 'sk-personal-claude-token';
process.env.CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY = '1';

// 3. Test port and start proxy if not running
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

  let ready = false;
  for (let attempt = 0; attempt < 25; attempt++) {
    await new Promise((r) => setTimeout(r, 200));
    if (await isPortOpen('127.0.0.1', port)) {
      ready = true;
      break;
    }
  }
  if (!ready) {
    console.error('\x1b[31m[ERROR] Failed to connect to Proxy. Check logs/proxy.err.log\x1b[0m');
    if (proxyProc) proxyProc.kill();
    process.exit(1);
  }
}

// 4. Launch Claude Code CLI
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
