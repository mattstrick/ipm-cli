#!/usr/bin/env node

import { runVersion, runHelp, runInstall, runRun } from '../lib/commands/index.js';

const args = process.argv.slice(2);
const cmd = args[0];

if (!cmd || cmd === '-h' || cmd === '--help') {
  runHelp();
  process.exit(0);
}

if (cmd === '-v' || cmd === '--version') {
  runVersion();
  process.exit(0);
}

switch (cmd) {
  case 'install':
    runInstall(args.slice(1)).catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
    break;
  case 'run':
    runRun(args.slice(1)).catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
    break;
  default:
    console.error(`ipm: unknown command '${cmd}'`);
    runHelp();
    process.exit(1);
}
