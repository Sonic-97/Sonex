const { existsSync, readFileSync } = require('fs');
const { join } = require('path');

const { platform, arch } = process;
let nativeBinding = null;
let localFileExisted = false;
let loadError = null;

function isMusl() {
  if (!process.report || typeof process.report.getReport !== 'function') {
    try {
      const lddPath = require('child_process')
        .execSync('which ldd 2>/dev/null || true')
        .toString()
        .trim();
      if (lddPath) {
        const lddOutput = require('child_process')
          .execSync(`ldd --version 2>&1 || true`)
          .toString();
        return lddOutput.includes('musl');
      }
    } catch {
      return false;
    }
  } else {
    const report = process.report.getReport();
    if (report && typeof report === 'object' && report.sharedObjects) {
      return Object.keys(report.sharedObjects).some(k => k.includes('libc.musl'));
    }
  }
  return false;
}

let platformSuffix;
switch (platform) {
  case 'win32':
    platformSuffix = `win32-${arch}-msvc`;
    break;
  case 'darwin':
    platformSuffix = `darwin-${arch}`;
    break;
  case 'linux':
    platformSuffix = isMusl() ? `linux-${arch}-musl` : `linux-${arch}-gnu`;
    break;
  default:
    platformSuffix = `${platform}-${arch}`;
    break;
}

const localFile = join(__dirname, `sonex-core.${platformSuffix}.node`);
if (existsSync(localFile)) {
  localFileExisted = true;
  try {
    nativeBinding = require(localFile);
  } catch (e) {
    loadError = e;
  }
}

if (!nativeBinding) {
  try {
    nativeBinding = require(`@sonex/core-${platformSuffix}`);
  } catch (e) {
    loadError = e;
  }
}

if (!nativeBinding) {
  throw new Error(
    `Failed to load native binding for ${platformSuffix}. ` +
    (loadError ? loadError.message : ''),
  );
}

module.exports = nativeBinding;
