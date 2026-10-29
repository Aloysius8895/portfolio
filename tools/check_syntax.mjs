import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
async function check(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const name = `${path}/${entry.name}`;
    if (entry.isDirectory()) await check(name);
    else if (/\.(?:js|mjs)$/.test(name)) { const result = spawnSync(process.execPath, ['--check', name], { stdio: 'inherit' }); if (result.status !== 0) process.exit(1); }
  }
}
for (const directory of ['admin', 'api', 'lib', 'template3/hero/src']) await check(directory);
for (const path of ['admin-server.mjs', 'template3/hero/hero.js', 'template3/hero/config.js']) {
  const result = spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' }); if (result.status !== 0) process.exit(1);
}
console.log('Application syntax checks passed.');
