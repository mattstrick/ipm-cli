import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, '../../package.json'), 'utf8')
);

export function runVersion() {
  console.log(pkg.version);
}

export function runHelp() {
  console.log(`
ipm - package manager for JavaScript

Usage: ipm <command> [options]

Commands:
  install           Install dependencies from package.json
  install <pkg>     Add and install a package (e.g. ipm install lodash)
  run <script>      Run a script from package.json
  --version   Print version
  --help      Print this message

Registry:
  Default is the IPM registry (http://localhost:3001/registry).
  To use the npm registry instead: REGISTRY=https://registry.npmjs.org ipm install <pkg>
`);
}

export async function runInstall(args) {
  const cwd = process.cwd();
  const pkgPath = resolve(cwd, 'package.json');
  if (!existsSync(pkgPath)) {
    throw new Error('No package.json found in current directory.');
  }
  const manifest = JSON.parse(readFileSync(pkgPath, 'utf8'));
  manifest.dependencies = manifest.dependencies || {};
  manifest.devDependencies = manifest.devDependencies || {};

  if (args.length > 0) {
    const { addPackages } = await import('../install.js');
    const toAdd = args.map((arg) => {
      const at = arg.indexOf('@');
      if (at <= 0) return { name: arg, version: 'latest' };
      return { name: arg.slice(0, at), version: arg.slice(at + 1) || 'latest' };
    });
    await addPackages(cwd, manifest, toAdd);
    return;
  }

  const deps = { ...manifest.dependencies, ...manifest.devDependencies };
  if (Object.keys(deps).length === 0) {
    console.log('No dependencies to install.');
    return;
  }
  console.log('ipm install: installing dependencies...');
  const { installDependencies } = await import('../install.js');
  await installDependencies(cwd, deps);
  console.log('Done.');
}

export async function runRun(args) {
  const scriptName = args[0];
  if (!scriptName) {
    throw new Error('Usage: ipm run <script>');
  }
  const cwd = process.cwd();
  const pkgPath = resolve(cwd, 'package.json');
  if (!existsSync(pkgPath)) {
    throw new Error('No package.json found in current directory.');
  }
  const manifest = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const scripts = manifest.scripts || {};
  const script = scripts[scriptName];
  if (!script) {
    throw new Error(`Missing script: "${scriptName}". Available: ${Object.keys(scripts).join(', ') || '(none)'}`);
  }
  const { spawn } = await import('child_process');
  const child = spawn(script, {
    shell: true,
    stdio: 'inherit',
    cwd,
  });
  const code = await new Promise((res) => child.on('close', res));
  process.exit(code ?? 1);
}
