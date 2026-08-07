#!/usr/bin/env node
// Cross-platform check helper for password-protected stacks.
//   node interop-lock.js encrypt <password>            -> prints the lock payload as JSON
//   node interop-lock.js decrypt <password> <payload>  -> prints the decrypted items as JSON
// Paired with scripts/tests/InteropLock.swift so both implementations must agree.
const { lockItems, unlockItems } = require('../src/stack-lock');

const FIXTURE = [
  { id: '00000000-0000-0000-0000-000000000001', kind: 'url', path: 'https://example.com/one', name: 'One' },
  { id: '00000000-0000-0000-0000-000000000002', kind: 'url', path: 'https://example.com/two', name: 'Two' },
];

const [mode, password, payload] = process.argv.slice(2);
if (!mode || !password) {
  console.error('usage: interop-lock.js encrypt|decrypt <password> [payload]');
  process.exit(2);
}

try {
  if (mode === 'encrypt') {
    console.log(JSON.stringify(lockItems(FIXTURE, password)));
  } else if (mode === 'decrypt') {
    const items = unlockItems(JSON.parse(payload), password);
    // Compare on the fields both platforms share (ids are regenerated)
    const simple = items.map((i) => ({ kind: i.kind, name: i.name, path: i.path }));
    console.log(JSON.stringify(simple));
  } else {
    console.error('unknown mode', mode);
    process.exit(2);
  }
} catch (e) {
  console.error('error:', e.message);
  process.exit(1);
}
