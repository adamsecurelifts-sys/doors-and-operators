const { spawn } = require('node:child_process');
const port = process.env.PORT || '3000';
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', port], { stdio: 'inherit', env: process.env });
child.on('exit', code => process.exit(code ?? 1));
