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

## Notes

Everything runs client-side. Your media files stay in your browser's local storage and are never uploaded anywhere.
