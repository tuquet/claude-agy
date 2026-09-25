#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

let localScript = null;
try {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const candidate = path.join(__dirname, 'scripts', 'setup.mjs');
  if (fs.existsSync(candidate)) {
    localScript = candidate;
  }
} catch {}

if (localScript) {
  await import(localScript);
} else {
  const url = 'https://raw.githubusercontent.com/tuquet/claude-agy/main/scripts/setup.mjs';
  let resp;
  try {
    resp = await fetch(url);
  } catch (err) {
    if (err.cause?.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || err.message?.includes('certificate')) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      resp = await fetch(url);
    } else {
      throw err;
    }
  }
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
  const code = await resp.text();
  const tmpFile = path.join(os.tmpdir(), `claude-agy-setup-${Date.now()}.mjs`);
  fs.writeFileSync(tmpFile, code, 'utf-8');
  try {
    await import(tmpFile);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}
