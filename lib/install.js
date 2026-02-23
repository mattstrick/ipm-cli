import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { existsSync, createWriteStream } from 'fs';
import { resolve, join } from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { spawn } from 'child_process';

const IPM_DEFAULT_REGISTRY = 'http://localhost:3001/registry';
const NPM_REGISTRY = 'https://registry.npmjs.org';

function getRegistry(override) {
  return override || process.env.REGISTRY || process.env.IPM_REGISTRY || IPM_DEFAULT_REGISTRY;
}

function getLanguageForPackage(manifest, packageName) {
  const ipm = manifest && manifest.ipm;
  if (!ipm) return null;
  if (ipm.languages && typeof ipm.languages[packageName] === 'string') return ipm.languages[packageName].trim();
  if (typeof ipm.language === 'string') return ipm.language.trim();
  return null;
}

function registryUrl(registry, name, language) {
  let url = registry + '/' + encodeURIComponent(name);
  if (language) url += '?language=' + encodeURIComponent(language);
  return url;
}

export async function addPackages(cwd, manifest, toAdd) {
  const registry = getRegistry();
  const added = {};
  for (const item of toAdd) {
    const name = item.name;
    const version = item.version || 'latest';
    const lang = getLanguageForPackage(manifest, name);
    const meta = await fetch(registryUrl(registry, name, lang)).then((r) => r.json());
    const dt = meta['dist-tags'];
    const distTag = dt && dt.latest;
    const ver = (version === 'latest' || !version) ? distTag : version.replace(/^[\^~]/, '');
    const pack = meta.versions && meta.versions[ver];
    const tarball = pack && pack.dist && pack.dist.tarball;
    if (!tarball) throw new Error('Could not resolve ' + name + '@' + version);
    const saveVer = (version === 'latest' || !version) ? ('^' + ver) : version;
    manifest.dependencies[name] = saveVer;
    added[name] = saveVer;
  }
  await writeFile(resolve(cwd, 'package.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log('ipm install: installing...');
  await installDependencies(cwd, added, { registry });
  console.log('Done.');
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('GET ' + url + ' failed: ' + res.status);
  return res.json();
}

async function downloadTarball(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Download failed: ' + res.status + ' ' + url);
  const out = createWriteStream(destPath);
  await pipeline(Readable.fromWeb(res.body), out);
}

function extractTarball(tarballPath, destDir) {
  return new Promise((resolve, reject) => {
    const tar = spawn('tar', ['-xzf', tarballPath, '-C', destDir, '--strip-components=1'], { stdio: 'inherit' });
    tar.on('close', (code) => (code === 0 ? resolve() : reject(new Error('tar exited ' + String(code)))));
    tar.on('error', reject);
  });
}

export async function installDependencies(cwd, deps, options) {
  const registry = getRegistry(options && options.registry);
  let manifest = options && options.manifest;
  if (!manifest) {
    try {
      const pkgPath = resolve(cwd, 'package.json');
      if (existsSync(pkgPath)) {
        const raw = await readFile(pkgPath, 'utf8');
        manifest = JSON.parse(raw);
      }
    } catch (_) {}
  }
  const nodeModules = resolve(cwd, 'node_modules');
  if (!existsSync(nodeModules)) await mkdir(nodeModules, { recursive: true });
  for (const [name, version] of Object.entries(deps)) {
    const targetDir = join(nodeModules, name);
    if (existsSync(targetDir)) continue;
    const lang = manifest ? getLanguageForPackage(manifest, name) : null;
    const metaUrl = registryUrl(registry, name, lang);
    const meta = await fetchJSON(metaUrl);
    const dt = meta['dist-tags'];
    const distTag = dt && dt.latest;
    const ver = (version || '').replace(/^[\^~]/, '') || distTag;
    const pack = meta.versions && meta.versions[ver];
    const tarball = pack && pack.dist && pack.dist.tarball;
    if (!tarball) {
      console.warn('ipm: could not resolve ' + name + '@' + version + ', skipping');
      continue;
    }
    const tmpFile = join(nodeModules, '.' + name + '.tgz');
    await downloadTarball(tarball, tmpFile);
    await mkdir(targetDir, { recursive: true });
    await extractTarball(tmpFile, targetDir);
    await unlink(tmpFile);
  }
}
