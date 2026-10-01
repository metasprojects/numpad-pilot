const { app, BrowserWindow, WebContentsView, globalShortcut, ipcMain, Menu, nativeImage, Notification, screen, shell, Tray } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { configPath, loadConfig, normalizeConfig, saveConfig } = require('./config.cjs');
const { foregroundInfo, setForegroundWindow } = require('./foreground.cjs');
const { invoke, isInstagram } = require('./instagram-adapter.cjs');

app.enableSandbox();
if (process.platform !== 'win32') app.whenReady().then(() => { console.error('Windows only.'); app.quit(); });
if (!app.requestSingleInstanceLock()) app.quit();

const smoke = process.argv.includes('--smoke');
const instagramCheck = process.argv.includes('--instagram-check');
const integrationCheck = process.argv.includes('--integration-check');
const actionCheck = process.argv.includes('--action-check');
let overlay, reelView, settingsWindow, tray, config, configError = null;
let quitting = false, mode = 'play', hidden = false, resumeAfterHide = false, resumeAfterComment = false;
let lastGameHwnd = null, gameActive = false, hotkeySignature = '', hotkeyFailures = [], lastAction = 'Ready';
let saveBoundsTimer, refreshTimer;
let reelRect = null, cropTimer = null, playBounds = null, changingLayout = false;
const userData = () => app.getPath('userData');
const configFile = () => configPath(userData());

function status() {
  return { mode, hidden, gameActive, hotkeyFailures, lastAction, configError, configPath: configFile(), instagramUrl: reelView?.webContents.getURL() || '' };
}
function notifyStatus(message, warn = false) {
  lastAction = message;
  settingsWindow?.webContents.send('status', status());
  if (warn && Notification.isSupported()) new Notification({ title: 'Reel Overlay', body: message }).show();
  tray?.setToolTip(`Reel Overlay — ${message}`);
  updateTray();
}
function defaultBounds() {
  const area = screen.getPrimaryDisplay().workArea;
  const width = Math.min(360, Math.max(280, Math.round(area.width * 0.18)));
  const height = Math.min(620, area.height - 32);
  return { x: area.x + area.width - width - 24, y: area.y + 16, width, height };
}
function safeBounds(saved) {
  const area = screen.getPrimaryDisplay().workArea;
  if (!saved) return defaultBounds();
  const width = Math.min(saved.width, area.width), height = Math.min(saved.height, area.height);
  return { x: Math.min(Math.max(saved.x, area.x), area.x + area.width - width), y: Math.min(Math.max(saved.y, area.y), area.y + area.height - height), width, height };
}
function persistConfig() {
  try { config = saveConfig(userData(), config); configError = null; }
  catch (error) { configError = error.message; notifyStatus(`Settings could not be saved: ${error.message}`, true); }
}
function saveCurrentBounds() {
  if (!overlay || overlay.isDestroyed() || smoke || mode !== 'play' || changingLayout) return;
  config.bounds = overlay.getBounds(); persistConfig();
}
function layoutCrop() {
  if (!overlay || !reelView || !reelRect || mode !== 'play') return;
  const width = overlay.getContentBounds().width;
  const scale = width / reelRect.width;
  const height = Math.round(reelRect.height * scale);
  changingLayout = true;
  reelView.webContents.setZoomFactor(scale);
  reelView.setBounds({ x: -Math.round(reelRect.x * scale), y: -Math.round(reelRect.y * scale),
    width: Math.ceil(reelRect.viewportWidth * scale), height: Math.ceil(reelRect.viewportHeight * scale) });
  if (Math.abs(overlay.getContentBounds().height - height) > 1) overlay.setContentSize(width, height);
  setTimeout(() => { changingLayout = false; }, 100);
}
async function refreshCrop() {
  if (mode !== 'play' || hidden || !isInstagram(reelView.webContents)) return;
  const result = await pageAction('status');
  if (!result.ok || !result.rect || result.rect.width < 150 || result.rect.height < 200) return;
  const next = result.rect;
  if (!reelRect || Object.keys(next).some(key => Math.abs(next[key] - reelRect[key]) > 2)) {
    reelRect = next;
    layoutCrop();
  }
}
function isGameForeground(info) {
  if (!info) return false;
  return !!config.gameWindowTitle && info.title.toLowerCase().includes(config.gameWindowTitle.toLowerCase());
}
function desiredActions() {
  if (settingsWindow?.isFocused()) return [];
  if (!(gameActive || overlay?.isFocused())) return [];
  if (hidden || mode === 'commenting') return ['toggle'];
  if (mode === 'interactive') return ['toggle', 'interact'];
  return Object.keys(config.keys);
}
function refreshHotkeys(force = false) {
  if (!config || smoke || instagramCheck || integrationCheck || actionCheck) return;
  const actions = desiredActions();
  const signature = JSON.stringify(actions.map(action => [action, config.keys[action]]));
  if (!force && signature === hotkeySignature) return;
  globalShortcut.unregisterAll(); hotkeySignature = signature; hotkeyFailures = [];
  for (const action of actions) {
    const accelerator = config.keys[action];
    let registered = false;
    try { registered = globalShortcut.register(accelerator, () => perform(action)); } catch { /* Unsupported accelerator. */ }
    if (!registered) hotkeyFailures.push(`${action}: ${accelerator}`);
  }
  if (hotkeyFailures.length) notifyStatus(`Shortcut unavailable: ${hotkeyFailures.join(', ')}`, true);
  else settingsWindow?.webContents.send('status', status());
}
function pollForeground() {
  if (!overlay || overlay.isDestroyed()) return;
  const info = foregroundInfo();
  const next = isGameForeground(info);
  if (next) lastGameHwnd = info.hwnd;
  if (next !== gameActive) { gameActive = next; refreshHotkeys(true); settingsWindow?.webContents.send('status', status()); }
  else refreshHotkeys();
}
async function pageAction(name, value = null) {
  if (!overlay || overlay.isDestroyed()) return { ok: false, error: 'Overlay is closed.' };
  const result = await invoke(reelView.webContents, name, value);
  if (!result.ok && result.error) notifyStatus(result.error);
  return result;
}
async function hideOverlay() {
  if (hidden) return;
  if (mode !== 'play') await leaveInteraction();
  const result = await pageAction('hide');
  resumeAfterHide = !!result.wasPlaying;
  reelView.webContents.setAudioMuted(true);
  overlay.setIgnoreMouseEvents(true, { forward: true }); overlay.hide();
  hidden = true; mode = 'play'; notifyStatus('Hidden and paused'); refreshHotkeys(true);
}
async function showOverlay() {
  if (!hidden) return;
  hidden = false; overlay.showInactive(); overlay.moveTop();
  overlay.setIgnoreMouseEvents(true, { forward: true });
  reelView.webContents.setAudioMuted(false);
  await pageAction('show', { volume: config.volume, resume: resumeAfterHide });
  refreshCrop();
  notifyStatus('Reel visible'); refreshHotkeys(true);
}
async function enterInteraction(comment = false) {
  if (hidden) await showOverlay();
  const info = foregroundInfo();
  if (isGameForeground(info)) lastGameHwnd = info.hwnd;
  playBounds = overlay.getBounds();
  mode = comment ? 'commenting' : 'interactive';
  overlay.setAspectRatio(0);
  reelView.webContents.setZoomFactor(1);
  const viewport = reelRect || { viewportWidth: 480, viewportHeight: 640 };
  const area = screen.getPrimaryDisplay().workArea;
  const width = Math.round(viewport.viewportWidth);
  const height = Math.min(area.height - 32, Math.max(800, Math.round(viewport.viewportHeight)));
  const bounds = overlay.getBounds();
  changingLayout = true;
  overlay.setBounds({ x: Math.min(bounds.x, area.x + area.width - width), y: Math.min(bounds.y, area.y + area.height - height), width, height });
  reelView.setBounds({ x: 0, y: 0, width, height });
  setTimeout(() => { changingLayout = false; }, 100);
  overlay.setIgnoreMouseEvents(false); overlay.show(); overlay.focus();
  await pageAction('interact', true);
  let result = { ok: true };
  if (comment) {
    result = await pageAction('comment');
    resumeAfterComment = !!result.wasPlaying;
    if (!result.ok) mode = 'interactive';
  }
  notifyStatus(comment ? result.fieldReady ? 'Type and submit your comment; Escape returns to the game' :
    'Comment field not found; use the clickable Instagram view' : 'Interaction mode; Escape returns to the game');
  refreshHotkeys(true);
  return result;
}
async function leaveInteraction() {
  if (mode === 'play') return;
  const wasCommenting = mode === 'commenting'; mode = 'play';
  await pageAction('interact', false);
  if (playBounds) { changingLayout = true; overlay.setBounds(playBounds); playBounds = null; }
  layoutCrop();
  overlay.setIgnoreMouseEvents(true, { forward: true });
  if (wasCommenting && resumeAfterComment && (await pageAction('status')).paused) await pageAction('playPause');
  resumeAfterComment = false;
  if (lastGameHwnd) setForegroundWindow(lastGameHwnd);
  notifyStatus('Playing mode'); refreshHotkeys(true);
}
async function perform(action) {
  if (!overlay || overlay.isDestroyed()) return;
  if (action === 'toggle') return hidden ? showOverlay() : hideOverlay();
  if (hidden) return;
  if (action === 'interact') return mode === 'play' ? enterInteraction() : leaveInteraction();
  if (action === 'comment') return enterInteraction(true);
  if (action === 'next' || action === 'previous') {
    const keyCode = action === 'next' ? 'Down' : 'Up';
    reelView.webContents.sendInputEvent({ type: 'keyDown', keyCode });
    reelView.webContents.sendInputEvent({ type: 'keyUp', keyCode });
    setTimeout(() => pageAction('volume', config.volume), 500);
    notifyStatus(action === 'next' ? 'Next Reel' : 'Previous Reel'); return;
  }
  if (action === 'opacityDown' || action === 'opacityUp') {
    config.opacity = Math.min(1, Math.max(0.3, Math.round((config.opacity + (action === 'opacityUp' ? 0.05 : -0.05)) * 100) / 100));
    overlay.setOpacity(config.opacity); persistConfig(); notifyStatus(`Opacity ${Math.round(config.opacity * 100)}%`); return;
  }
  if (action === 'volumeDown' || action === 'volumeUp') {
    config.volume = Math.min(1, Math.max(0, Math.round((config.volume + (action === 'volumeUp' ? 0.1 : -0.1)) * 100) / 100));
    reelView.webContents.setAudioMuted(false); await pageAction('volume', config.volume);
    persistConfig(); notifyStatus(`Reel volume ${Math.round(config.volume * 100)}%`); return;
  }
  if (['playPause', 'like', 'unlike', 'save', 'share', 'more'].includes(action)) {
    const result = await pageAction(action);
    if (result.ok) {
      if (action === 'share' || action === 'more') await enterInteraction();
      notifyStatus(action === 'playPause' ? result.paused ? 'Paused' : 'Playing' :
        action === 'like' || action === 'unlike' ? `${action === 'like' ? 'Liked' : 'Unliked'}${result.changed ? '' : ' already'}` :
        action === 'save' ? 'Save toggled' : `${action === 'share' ? 'Share' : 'More'} opened`);
    }
  }
}
function showSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) { settingsWindow.show(); settingsWindow.focus(); return; }
  settingsWindow = new BrowserWindow({ width: 520, height: 700, minWidth: 440, minHeight: 580, title: 'Reel Overlay Settings', backgroundColor: '#101218',
    webPreferences: { preload: path.join(__dirname, 'settings-preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
  settingsWindow.setMenu(null); settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
  settingsWindow.on('focus', () => refreshHotkeys(true));
  settingsWindow.on('closed', () => { settingsWindow = null; refreshHotkeys(true); });
}
function updateTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: hidden ? 'Show Reel' : 'Hide Reel', click: () => perform('toggle') },
    { label: mode === 'play' ? 'Interaction mode' : 'Return to game', click: () => perform('interact') },
    { label: 'Settings', click: showSettings }, { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } }
  ]));
}
async function createTray() {
  let icon;
  try { icon = await app.getFileIcon(process.execPath, { size: 'small' }); }
  catch { icon = nativeImage.createEmpty(); }
  tray = new Tray(icon); tray.setToolTip('Reel Overlay');
  tray.on('double-click', () => hidden ? showOverlay() : showSettings()); updateTray();
}
function createOverlay() {
  const saved = safeBounds(config.bounds);
  const width = Math.min(saved.width, 340);
  overlay = new BrowserWindow({ ...saved, x: saved.x + saved.width - width, width, height: Math.min(saved.height, 600),
    minWidth: 200, minHeight: 280, frame: false, resizable: true,
    alwaysOnTop: true, show: false, backgroundColor: '#0b0d12',
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
  reelView = new WebContentsView({ webPreferences: { partition: smoke ? 'smoke' : 'persist:instagram',
    nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false } });
  overlay.contentView.addChildView(reelView);
  reelView.setBounds({ x: 0, y: 0, width: 480, height: 640 });
  reelView.webContents.setZoomFactor(1);
  overlay.setOpacity(config.opacity); overlay.setIgnoreMouseEvents(true, { forward: true });
  overlay.on('focus', () => refreshHotkeys(true)); overlay.on('blur', () => refreshHotkeys(true));
  overlay.on('move', () => { clearTimeout(saveBoundsTimer); saveBoundsTimer = setTimeout(saveCurrentBounds, 600); });
  overlay.on('resize', () => { if (mode === 'play' && !changingLayout) layoutCrop(); clearTimeout(saveBoundsTimer); saveBoundsTimer = setTimeout(saveCurrentBounds, 600); });
  overlay.on('closed', () => { reelView?.webContents.close(); reelView = null; overlay = null; if (!quitting) app.quit(); });
  reelView.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape' && mode !== 'play') { event.preventDefault(); leaveInteraction(); }
  });
  reelView.webContents.on('did-finish-load', () => { if (isInstagram(reelView.webContents)) {
    if (!reelRect) reelView.webContents.setZoomFactor(1);
    pageAction('volumePreset', config.volume);
    setTimeout(async () => { await refreshCrop(); if (!hidden && !overlay.isVisible()) overlay.showInactive(); }, 700);
  } });
  reelView.webContents.on('did-navigate-in-page', () => { if (isInstagram(reelView.webContents)) setTimeout(refreshCrop, 500); });
  reelView.webContents.on('will-navigate', (event, url) => {
    try {
      const target = new URL(url);
      if (target.protocol === 'https:' && (target.hostname === 'www.instagram.com' || target.hostname === 'www.facebook.com')) return;
      event.preventDefault(); if (target.protocol === 'https:') shell.openExternal(url);
    } catch { event.preventDefault(); }
  });
  reelView.webContents.setWindowOpenHandler(({ url }) => {
    try { if (new URL(url).protocol === 'https:') shell.openExternal(url); } catch { /* Reject unsafe popup. */ }
    return { action: 'deny' };
  });
  if (smoke) reelView.webContents.loadFile(path.join(__dirname, 'smoke.html'));
  else reelView.webContents.loadURL('https://www.instagram.com/reels/');
  cropTimer = setInterval(refreshCrop, 1200);
}
function registerSettingsIpc() {
  const fromSettings = event => settingsWindow && event.sender === settingsWindow.webContents;
  ipcMain.handle('settings:get', event => { if (!fromSettings(event)) throw new Error('Not allowed.'); return { config, status: status() }; });
  ipcMain.handle('settings:save', async (event, input) => {
    if (!fromSettings(event)) throw new Error('Not allowed.');
    config = normalizeConfig(input); persistConfig(); overlay.setOpacity(config.opacity);
    await pageAction('volume', config.volume); refreshHotkeys(true); notifyStatus('Settings saved');
    return { config, status: status() };
  });
  ipcMain.handle('settings:open-config', event => { if (!fromSettings(event)) throw new Error('Not allowed.'); shell.showItemInFolder(configFile()); });
  ipcMain.handle('settings:reload', event => {
    if (!fromSettings(event)) throw new Error('Not allowed.');
    const loaded = loadConfig(userData()); config = loaded.config; configError = loaded.error;
    overlay.setOpacity(config.opacity); refreshHotkeys(true); return { config, status: status() };
  });
}
async function runSmoke() {
  const shortcuts = {};
  for (const [action, key] of Object.entries(config.keys)) shortcuts[action] = globalShortcut.register(key, () => {});
  overlay.showInactive(); await new Promise(resolve => setTimeout(resolve, 350));
  console.log(JSON.stringify({ electron: process.versions.electron, shortcuts, opacity: overlay.getOpacity(), visible: overlay.isVisible(), bounds: overlay.getBounds() }));
  app.quit();
}
async function runInstagramCheck() {
  overlay.showInactive(); await new Promise(resolve => setTimeout(resolve, 3500));
  const initial = await pageAction('status');
  const play = initial.paused ? await pageAction('playPause') : null;
  await new Promise(resolve => setTimeout(resolve, 1200));
  const later = await pageAction('status');
  console.log(JSON.stringify({ initial, play, later })); app.quit();
}
async function runIntegrationCheck() {
  overlay.showInactive();
  await new Promise(resolve => setTimeout(resolve, 3000));
  await refreshCrop();
  await new Promise(resolve => setTimeout(resolve, 400));
  const crop = { rect: reelRect, bounds: overlay.getBounds(), view: reelView.getBounds(), zoom: reelView.webContents.getZoomFactor() };
  const initial = await pageAction('status');
  const controls = await pageAction('controls');
  const beforeUrl = reelView.webContents.getURL();
  reelView.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Down' });
  reelView.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Down' });
  await new Promise(resolve => setTimeout(resolve, 1500));
  const afterUrl = reelView.webContents.getURL();
  const comment = await enterInteraction(true);
  const commentView = overlay.getBounds();
  await leaveInteraction();
  const volume = await pageAction('volume', 0.4);
  const hide = await pageAction('hide');
  reelView.webContents.setAudioMuted(true);
  overlay.hide();
  const hiddenState = { visible: overlay.isVisible(), muted: reelView.webContents.isAudioMuted() };
  overlay.showInactive();
  reelView.webContents.setAudioMuted(false);
  const show = await pageAction('show', { volume: 0.4, resume: hide.wasPlaying });
  overlay.setOpacity(0.65);
  const opacity = overlay.getOpacity();
  overlay.setOpacity(config.opacity);
  const passed = !!(crop.rect && initial.ok && controls.ok &&
    ['Like', 'Comment', 'Share', 'Save', 'More'].every(name => controls.controls[name]) &&
    comment.ok && comment.fieldReady && volume.ok && !hiddenState.visible && hiddenState.muted && show.ok && opacity === 0.65);
  console.log(JSON.stringify({ passed, crop, initial, controls, comment, commentView, volume, hiddenState, show, opacity, navigationChanged: beforeUrl !== afterUrl }));
  if (passed) app.quit(); else app.exit(1);
}
async function runActionCheck() {
  overlay.showInactive();
  await new Promise(resolve => setTimeout(resolve, 3000));
  await perform('share');
  await new Promise(resolve => setTimeout(resolve, 500));
  const share = { mode, bounds: overlay.getBounds() };
  const shareOpen = await reelView.webContents.executeJavaScript('document.querySelectorAll("[role=dialog]").length > 0', true);
  reelView.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  reelView.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await new Promise(resolve => setTimeout(resolve, 400));
  await perform('more');
  await new Promise(resolve => setTimeout(resolve, 500));
  const more = { mode, bounds: overlay.getBounds() };
  const moreOpen = await reelView.webContents.executeJavaScript('document.querySelectorAll("[role=dialog],[role=menu]").length > 0', true);
  console.log(JSON.stringify({ share, shareOpen, more, moreOpen }));
  app.quit();
}
app.on('second-instance', () => { if (hidden) showOverlay(); else showSettings(); });
app.whenReady().then(async () => {
  const loaded = loadConfig(userData()); config = loaded.config; configError = loaded.error;
  if (loaded.error) console.error(loaded.error); else if (!fs.existsSync(configFile())) persistConfig();
  createOverlay();
  if (smoke || instagramCheck || integrationCheck || actionCheck) {
    reelView.webContents.once('did-finish-load', () => setTimeout(smoke ? runSmoke : integrationCheck ? runIntegrationCheck : actionCheck ? runActionCheck : runInstagramCheck, 500));
    return;
  }
  registerSettingsIpc(); await createTray();
  refreshTimer = setInterval(pollForeground, 400); pollForeground();
  if (configError) notifyStatus(configError, true);
});
app.on('before-quit', () => { quitting = true; clearTimeout(saveBoundsTimer); clearInterval(refreshTimer); clearInterval(cropTimer); });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (quitting || !tray) app.quit(); });
