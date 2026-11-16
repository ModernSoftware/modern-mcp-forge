import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The compiler recognizes the literal string "true", not "1".
process.env.XMCP_TELEMETRY_DISABLED = 'true';

function run(directory, command, args) {
  const cwd = fileURLToPath(new URL(directory + '/', import.meta.url));
  console.log(directory, command, ...args);
  if (command === 'npm' && process.platform === 'win32') {
    execFileSync('cmd.exe', ['/d', '/c', 'npm', ...args], {
      cwd,
      stdio: 'inherit'
    });
  } else {
    execFileSync(command, args, { cwd, stdio: 'inherit' });
  }
}

for (const directory of [
  'native',
  'bridges',
  'apps/deploy',
  'apps/fulfillment',
  'apps/warehouse'
]) {
  run(directory, 'npm', ['ci', '--no-audit', '--no-fund']);
}
for (const directory of ['apps/returns', 'apps/policy']) {
  run(directory, 'uv', ['sync', '--locked', '--python', '3.12']);
}
run('apps/deploy', 'npm', ['run', 'build']);
