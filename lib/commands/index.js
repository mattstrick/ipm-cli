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
  install     Install dependencies from package.json
  run <script>  Run a script from package.json
  --version   Print version
  --help      Print this message
`);
}

export async function runInstall(_args) {
  const cwd = process.cwd();
  const pkgPath = resolve(cwd, 'package.json');
  if (!existsSync(pkgPath)) {
    throw new Error('No package.json found in current directory.');
  }
  const manifest = JSON.parse(readFileSync(pkgPath, 'utf8'));
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
