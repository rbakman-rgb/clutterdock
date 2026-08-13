const assert = require('assert');
const { extractProtocolUrls, isSafeAddUrl, parseAction } = require('../src/url-scheme');

assert.deepStrictEqual(
  extractProtocolUrls(['ClutterDock.exe', '--foo', 'clutterdock://open?folder=Work']),
  ['clutterdock://open?folder=Work'],
  'extracts clutterdock:// from argv'
);
assert.deepStrictEqual(
  extractProtocolUrls(['slavedock://open', 'https://example.com']),
  [],
  'ignores slavedock:// and https'
);

assert.strictEqual(parseAction('clutterdock://open').kind, 'open');
assert.strictEqual(parseAction('clutterdock://open?folder=Work').folder, 'Work');
assert.strictEqual(parseAction('clutterdock://settings').kind, 'settings');
assert.strictEqual(parseAction('clutterdock://workspace?name=All').workspace, 'All');
assert.strictEqual(parseAction('clutterdock://unknown').kind, 'ignore');
assert.strictEqual(parseAction('slavedock://open').kind, 'ignore');

const addHttps = parseAction('clutterdock://add?url=https://example.com');
assert.strictEqual(addHttps.kind, 'add');
assert.strictEqual(addHttps.url, 'https://example.com');

const addEvil = parseAction('clutterdock://add?url=ms-msdt:/id%20x');
assert.strictEqual(addEvil.kind, 'add');
assert.strictEqual(addEvil.url, null, 'unsafe add?url= dropped');
assert.strictEqual(addEvil.rejectedUrl, true);

const addPath = parseAction('clutterdock://add?path=C:%5CApps%5CFoo.exe');
assert.ok(addPath.path && addPath.path.includes('Foo.exe'), 'path query survives');

assert.ok(isSafeAddUrl('https://x.test'));
assert.ok(isSafeAddUrl('mailto:a@b.com'));
assert.ok(!isSafeAddUrl('file:///C:/x.exe'));
assert.ok(!isSafeAddUrl('ms-msdt:/id x'));

console.log('url-scheme tests passed');
