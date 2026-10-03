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
const symlinkPath = '/usr/local/bin/claude-agy';
const bashrcPath = path.join(os.homedir(), '.bashrc');

console.log('\x1b[34m==>\x1b[0m Starting Claude-Agy uninstallation...');

// 1. Stop proxy process on port 8318
console.log('\x1b[34m==>\x1b[0m Stopping proxy process on port 8318 (if running)...');
try {
  if (isWin) {
    execSync('powershell -NoProfile -Command "Get-Process -Name cli-proxy-api -ErrorAction SilentlyContinue | Stop-Process -Force"', { stdio: 'ignore' });
  } else {
    execSync('pkill -f "cli-proxy-api.*8318" 2>/dev/null || true', { stdio: 'ignore' });
  }
} catch {}

// 2. Remove system-wide symlink or PATH
if (!isWin) {
  if (fs.existsSync(symlinkPath) || (fs.lstatSync(symlinkPath, { throwIfNoEntry: false }))) {
    console.log(`\x1b[34m==>\x1b[0m Removing symlink ${symlinkPath}...`);
    try {
      execSync(`sudo rm -f "${symlinkPath}" 2>/dev/null || rm -f "${symlinkPath}"`, { stdio: 'ignore' });
    } catch {}
  }
} else {
  try {
    const userPath = execSync('powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable(\'Path\', \'User\')"', { encoding: 'utf-8' }).trim();
    if (userPath.includes(binDir)) {
      const parts = userPath.split(';').filter(p => p.trim() && p.trim() !== binDir);
      const newPath = parts.join(';');
      execSync(`powershell -NoProfile -Command "[Environment]::SetEnvironmentVariable('Path', '${newPath}', 'User')"`, { stdio: 'ignore' });
      console.log(`\x1b[32m-> Removed ${binDir} from User PATH.\x1b[0m`);
    }
  } catch {}
}

// 3. Clean up ~/.bashrc
if (fs.existsSync(bashrcPath)) {
  try {
    const content = fs.readFileSync(bashrcPath, 'utf-8');
    const markerStart = '# >>> claude-agy begin >>>';
    const markerEnd = '# <<< claude-agy end <<<';
    if (content.includes(markerStart)) {
      const lines = content.split('\n');
      const filtered = [];
      let inBlock = false;
      for (const line of lines) {
        if (line.includes(markerStart)) {
          inBlock = true;
          continue;
        }
        if (line.includes(markerEnd)) {
          inBlock = false;
          continue;
        }
        if (!inBlock) filtered.push(line);
      }
      fs.writeFileSync(bashrcPath, filtered.join('\n'), 'utf-8');
      console.log('  \x1b[32m-> Cleaned up ~/.bashrc wrapper function.\x1b[0m');
    }
  } catch {}
}

// 4. Optionally remove target directory if specified
const removeAll = process.argv.includes('--all') || process.argv.includes('-a');
if (removeAll && fs.existsSync(targetDir)) {
  console.log(`\x1b[34m==>\x1b[0m Removing application directory: ${targetDir}...`);
  try {
    fs.rmSync(targetDir, { recursive: true, force: true });
    console.log('  \x1b[32m-> Application directory removed.\x1b[0m');
  } catch (err) {
    console.warn(`  \x1b[33m[WARN] Could not remove ${targetDir}: ${err.message}\x1b[0m`);
  }
} else {
  console.log(`  \x1b[33m[INFO] Application directory preserved at: ${targetDir}\x1b[0m`);
  console.log('  (To remove entire application directory, run: node scripts/uninstall.mjs --all)');
}

console.log('\n\x1b[32m[SUCCESS] Claude-Agy has been uninstalled successfully!\x1b[0m');
