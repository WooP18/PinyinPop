# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Lint JS (with auto-fix)
npm run lint

# Lint CSS
npm run csslint
```

No build step — extension runs as-is. Load unpacked in `chrome://extensions` (Developer mode on).

## Architecture

Manifest V3 Chrome/Firefox extension. Three execution contexts that communicate via `chrome.runtime.sendMessage()`:

### 1. Service Worker (`background.js` + `dict.js`)
- Owns all dictionary state — lazy-loads `data/cedict_ts.u8` + `data/cedict.idx` on first enable
- `ZhongwenDictionary` in `dict.js` does binary search on the index file; results cached in memory
- Manages extension enabled/disabled state, persists to `chrome.storage.local`
- Handles tab reuse for wordlist/help/dictionary pages
- Receives `search` / `add` / `open` messages from content script

### 2. Content Script (`content.js`)
- Injected into every page; detects Chinese characters under cursor via `caretRangeFromPoint()`
- Sends `{type: 'search', text}` to background, renders popup inline via DOM injection
- Handles all keyboard shortcuts (N/B/M/A/R/C/G/V/S/T/X/Y/Esc, Alt+1-7, Alt+W)
- Does **not** use ES6 `import` — background.js does (loaded as `type: module`)

### 3. UI Pages (`options.html`, `wordlist.html`, `help.html`)
- Read/write `chrome.storage.local` directly (no message passing)
- jQuery + Bootstrap 4 + DataTables used only in wordlist/options pages — not in core logic

### Data flow
```
Page (content.js) → sendMessage(search) → background.js
                                               ↓
                                        ZhongwenDictionary.wordSearch()
                                               ↓
                  ← response {words:[...]} ←──┘
content.js renders popup with pinyin/tones/definitions
```

### Storage keys
`enabled`, `popupcolor`, `tonecolors`, `fontSize`, `simpTrad`, `zhuyin`, `grammar`, `vocab`, `wordlist` (JSON array), `saveToWordList`, `skritterTLD`

### Tone colors
CSS classes `t1`–`t5` in `css/content.css`. Three schemes (standard/Pleco/Hanping) toggled via body class; configured in options.

## Key constraints
- No bundler — keep files as plain JS; `import` only works in `background.js` (service worker)
- Dictionary data files are read-only build artifacts; do not modify `cedict_ts.u8` or `cedict.idx`
- MV3 service worker can be killed by browser at any time — all state must be re-loadable from `chrome.storage.local`
