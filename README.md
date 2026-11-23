# Press Play Media

A local-first music and video player that runs entirely in the browser. No server, no account, no upload. Drop in your files and it plays them.

Built as a single-page PWA, installable on desktop and mobile, and fully usable offline once loaded.

## Features

- Playlist sidebar with drag-to-reorder tracks and multiple saved playlists
- Shuffle and repeat (all/one) playback modes
- Built-in equalizer and audio visualizer with adjustable sensitivity
- Clip trimming and export tool
- Customizable UI (background art, quick action bar, resizable sidebar)
- Keyboard shortcuts and configurable touch gestures
- Local storage via IndexedDB (media files) and localStorage (settings, playlists, metadata), so your library persists between sessions
- Installable as a Progressive Web App with offline support via a service worker

## Getting started

1. Clone or download this repository.
2. Open `index.html` in a browser, or serve the folder with any static file server.
3. Add your music or video files through the playlist panel.

To install as an app, open the page in a supporting browser and use the install/add-to-home-screen option.

## Tech

Plain HTML, CSS, and JavaScript. No build step, no dependencies. All playback, storage, and UI logic live in `index.html`, with `sw.js` handling offline caching and `manifest.json` providing PWA metadata.

## Where this version comes from

The app files here (`index.html`, `vocal-separator.js`, `native-bridge.js`, `alarm.html`, the `pp-*.js` scripts, `fonts/` and `games/`) are copied from the web layer of the Android app in [Terrifying-Press](https://github.com/MyMan577/Terrifying-Press) (`www/`, after `tools/assemble.py`). In a normal browser its Android-only features (the native ExoPlayer engine, the VLC engine, the Snapdragon NPU, notifications, alarms on the lock screen) switch themselves off and the app uses the browser's own player.

What this repository adds on top: `manifest.json`, the icons, `sw.js` (offline caching) and `update-option.js` (the "check for updates on every load" option in Settings). They are linked from the end of `index.html` and its `<head>`.

To update to a newer app version: build `www/` in Terrifying-Press, copy its contents over this folder, put the manifest/icon links and the service worker script back into `index.html`, and bump `CACHE_NAME` in `sw.js`.

## Notes

Everything runs client-side. Your media files stay in your browser's local storage and are never uploaded anywhere.
