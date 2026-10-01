const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_KEYS, normalizeConfig } = require('../src/config.cjs');

test('migrates prototype shortcuts to the complete action rail', () => {
  const config = normalizeConfig({ keys: { like: 'num1', comment: 'num3' } });
  assert.deepEqual(config.keys, DEFAULT_KEYS);
});

test('rejects a shortcut that collides with another action', () => {
  assert.throws(() => normalizeConfig({ keys: { like: 'num2' } }), /Shortcuts must be unique/);
});

test('keeps independently configured actions', () => {
  const config = normalizeConfig({ keys: { like: 'Control+Alt+L' }, opacity: 0.65, volume: 0 });
  assert.equal(config.keys.like, 'Control+Alt+L');
  assert.equal(config.opacity, 0.65);
  assert.equal(config.volume, 0);
});
