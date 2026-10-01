function bootstrap() {
  if (window.__reelOverlay) return;

  let desiredVolume = 0.5;
  let interaction = false;
  let moving = false;
  let feedbackTimer;
  const style = document.createElement('style');
  style.id = 'numpad-pilot-style';
  style.textContent = `
    * { scrollbar-width: none !important; }
    *::-webkit-scrollbar { display: none !important; width: 0 !important; }
    html, body { background: #0b0d12 !important; }
    #numpad-pilot-grip { position: fixed; z-index: 2147483647; top: 4px; left: 8px; right: 8px;
      height: 38px; align-items: center; justify-content: center; color: white; background: #252a33dc;
      border: 1px solid #ffffff33; border-radius: 13px; box-shadow: 0 5px 20px #0005;
      backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
      font: 700 11px system-ui; letter-spacing: .06em;
      -webkit-app-region: drag; cursor: move; user-select: none; display: none; }
    #numpad-pilot-move-hint, #numpad-pilot-feedback { position: fixed; z-index: 2147483647;
      pointer-events: none; color: white; background: #1b2029d9; border: 1px solid #ffffff55;
      border-radius: 999px; box-shadow: 0 4px 14px #0005; backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px); white-space: nowrap; display: none; }
    #numpad-pilot-move-hint { padding: 6px 9px; font: 700 10px system-ui; letter-spacing: .03em; }
    #numpad-pilot-feedback { padding: 6px 10px; font: 700 11px system-ui; }
    #numpad-pilot-feedback.visible { display: block; animation: np-feedback 1150ms ease-out forwards; }
    @keyframes np-feedback {
      0% { opacity: 0; transform: translate(-100%, -6px) scale(.92); }
      18% { opacity: 1; transform: translate(-100%, 0) scale(1.04); }
      30%, 75% { opacity: 1; transform: translate(-100%, 0) scale(1); }
      100% { opacity: 0; transform: translate(-100%, -4px) scale(.98); }
    }
  `;
  document.head.appendChild(style);
  const grip = document.createElement('div');
  grip.id = 'numpad-pilot-grip';
  grip.textContent = 'DRAG TO MOVE  ·  ESC TO LOCK';
  document.body.appendChild(grip);
  const moveHint = document.createElement('div');
  moveHint.id = 'numpad-pilot-move-hint';
  moveHint.textContent = 'MOVE  ·  8/2/4/6  ·  . DONE';
  document.body.appendChild(moveHint);
  const feedback = document.createElement('div');
  feedback.id = 'numpad-pilot-feedback';
  document.body.appendChild(feedback);

  function visibleArea(element) {
    const rect = element.getBoundingClientRect();
    const width = Math.max(0, Math.min(innerWidth, rect.right) - Math.max(0, rect.left));
    const height = Math.max(0, Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top));
    return width * height;
  }

  function activeVideo() {
    return [...document.querySelectorAll('video')]
      .filter(video => visibleArea(video) > 1000)
      .sort((a, b) => visibleArea(b) - visibleArea(a))[0] || null;
  }

  function reelRoot(video) {
    for (let node = video; node && node !== document.body; node = node.parentElement) {
      if (node.querySelector('svg[aria-label="Like"],svg[aria-label="Unlike"]') &&
          node.querySelector('svg[aria-label="Comment"]')) return node;
    }
    return null;
  }

  function videoRect(video) {
    if (!video) return null;
    const rect = video.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      viewportWidth: innerWidth, viewportHeight: innerHeight };
  }

  function buttonFor(root, labels) {
    for (const label of labels) {
      const svg = root?.querySelector(`svg[aria-label="${label}"]`);
      const button = svg?.closest('[role="button"],button');
      if (button) return button;
    }
    return null;
  }

  function hideMobileBar() {
    const svg = document.querySelector('svg[aria-label="New post"]');
    for (let node = svg; node && node !== document.body; node = node.parentElement) {
      const rect = node.getBoundingClientRect();
      if (rect.width > innerWidth * 0.9 && rect.height >= 40 && rect.height <= 85) {
        node.style.display = 'none';
        break;
      }
    }
    const messages = document.querySelector('svg[aria-label="Messages"]')?.closest('[role="button"]');
    if (messages) messages.style.display = 'none';
    grip.style.display = interaction ? 'flex' : 'none';
    positionDecorations();
  }

  function positionDecorations() {
    const video = activeVideo();
    if (!video) { moveHint.style.display = 'none'; feedback.classList.remove('visible'); return; }
    const rect = video.getBoundingClientRect();
    moveHint.style.left = `${rect.left + 9}px`;
    moveHint.style.top = `${rect.top + 10}px`;
    moveHint.style.display = moving ? 'block' : 'none';
    feedback.style.left = `${rect.right - 9}px`;
    feedback.style.top = `${rect.top + 13}px`;
  }

  function showFeedback(value) {
    value = value || {};
    const labels = {
      like: value.changed ? '♥  Liked' : '♥  Already liked',
      unlike: value.changed ? '♡  Unliked' : '♡  Not liked',
      comment: value.changed ? '✎  Comment ready' : '✎  Comment view',
      share: '↗  Send options'
    };
    if (!Object.hasOwn(labels, value?.kind) || !activeVideo()) return { ok: false, error: 'Reel feedback unavailable.' };
    feedback.textContent = labels[value.kind];
    positionDecorations();
    feedback.classList.remove('visible');
    void feedback.offsetWidth;
    feedback.classList.add('visible');
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => feedback.classList.remove('visible'), 1200);
    return { ok: true, inWindow: true, text: feedback.textContent };
  }

  function setVolume(value) {
    desiredVolume = Math.max(0, Math.min(1, value));
    const video = activeVideo();
    if (video) {
      video.volume = desiredVolume;
      video.muted = desiredVolume === 0;
    }
    return { ok: !!video, volume: desiredVolume };
  }

  async function action(name, value) {
    hideMobileBar();
    const video = activeVideo();
    if (name === 'status') return { ok: !!video, paused: video?.paused ?? true, playingCount: [...document.querySelectorAll('video')].filter(v => !v.paused).length, volume: desiredVolume, rect: videoRect(video), url: location.href };
    if (name === 'moveMode') { moving = !!value; positionDecorations(); return { ok: true, moving }; }
    if (name === 'feedback') return showFeedback(value);
    if (name === 'interact') {
      interaction = !!(typeof value === 'object' ? value?.active : value);
      const purpose = typeof value === 'object' && ['CONTROLS', 'COMMENT', 'SEND', 'MORE'].includes(value?.purpose) ? value.purpose : 'CONTROLS';
      grip.textContent = `DRAG TO MOVE  ·  ${purpose}  ·  ESC TO LOCK`;
      hideMobileBar(); return { ok: true };
    }
    if (name === 'volumePreset') { desiredVolume = Math.max(0, Math.min(1, value)); if (video) video.volume = desiredVolume; return { ok: !!video, volume: desiredVolume }; }
    if (name === 'volume') return setVolume(value);
    if (name === 'hide') {
      const wasPlaying = !!video && !video.paused;
      for (const v of document.querySelectorAll('video')) v.pause();
      return { ok: true, wasPlaying };
    }
    if (!video) return { ok: false, error: 'No visible Reel is ready.' };
    if (name === 'show') {
      setVolume(value.volume);
      if (value.resume) await video.play().catch(() => {});
      return { ok: true, paused: video.paused };
    }
    if (name === 'playPause') {
      if (video.paused) {
        setVolume(desiredVolume);
        await video.play().catch(() => {});
      } else video.pause();
      return { ok: true, paused: video.paused };
    }
    const root = reelRoot(video);
    if (name === 'controls') return { ok: !!root, controls: Object.fromEntries(
      ['Like', 'Unlike', 'Comment', 'Share', 'Send', 'Save', 'Remove', 'Unsave', 'More']
        .map(label => [label, !!buttonFor(root, [label])])) };
    if (name === 'like' || name === 'unlike') {
      const wanted = name === 'like' ? 'Like' : 'Unlike';
      const button = buttonFor(root, [wanted]);
      if (button) button.click();
      else if (!buttonFor(root, [name === 'like' ? 'Unlike' : 'Like']))
        return { ok: false, error: 'Instagram’s Like control was not found.' };
      return { ok: true, changed: !!button };
    }
    if (name === 'save' || name === 'share' || name === 'more') {
      const labels = name === 'save' ? ['Save', 'Remove', 'Unsave'] : name === 'share' ? ['Share', 'Send'] : ['More'];
      const button = buttonFor(root, labels);
      if (!button) return { ok: false, error: `Instagram’s ${name} control was not found.` };
      button.click();
      return { ok: true };
    }
    if (name === 'comment') {
      const button = buttonFor(root, ['Comment']);
      if (!button) return { ok: false, error: 'Instagram’s Comment control was not found.' };
      const wasPlaying = !video.paused;
      video.pause();
      button.click();
      await new Promise(resolve => setTimeout(resolve, 650));
      const field = [...document.querySelectorAll('input,textarea,[contenteditable="true"]')]
        .find(element => {
          const label = `${element.getAttribute('placeholder') || ''} ${element.getAttribute('aria-label') || ''}`;
          const rect = element.getBoundingClientRect();
          return rect.width > 30 && rect.height > 10 && /comment/i.test(label);
        });
      field?.focus();
      return { ok: true, wasPlaying, fieldReady: !!field };
    }
    return { ok: false, error: 'Unknown action.' };
  }

  let lastVideo = null;
  setInterval(() => {
    hideMobileBar();
    const video = activeVideo();
    if (video && video !== lastVideo) {
      lastVideo = video;
      video.volume = desiredVolume;
      // A new Reel may begin muted by Instagram. Leave that state until a user key action.
    }
  }, 800);
  hideMobileBar();
  window.__reelOverlay = { action };
}

const bootstrapSource = `(${bootstrap.toString()})()`;

function isInstagram(webContents) {
  try { return new URL(webContents.getURL()).hostname === 'www.instagram.com'; }
  catch { return false; }
}

async function invoke(webContents, name, value = null) {
  if (!isInstagram(webContents)) return { ok: false, error: 'Open Instagram Reels first.' };
  try {
    await webContents.executeJavaScript(bootstrapSource, true);
    return await webContents.executeJavaScript(`window.__reelOverlay.action(${JSON.stringify(name)}, ${JSON.stringify(value)})`, true);
  } catch (error) {
    return { ok: false, error: `Instagram page action failed: ${error.message}` };
  }
}

module.exports = { invoke, isInstagram, bootstrapSource };
