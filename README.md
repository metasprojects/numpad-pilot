# Numpad Pilot

![Numpad Pilot logo](docs/logo.svg)

A Windows-only Instagram Reels overlay for playing War Thunder in **borderless windowed** mode on one monitor. The play view shows just the Reel video and its on-video caption. The Instagram action rail remains in the page, outside the visible crop, so shortcuts can operate it. This project is unaffiliated with Gaijin, BattlEye, and Meta.

## Install on Windows

The Windows installer creates **Numpad Pilot** shortcuts on the desktop and in the Start menu. Double-click the installer, choose where to install it, then launch the app from either shortcut. Sign in to Instagram in the app on first use. Set War Thunder to **borderless windowed** mode.

The installer is being tested locally and is not yet posted as a GitHub release. If you are building from source, install Node.js and run:

```powershell
npm ci
npm run dist:win
```

Then open `dist\Numpad Pilot Setup 0.1.3.exe`. To run the source directly, use `npm start` after `npm ci`.

## First use

Sign in directly in the Instagram window if prompted. Your login stays in Electron's persistent local browser session. The project does not request or store your Instagram password. If the play view is cropped before you sign in, choose **Open Instagram view** from the tray menu, then sign in. The tray menu also provides Settings and Quit.

If you used the earlier Reel Overlay build, Numpad Pilot copies its local profile on first launch so your Instagram sign-in and settings carry over. The original profile remains in place as a backup.

Exclusive fullscreen may cover ordinary desktop windows. The overlay starts near the right edge and passes mouse input through during play. Press numpad decimal to enter move mode. The Reel stays cropped and War Thunder keeps focus. Use numpad 8 / 2 / 4 / 6 to move it up / down / left / right in 24-pixel steps, then press decimal again to save its position. Those four keys move the window instead of controlling playback while move mode is active.

| Key | Action |
| --- | --- |
| Numpad 8 / 2 | Previous / next Reel |
| Numpad 5 | Pause / play |
| Numpad 4 / 6 | Reel volume down / up by 2% |
| Numpad 7 / 9 | Opacity down / up |
| Numpad + | Like, only if not already liked |
| Numpad - | Unlike, only if already liked |
| Numpad / | Open comment field; type and submit yourself |
| Numpad * | Save / unsave |
| Numpad 1 | Open Instagram's Send / Share controls |
| Numpad 3 | Open More controls |
| Numpad 0 | Hide / show |
| Numpad decimal | Enter / leave move mode without leaving the game |
| Escape | Close the Comment / Send view and return focus to War Thunder |

Comment opens a restyled Instagram comment panel inside the compact Reel window without changing the Reel's scale. Send / Share opens a restyled recipient panel in a temporary, wider window at the same scale. More still opens the full Instagram view. You type comments, choose recipients, and submit in Instagram; nothing is sent automatically. Press Escape to close a panel and return to the game. Hiding pauses and mutes the Reel. Showing restores the configured volume and resumes only if it was playing before hide. While hidden, only the show shortcut remains reserved; the other numpad keys return to the game.

Like, Unlike, and Comment show a small brief cue inside the Reel window. The cue does not take focus or mouse input from the game.

Shortcuts are registered while War Thunder or the overlay is focused. Detection uses the foreground window title; the default match is `War Thunder`. If Windows or another application has reserved a key, Settings reports which shortcut could not be registered. Change shortcuts, opacity, volume, title match, and window position in Settings or the local `config.json` opened from Settings. Keep shortcuts unique. With Num Lock off, some numpad accelerators may behave differently; verify your own keyboard.

## Boundaries and limitations

The app uses a normal signed-in Instagram website. Each shortcut performs one user-requested action. It has no Instagram private API, scraping, preset comments, batch engagement, password collection, telemetry, game-process access, memory reading, injection, driver, or keyboard hook. The only native game check reads the foreground window title to decide when to register shortcuts. Instagram can change its page structure and break action detection or the video crop; the app reports missing controls instead of guessing.

Local tests have verified Electron shortcut registration, signed-in Reel playback, the visible crop, comment-field opening, volume, hide/show, opacity, and Reel navigation. **War Thunder with BattlEye enabled has not yet been tested.** Compatibility in one game session would be evidence, not anti-cheat approval. Test it in borderless mode before relying on it. Confirm that reserved keys do not reach the plane, hidden keys return to the game, both Num Lock states, comments, repeated hide/show, login persistence, and behavior after Instagram page updates. Stop using it if either platform objects or game behavior suggests a conflict.

Before any packaged release or recommendation for in-game use, recheck the current [Gaijin terms](https://legal.gaijin.net/en/termsofservice), [BattlEye FAQ](https://www.battleye.com/support/faq/), and [Instagram terms](https://help.instagram.com/581066165581870). The public source is a work in progress, not a tested game release.

## Project page

The simple static GitHub Pages site is in `docs/`. Preview it locally by opening `docs/index.html`, or serve that folder with any static file server. The page has no build step or external dependencies.

GitHub Pages publishes from the default branch's `/docs` folder. The site has relative asset paths and no build step.
