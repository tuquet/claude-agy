#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function isValidAntigravityToken(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return false;
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > 1024 * 1024 || stat.size < 20) return false;
    const content = fs.readFileSync(filePath, 'utf-8');
    const json = JSON.parse(content);
    if (!json) return false;
    const tok = json.token || json;
    const hasAccess = !!(tok.access_token || json.access_token);
    const hasRefresh = !!(tok.refresh_token || json.refresh_token);
    return hasAccess || hasRefresh;
  } catch {
    return false;
  }
}

export function findAntigravityToken(appDataDir, explicitPath = null) {
  if (explicitPath && isValidAntigravityToken(explicitPath)) return explicitPath;

  if (process.env.ANTIGRAVITY_TOKEN_PATH && isValidAntigravityToken(process.env.ANTIGRAVITY_TOKEN_PATH)) {
    return process.env.ANTIGRAVITY_TOKEN_PATH;
  }
  if (process.env.GEMINI_TOKEN_PATH && isValidAntigravityToken(process.env.GEMINI_TOKEN_PATH)) {
    return process.env.GEMINI_TOKEN_PATH;
  }

  const settingsPath = path.join(appDataDir, '..', 'config', 'settings.env');
  if (fs.existsSync(settingsPath)) {
    try {
      const lines = fs.readFileSync(settingsPath, 'utf-8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const [k, ...vParts] = trimmed.split('=');
          const key = k.trim();
          const val = vParts.join('=').trim().replace(/^["']|["']$/g, '');
          if ((key === 'ANTIGRAVITY_TOKEN_PATH' || key === 'TOKEN_PATH') && val) {
            if (isValidAntigravityToken(val)) return val;
          }
        }
      }
    } catch {}
  }

  const home = os.homedir();
  const isWin = process.platform === 'win32';
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

  for (const cand of candidates) {
    if (isValidAntigravityToken(cand)) return cand;
  }

  const geminiDir = path.join(home, '.gemini');
  if (fs.existsSync(geminiDir)) {
    const skipDirs = new Set(['brain', 'history', 'tmp', 'code_tracker', 'crashes', 'browser_recordings', 'conversations', 'implicit', 'playground', 'plugins', 'skills']);
    try {
      const rootEntries = fs.readdirSync(geminiDir, { withFileTypes: true });
      for (const ent of rootEntries) {
        const fullPath = path.join(geminiDir, ent.name);
        if (ent.isFile()) {
          if (/token|oauth|cred|auth|\.json$/i.test(ent.name) && isValidAntigravityToken(fullPath)) {
            return fullPath;
          }
        } else if (ent.isDirectory() && !skipDirs.has(ent.name)) {
          try {
            const subEntries = fs.readdirSync(fullPath, { withFileTypes: true });
            for (const sub of subEntries) {
              if (sub.isFile() && /token|oauth|cred|auth|\.json$/i.test(sub.name)) {
                const subPath = path.join(fullPath, sub.name);
                if (isValidAntigravityToken(subPath)) return subPath;
              }
            }
          } catch {}
        }
      }
    } catch {}
  }

  const searchRoots = [];
  if (isWin) {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    searchRoots.push(path.join(appData, 'Antigravity'), path.join(appData, 'Antigravity IDE'), path.join(localAppData, 'antigravity'));
  } else {
    searchRoots.push(path.join(home, '.config', 'Antigravity'), path.join(home, '.config', 'antigravity'), path.join(home, 'Library', 'Application Support', 'Antigravity'));
  }

  const skipConfigDirs = new Set(['Cache', 'Code Cache', 'GPUCache', 'logs', 'User', 'WebStorage', 'Network', 'blob_storage', 'Session Storage']);
  for (const root of searchRoots) {
    if (fs.existsSync(root)) {
      try {
        const entries = fs.readdirSync(root, { withFileTypes: true });
        for (const ent of entries) {
          const fullPath = path.join(root, ent.name);
          if (ent.isFile()) {
            if (/token|oauth|cred|auth|\.json$/i.test(ent.name) && isValidAntigravityToken(fullPath)) {
              return fullPath;
            }
          } else if (ent.isDirectory() && !skipConfigDirs.has(ent.name)) {
            try {
              const subEntries = fs.readdirSync(fullPath, { withFileTypes: true });
              for (const sub of subEntries) {
                if (sub.isFile() && /token|oauth|cred|auth|\.json$/i.test(sub.name)) {
                  const subPath = path.join(fullPath, sub.name);
                  if (isValidAntigravityToken(subPath)) return subPath;
                }
              }
            } catch {}
          }
        }
      } catch {}
    }
  }

  return null;
}

export function resolveAntigravityToken(appDataDir, customTokenPath = null) {
  const tokenFile = findAntigravityToken(appDataDir, customTokenPath);
  if (!tokenFile) {
    return {
      success: false,
      error: 'No valid Antigravity OAuth token detected (searched ~/.gemini, config dirs, env vars)'
    };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(tokenFile, 'utf-8'));
    const tok = raw.token || raw;
    const idTok = raw.id_token || '';
    const accessToken = tok.access_token || raw.access_token;
    const refreshToken = tok.refresh_token || raw.refresh_token;
    const expiry = tok.expiry || raw.expiry_date || '';
    const projectId = raw.project_id || tok.project_id || 'aicode-consumers';

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
    if (email === 'user@antigravity') {
      if (raw.email) {
        email = raw.email;
      } else {
        const gaPath = path.join(os.homedir(), '.gemini', 'google_accounts.json');
        if (fs.existsSync(gaPath)) {
          try {
            const ga = JSON.parse(fs.readFileSync(gaPath, 'utf-8'));
            if (typeof ga.active === 'string' && ga.active.includes('@')) {
              email = ga.active;
            }
          } catch {}
        }
      }
    }

    const authObj = {
      type: 'antigravity',
      email: email,
      access_token: accessToken,
      refresh_token: refreshToken,
      project_id: projectId,
      disabled: false,
      expires_in: 3600,
      timestamp: Date.now(),
      expired: expiry
    };

    if (!fs.existsSync(appDataDir)) fs.mkdirSync(appDataDir, { recursive: true });
    const targetAuthFile = path.join(appDataDir, 'antigravity-auth.json');
    fs.writeFileSync(targetAuthFile, JSON.stringify(authObj, null, 2), 'utf-8');
    return { success: true, email, source: tokenFile };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

import { fileURLToPath } from 'node:url';

// Standalone execution support
const isDirectRun = process.argv[1] && (
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) ||
  process.argv[1].endsWith('sync-token.mjs')
);

if (isDirectRun) {
  const isQuiet = process.argv.includes('--quiet') || process.argv.includes('-q');
  const nonFlagArgs = process.argv.slice(2).filter(a => !a.startsWith('-'));
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const appDirArg = nonFlagArgs[0] ? path.resolve(nonFlagArgs[0]) : path.resolve(scriptDir, '..');
  const customPathArg = nonFlagArgs[1] || null;
  const targetDataDir = path.join(appDirArg, 'data');
  const result = resolveAntigravityToken(targetDataDir, customPathArg);
  if (!isQuiet) {
    if (result.success) {
      console.log(`[OK] Antigravity token synced (${result.email})`);
    } else {
      console.log(`[WARN] ${result.error}`);
    }
  }
}
