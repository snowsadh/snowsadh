import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { formatCount, render } from './render.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const artwork = await Promise.all(['side.svg', 'side-mobile.svg'].map(name => readFile(join(directory, '../assets', name), 'utf8')));
for (const [count, expected] of [[0, '0000'], [9, '0009'], [1234, '1234'], [9999, '9999'],
  [10000, ' 10K'], [999999, '999K'], [1000000, '1.0M'], [9999999, '9.9M'], [Number.MAX_SAFE_INTEGER, '9.0P']]) {
  assert.equal(formatCount(count), expected);
  for (const source of artwork) {
    const result = render(source, count);
    const numbers = [...result.matchAll(/<text x="(?:285|785|1280|1775)" y="410">([^<]*)<\/text>/g)].map(m => m[1]).join('');
    assert.equal(numbers, expected);
    // The embedded PNG, fonts, colours, positions and dimensions must remain byte-for-byte identical.
    const restored = result.replace(/(<text x="(?:285|785|1280|1775)" y="410">)[^<]*(<\/text>)/g, '$1—$2')
      .replaceAll(`Ice keys: ${count} image loads`, 'Ice keys; counter not connected');
    assert.equal(restored, source);
  }
}
for (const invalid of [-1, NaN, Infinity, 1.5, '1234', Number.MAX_SAFE_INTEGER + 1]) {
  assert.throws(() => formatCount(invalid), RangeError);
}
assert.throws(() => render('<svg/>', 1), /four ice-key placeholders/);

const state = await mkdtemp(join(tmpdir(), 'snow-counter-test-'));
const server = createServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
await new Promise(resolve => server.close(resolve));
const origin = `http://127.0.0.1:${port}`;
let child, logs = '';
async function start() {
  child = spawn('npx', ['--yes', 'wrangler@4.151.3', 'dev', '--local', '--ip', '127.0.0.1',
    '--port', String(port), '--persist-to', state], {
    cwd: directory, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  });
  child.stdout.on('data', chunk => { logs += chunk; });
  child.stderr.on('data', chunk => { logs += chunk; });
  for (let i = 0; i < 200; i++) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(logs);
    try {
      if ((await fetch(origin + '/health')).ok) return;
    } catch {}
    await delay(150);
  }
  throw new Error('Local worker did not start: ' + logs);
}
async function stop() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  process.kill(-child.pid, 'SIGTERM');
  await Promise.race([exited, delay(5000)]);
  if (child.exitCode === null && child.signalCode === null) {
    process.kill(-child.pid, 'SIGKILL');
    await exited;
  }
}
const current = async () => (await (await fetch(origin + '/count')).json()).count;
async function image(path, expected) {
  const response = await fetch(origin + path);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^image\/svg\+xml/);
  assert.match(response.headers.get('cache-control'), /no-store/);
  const source = artwork[path.startsWith('/side-mobile.svg') ? 1 : 0];
  assert.equal(await response.text(), render(source, expected));
}
try {
  await start();
  assert.equal(await current(), 0);
  for (const path of ['/side.svg', '/side-mobile.svg', '/count', '/health']) {
    const response = await fetch(origin + path, { method: 'HEAD' });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '');
  }
  await image('/side.svg?preview=1', 0);
  await image('/side-mobile.svg?preview=1', 0);
  assert.equal(await current(), 0);
  assert.equal((await fetch(origin + '/unknown.svg')).status, 404);
  assert.equal((await fetch(origin + '/side.svg?count=1000')).status, 400);
  assert.equal((await fetch(origin + '/side.svg', { method: 'POST' })).status, 405);
  assert.equal(await current(), 0);
  await image('/side.svg', 1);
  await image('/side-mobile.svg', 2);
  await image('/side.svg?preview=1', 2);
  const responses = await Promise.all(Array.from({ length: 20 }, (_, i) => fetch(origin + (i % 2 ? '/side.svg' : '/side-mobile.svg'))));
  const numbers = await Promise.all(responses.map(async response => {
    assert.equal(response.status, 200);
    return Number((await response.text()).match(/Ice keys: (\d+) image loads/)[1]);
  }));
  assert.deepEqual(numbers.sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 3));
  assert.equal(await current(), 22);
  await stop();
  await start();
  assert.equal(await current(), 22, 'Count must survive a worker restart');
  await image('/side.svg', 23);
  console.log('PASS: exact artwork, formatting, routes, read-only previews/HEAD, concurrency and persisted count');
} catch (error) {
  console.error(logs.slice(-6000));
  throw error;
} finally {
  await stop();
  await rm(state, { recursive: true, force: true });
}
