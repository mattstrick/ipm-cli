import { mkdir, unlink } from 'fs/promises';
import { existsSync, createWriteStream } from 'fs';
import { resolve, join } from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { spawn } from 'child_process';

const DEFAULT_REGISTRY = 'https://registry.npmjs.org';

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return res.json();
}

async function downloadTarball(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${url}`);
  const out = createWriteStream(destPath);
  await pipeline(Readable.fromWeb(res.body), out);
}

function extractTarball(tarballPath, destDir) {
  return new Promise((resolve, reject) => {
    const tar = spawn('tar', ['-xzf', tarballPath, '-C', destDir, '--strip-components=1'], {
      stdio: 'inherit',
    });
    tar.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`tar exited ${code}`)));
    tar.on('error', reject);
  });
}

export async function installDependencies(cwd, deps, options = {}) {
  const registry = options.registry || process.env.IPM_REGISTRY || DEFAULT_REGISTRY;
  const nodeModules = resolve(cwd, 'node_modules');
  if (!existsSync(nodeModules)) {
    await mkdir(nodeModules, { recursive: true });
  }

  for (const [name, version] of Object.entries(deps)) {
    const targetDir = join(nodeModules, name);
    if (existsSync(targetDir)) continue;

    const metaUrl = `${registry}/${encodeURIComponent(name)}`;
    const meta = await fetchJSON(metaUrl);
    const distTag = meta['dist-tags']?.latest;
    const ver = (version || '').replace(/^[\^~]/, '') || distTag;
    const pack = meta.versions?.[ver];
    const tarball = pack?.dist?.tarball;
    if (!tarball) {
      console.warn(`ipm: could not resolve ${name}@${version}, skipping`);
      continue;
    }

    const tmpFile = join(nodeModules, `.${name}.tgz`);
    await downloadTarball(tarball, tmpFile);
    await mkdir(targetDir, { recursive: true });
    await extractTarball(tmpFile, targetDir);
    await unlink(tmpFile);
  }
}
