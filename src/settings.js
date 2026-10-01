const labels = {
  toggle: 'Hide / show', share: 'Send / share', next: 'Next', more: 'More',
  volumeDown: 'Volume down', playPause: 'Play / pause', volumeUp: 'Volume up',
  opacityDown: 'Opacity down', previous: 'Previous', opacityUp: 'Opacity up', interact: 'Unlock / move Reel',
  like: 'Like', unlike: 'Unlike', comment: 'Comment', save: 'Save / unsave'
};
let current;
const $ = id => document.getElementById(id);
function message(text, error = false) { $('message').textContent = text; $('message').className = error ? 'error' : ''; }
function showStatus(data) {
  $('status').textContent = [
    `Mode: ${data.mode}${data.hidden ? ' (hidden)' : ''}`,
    `War Thunder focused: ${data.gameActive ? 'yes' : 'no'}`,
    `Shortcuts unavailable: ${data.hotkeyFailures.length ? data.hotkeyFailures.join(', ') : 'none'}`,
    `Last action: ${data.lastAction}`,
    data.configError ? `Config error: ${data.configError}` : '',
    `Config: ${data.configPath}`
  ].filter(Boolean).join('\n');
}
function render(config, status) {
  current = config;
  $('opacity').value = Math.round(config.opacity * 100);
  $('volume').value = Math.round(config.volume * 100);
  $('title').value = config.gameWindowTitle;
  $('keys').replaceChildren();
  for (const [action, label] of Object.entries(labels)) {
    const row = document.createElement('div'); row.className = 'row';
    const text = document.createElement('label'); text.textContent = label; text.htmlFor = `key-${action}`;
    const input = document.createElement('input'); input.type = 'text'; input.id = `key-${action}`; input.value = config.keys[action]; input.spellcheck = false;
    row.append(text, input); $('keys').append(row);
  }
  updateOutputs(); showStatus(status);
}
function updateOutputs() { $('opacityValue').value = `${$('opacity').value}%`; $('volumeValue').value = `${$('volume').value}%`; }
function collect() {
  const keys = {};
  for (const action of Object.keys(labels)) keys[action] = $(`key-${action}`).value.trim();
  return { ...current, opacity: Number($('opacity').value) / 100, volume: Number($('volume').value) / 100,
    keys, gameWindowTitle: $('title').value.trim() };
}
$('opacity').addEventListener('input', updateOutputs);
$('volume').addEventListener('input', updateOutputs);
$('save').addEventListener('click', async () => {
  try { const result = await window.settings.save(collect()); render(result.config, result.status); message('Settings saved.'); }
  catch (error) { message(error.message, true); }
});
$('reload').addEventListener('click', async () => {
  try { const result = await window.settings.reload(); render(result.config, result.status); message('Config file reloaded.'); }
  catch (error) { message(error.message, true); }
});
$('open').addEventListener('click', () => window.settings.openConfig());
window.settings.onStatus(showStatus);
window.settings.get().then(result => render(result.config, result.status)).catch(error => message(error.message, true));
