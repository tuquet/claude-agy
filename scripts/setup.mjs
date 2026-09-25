#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const currentDir = path.dirname(__filename);
const isWin = process.platform === 'win32';

const targetDir = path.resolve(process.env.TARGET_DIR || path.join(os.homedir(), 'claude-agy'));
const binDir = path.join(targetDir, 'bin');
const configDir = path.join(targetDir, 'config');
const dataDir = path.join(targetDir, 'data');
const logsDir = path.join(targetDir, 'logs');
const scriptsDir = path.join(targetDir, 'scripts');

console.log('\x1b[36m============================================================\x1b[0m');
console.log('\x1b[36m [SETUP] Claude-Agy Universal Installer (Node.js)\x1b[0m');
console.log('\x1b[36m============================================================\x1b[0m');
console.log(`Target directory: ${targetDir}`);

// 1. Check Node.js
console.log('\n\x1b[36m[1/6] Checking Node.js runtime...\x1b[0m');
const nodeVersion = process.versions.node;
const major = parseInt(nodeVersion.split('.')[0], 10);
if (major < 18) {
  console.error(`\x1b[31m[ERROR] Node.js 18+ required (detected v${nodeVersion}).\x1b[0m`);
  process.exit(1);
}
console.log(`  \x1b[32m-> Node.js OK: v${nodeVersion}\x1b[0m`);

// 2. Check Claude Code CLI
console.log('\n\x1b[36m[2/6] Checking Anthropic Claude Code CLI...\x1b[0m');
let claudeAvailable = false;
try {
  execSync(isWin ? 'where claude' : 'which claude', { stdio: 'ignore' });
  claudeAvailable = true;
} catch {}

if (!claudeAvailable) {
  console.log('  -> Installing @anthropic-ai/claude-code via npm...');
  try {
    execSync('npm install -g @anthropic-ai/claude-code', { stdio: 'inherit' });
    console.log('  \x1b[32m-> Installed Claude Code CLI successfully.\x1b[0m');
  } catch (err) {
    console.error('  \x1b[31m[ERROR] Failed to install @anthropic-ai/claude-code.\x1b[0m');
    process.exit(1);
  }
} else {
  console.log('  \x1b[32m-> Claude Code CLI already available.\x1b[0m');
}

// 3. Create target directory structure
for (const dir of [targetDir, binDir, configDir, dataDir, logsDir, scriptsDir]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// 4. Resolve and Deploy Claude-Agy Components (bin, scripts, config)
console.log('\n\x1b[36m[3/6] Deploying Claude-Agy components...\x1b[0m');
let localRoot = null;
if (fs.existsSync(path.join(currentDir, '..', 'bin', 'claude-agy.ps1'))) {
  localRoot = path.resolve(path.join(currentDir, '..'));
} else if (fs.existsSync(path.join(currentDir, 'bin', 'claude-agy.ps1'))) {
  localRoot = path.resolve(currentDir);
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const ent of entries) {
    const srcPath = path.join(src, ent.name);
    const destPath = path.join(dest, ent.name);
    if (ent.isDirectory()) {
      if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true });
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (localRoot) {
  copyDirRecursive(path.join(localRoot, 'bin'), binDir);
  copyDirRecursive(path.join(localRoot, 'scripts'), scriptsDir);
  if (!fs.existsSync(path.join(configDir, 'settings.env'))) {
    copyDirRecursive(path.join(localRoot, 'config'), configDir);
  }
  console.log(`  \x1b[32m-> Deployed components from local source (${localRoot}).\x1b[0m`);
} else {
  console.log('  -> Fetching latest components from GitHub repository...');
  const archiveUrl = 'https://github.com/tuquet/claude-agy/archive/refs/heads/main.zip';
  const tempZip = path.join(os.tmpdir(), `claude-agy-${Date.now()}.zip`);
  const tempExtract = path.join(os.tmpdir(), `claude-agy-extract-${Date.now()}`);
  try {
    let resp;
    try {
      resp = await fetch(archiveUrl);
    } catch (err) {
      if (err.cause?.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || err.message?.includes('certificate')) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        resp = await fetch(archiveUrl);
      } else {
        throw err;
      }
    }
    if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    fs.writeFileSync(tempZip, Buffer.from(await resp.arrayBuffer()));

    if (isWin) {
      execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${tempZip}' -DestinationPath '${tempExtract}' -Force"`, { stdio: 'ignore' });
    } else {
      execSync(`unzip -q -o "${tempZip}" -d "${tempExtract}"`, { stdio: 'ignore' });
    }
    const extractedRoot = path.join(tempExtract, 'claude-agy-main');
    copyDirRecursive(path.join(extractedRoot, 'bin'), binDir);
    copyDirRecursive(path.join(extractedRoot, 'scripts'), scriptsDir);
    if (!fs.existsSync(path.join(configDir, 'settings.env'))) {
      copyDirRecursive(path.join(extractedRoot, 'config'), configDir);
    }
    console.log('  \x1b[32m-> Successfully fetched and extracted components.\x1b[0m');
  } finally {
    try { fs.unlinkSync(tempZip); } catch {}
    try { fs.rmSync(tempExtract, { recursive: true, force: true }); } catch {}
  }
}

if (!isWin) {
  try {
    fs.chmodSync(path.join(binDir, 'claude-agy'), 0o755);
    fs.chmodSync(path.join(scriptsDir, 'sync-token.mjs'), 0o755);
    fs.chmodSync(path.join(scriptsDir, 'uninstall.sh'), 0o755);
    fs.copyFileSync(path.join(scriptsDir, 'uninstall.sh'), path.join(targetDir, 'uninstall.sh'));
    fs.chmodSync(path.join(targetDir, 'uninstall.sh'), 0o755);
  } catch {}
} else {
  try {
    fs.copyFileSync(path.join(scriptsDir, 'uninstall.ps1'), path.join(targetDir, 'uninstall.ps1'));
  } catch {}
}

// 5. Download CLIProxyAPI binary
console.log('\n\x1b[36m[4/6] Checking CLIProxyAPI native binary...\x1b[0m');
const cpaVersion = '7.3.17';
const exeName = isWin ? 'cli-proxy-api.exe' : 'cli-proxy-api';
const proxyExePath = path.join(binDir, exeName);

if (!fs.existsSync(proxyExePath)) {
  const osType = process.platform;
  const archType = process.arch;
  let osName = 'linux';
  let archName = 'amd64';
  let isZip = false;

  if (osType === 'win32') {
    osName = 'windows';
    archName = archType === 'arm64' ? 'arm64' : 'amd64';
    isZip = true;
  } else if (osType === 'darwin') {
    osName = 'darwin';
    archName = archType === 'arm64' ? 'arm64' : 'amd64';
  } else {
    osName = 'linux';
    archName = archType === 'arm64' ? 'arm64' : 'amd64';
  }

  const ext = isZip ? 'zip' : 'tar.gz';
  const downloadUrl = `https://github.com/router-for-me/CLIProxyAPI/releases/download/v${cpaVersion}/CLIProxyAPI_${cpaVersion}_${osName}_${archName}.${ext}`;
  console.log(`  -> Downloading CLIProxyAPI v${cpaVersion} for ${osName}-${archName}...`);

  const tempArchive = path.join(os.tmpdir(), `cpa-${Date.now()}.${ext}`);
  const tempExtract = path.join(os.tmpdir(), `cpa-extract-${Date.now()}`);
  try {
    let resp;
    try {
      resp = await fetch(downloadUrl);
    } catch (err) {
      if (err.cause?.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || err.message?.includes('certificate')) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        resp = await fetch(downloadUrl);
      } else {
        throw err;
      }
    }
    if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    fs.writeFileSync(tempArchive, Buffer.from(await resp.arrayBuffer()));

    fs.mkdirSync(tempExtract, { recursive: true });
    if (isZip) {
      execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${tempArchive}' -DestinationPath '${tempExtract}' -Force"`, { stdio: 'ignore' });
    } else {
      execSync(`tar -xzf "${tempArchive}" -C "${tempExtract}"`, { stdio: 'ignore' });
    }

    function findBinary(dir, name) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          const res = findBinary(full, name);
          if (res) return res;
        } else if (ent.name === name) {
          return full;
        }
      }
      return null;
    }

    const found = findBinary(tempExtract, exeName);
    if (!found) throw new Error(`Binary ${exeName} not found in archive.`);
    fs.copyFileSync(found, proxyExePath);
    if (!isWin) fs.chmodSync(proxyExePath, 0o755);
    console.log(`  \x1b[32m-> Installed binary: ${proxyExePath}\x1b[0m`);
  } finally {
    try { fs.unlinkSync(tempArchive); } catch {}
    try { fs.rmSync(tempExtract, { recursive: true, force: true }); } catch {}
  }
} else {
  console.log(`  \x1b[32m-> Binary ${exeName} already available.\x1b[0m`);
}

// Fix auth-dir in config.yaml
const configYamlPath = path.join(configDir, 'config.yaml');
if (fs.existsSync(configYamlPath)) {
  const formattedDataDir = dataDir.replace(/\\/g, '/');
  let yaml = fs.readFileSync(configYamlPath, 'utf-8');
  yaml = yaml.replace('auth-dir: ""', `auth-dir: "${formattedDataDir}"`);
  fs.writeFileSync(configYamlPath, yaml, 'utf-8');
}

// 6. Configure User PATH / symlink
console.log('\n\x1b[36m[5/6] Configuring system PATH / symlink...\x1b[0m');
const isScoop = process.env.SCOOP_DIR || targetDir.includes(path.join('scoop', 'apps'));
if (!isScoop) {
  if (isWin) {
    try {
      const userPath = execSync('powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable(\'Path\', \'User\')"', { encoding: 'utf-8' }).trim();
      if (!userPath.includes(binDir)) {
        const newPath = userPath ? `${userPath};${binDir}` : binDir;
        execSync(`powershell -NoProfile -Command "[Environment]::SetEnvironmentVariable('Path', '${newPath}', 'User')"`);
        console.log(`  \x1b[32m-> Added ${binDir} to User PATH.\x1b[0m`);
      } else {
        console.log(`  \x1b[32m-> ${binDir} already in User PATH.\x1b[0m`);
      }
    } catch {}
  } else {
    try {
      execSync(`sudo ln -sf "${path.join(binDir, 'claude-agy')}" /usr/local/bin/claude-agy 2>/dev/null || ln -sf "${path.join(binDir, 'claude-agy')}" "$HOME/.local/bin/claude-agy"`);
      console.log('  \x1b[32m-> Created symlink for claude-agy.\x1b[0m');
    } catch {}
  }
} else {
  console.log('  \x1b[32m-> Scoop environment: Scoop shims manage the command.\x1b[0m');
}

// 7. Initial token synchronization
console.log('\n\x1b[36m[6/6] Synchronizing Google Antigravity OAuth token...\x1b[0m');
const syncModulePath = path.join(scriptsDir, 'sync-token.mjs');
if (fs.existsSync(syncModulePath)) {
  try {
    const { resolveAntigravityToken } = await import(syncModulePath);
    const result = resolveAntigravityToken(dataDir, process.env.ANTIGRAVITY_TOKEN_PATH || null);
    if (result.success) {
      console.log(`  \x1b[32m-> [OK] Antigravity token synced (${result.email})\x1b[0m`);
    } else {
      console.log(`  \x1b[33m-> [WARN] ${result.error}\x1b[0m`);
    }
  } catch (err) {
    console.log(`  \x1b[33m-> Token sync warning: ${err.message}\x1b[0m`);
  }
}

console.log('\n\x1b[32m============================================================\x1b[0m');
console.log('\x1b[32m [SUCCESS] Claude-Agy setup completed!\x1b[0m');
console.log('\x1b[32m============================================================\x1b[0m');
console.log(' Command:   \x1b[32mclaude-agy\x1b[0m');
console.log(' Update:    \x1b[36mclaude-agy update\x1b[0m');
console.log(` Uninstall: ${path.join(targetDir, isWin ? 'uninstall.ps1' : 'uninstall.sh')}`);
