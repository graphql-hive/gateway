// tsx package-binary.ts [platform] [arch]

import { execSync } from 'node:child_process';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import { inject } from 'postject';

const platform = (process.argv[2] || os.platform()).toLowerCase();
const arch = (process.argv[3] || os.arch()).toLowerCase();

const isDarwin = platform.includes('darwin') || platform.includes('macos');
const isWindows = platform.includes('win32');
const isLinux = platform.includes('linux');
if (!isDarwin && !isWindows && !isLinux) {
  throw new Error(`Unsupported platform ${platform}`);
}

const dest = 'hive-gateway' + (isWindows ? '.exe' : '');

/**
 * Finds the path to signtool.exe on Windows by searching:
 * 1. PATH (via `where signtool`)
 * 2. Common Windows Kits locations (sorted by newest version first)
 * Returns null if signtool cannot be found.
 */
function findSigntool(): string | null {
  // Try signtool from PATH first
  try {
    execSync('signtool /?', { stdio: 'pipe' });
    return 'signtool';
  } catch {
    // Not in PATH, continue searching
  }

  // Search common Windows Kits installation directories
  const programFilesX86 =
    process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
  const winKitsDir = `${programFilesX86}\\Windows Kits\\10\\bin`;

  try {
    const versions = fsSync
      .readdirSync(winKitsDir)
      .filter(v => /^\d+\.\d+\.\d+\.\d+$/.test(v))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true })); // newest first
    for (const version of versions) {
      const signtoolPath = `${winKitsDir}\\${version}\\x64\\signtool.exe`;
      if (fsSync.existsSync(signtoolPath)) {
        return signtoolPath;
      }
    }
  } catch {
    // Cannot read directory
  }

  return null;
}

console.log(
  `Packaging binary with Node SEA for ${platform}-${arch} to ${dest}`,
);

console.log('Generating blob');
console.log(
  execSync(`node --experimental-sea-config sea-config.json`).toString('utf-8'),
);

console.log(`Using node from ${process.execPath}`);
await fs.copyFile(process.execPath, dest);

if (isDarwin) {
  console.log('Removing the signature w/ codesign');
  execSync(`codesign --remove-signature ${dest}`);
} else if (isWindows) {
  const signtool = findSigntool();
  if (signtool) {
    try {
      console.log(`Removing the signature w/ signtool (${signtool})`);
      execSync(`"${signtool}" remove /s ${dest}`);
    } catch (e) {
      console.warn('Removing signature failed w/ signtool', e);
    }
  } else {
    console.warn('signtool not found, skipping signature removal');
  }
}

console.log('Injecting blob');
const seaPrepBlob = await fs.readFile('sea-prep.blob');
await inject(dest, 'NODE_SEA_BLOB', seaPrepBlob, {
  sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  machoSegmentName: 'NODE_SEA',
});

if (isDarwin) {
  console.log('Signing binary w/ codesign');
  execSync(`codesign --sign - ${dest}`);
} else if (isWindows) {
  const signtool = findSigntool();
  if (signtool) {
    try {
      console.log(`Signing binary w/ signtool (${signtool})`);
      execSync(`"${signtool}" sign /fd SHA256 ${dest}`);
    } catch (e) {
      console.warn('Signing failed w/ signtool', e);
    }
  } else {
    console.warn('signtool not found, skipping binary signing');
  }
}

if (isDarwin || isLinux) {
  console.log('Setting exec permissions');
  execSync(`chmod +x ${dest}`);
}

console.log(`Saved binary to ${dest}`);
