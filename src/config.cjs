const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_KEYS = Object.freeze({
  toggle: 'num0',
  share: 'num1',
  next: 'num2',
  more: 'num3',
  volumeDown: 'num4',
  playPause: 'num5',
  volumeUp: 'num6',
  opacityDown: 'num7',
  previous: 'num8',
  opacityUp: 'num9',
  interact: 'numdec',
  like: 'numadd',
  unlike: 'numsub',
  comment: 'numdiv',
  save: 'nummult'
});

const DEFAULT_CONFIG = Object.freeze({
  opacity: 0.88,
  volume: 0.5,
  bounds: null,
  keys: DEFAULT_KEYS,
  gameWindowTitle: 'War Thunder'
});

function validBounds(value) {
  return value && typeof value === 'object' &&
    ['x', 'y', 'width', 'height'].every(key => Number.isInteger(value[key])) &&
    value.width >= 300 && value.height >= 400;
}

function normalizeConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Config must be an object.');
  const opacity = input.opacity ?? DEFAULT_CONFIG.opacity;
  const volume = input.volume ?? DEFAULT_CONFIG.volume;
  if (typeof opacity !== 'number' || opacity < 0.3 || opacity > 1) throw new Error('Opacity must be between 0.3 and 1.');
  if (typeof volume !== 'number' || volume < 0 || volume > 1) throw new Error('Volume must be between 0 and 1.');
  const savedKeys = { ...(input.keys || {}) };
  if (!Object.hasOwn(savedKeys, 'share')) {
    // Migrate the prototype's num1 Like and num3 Comment before adding the action rail.
    if (savedKeys.like === 'num1') delete savedKeys.like;
    if (savedKeys.comment === 'num3') delete savedKeys.comment;
  }
  const keys = { ...DEFAULT_KEYS, ...savedKeys };
  const values = Object.values(keys);
  if (values.some(value => typeof value !== 'string' || !/^[a-zA-Z0-9+_-]{1,64}$/.test(value))) {
    throw new Error('Each shortcut must be an Electron accelerator.');
  }
  if (new Set(values.map(value => value.toLowerCase())).size !== values.length) {
    throw new Error('Shortcuts must be unique.');
  }
  const gameWindowTitle = input.gameWindowTitle ?? DEFAULT_CONFIG.gameWindowTitle;
  if (typeof gameWindowTitle !== 'string' || gameWindowTitle.length > 100) throw new Error('Invalid gameWindowTitle.');
  if (input.bounds != null && !validBounds(input.bounds)) throw new Error('Invalid window bounds.');
  return {
    opacity,
    volume,
    bounds: input.bounds ? { x: input.bounds.x, y: input.bounds.y, width: input.bounds.width, height: input.bounds.height } : null,
    keys,
    gameWindowTitle
  };
}

function configPath(userData) { return path.join(userData, 'config.json'); }

function loadConfig(userData) {
  const file = configPath(userData);
  if (!fs.existsSync(file)) return { config: normalizeConfig({}), error: null };
  try {
    return { config: normalizeConfig(JSON.parse(fs.readFileSync(file, 'utf8'))), error: null };
  } catch (error) {
    return { config: normalizeConfig({}), error: `Could not read config.json: ${error.message}` };
  }
}

function saveConfig(userData, input) {
  const config = normalizeConfig(input);
  fs.mkdirSync(userData, { recursive: true });
  const file = configPath(userData);
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`);
  fs.renameSync(temp, file);
  return config;
}

module.exports = { DEFAULT_KEYS, DEFAULT_CONFIG, normalizeConfig, configPath, loadConfig, saveConfig };
