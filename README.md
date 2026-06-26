# IPTV Player

A **lightweight** streaming player for Samsung Smart TV (Tizen) that also runs in the browser, with planned desktop support (Tauri). Built around **performance on old hardware** and intuitive remote-control navigation.

## 🎯 Technical highlights

- **Lightweight-first:** no heavy frameworks (vanilla TS, Preact optional). ES2015 target for old TVs.
- **Cross-platform:** the same core runs on Tizen (TV), browser (dev + PC) and desktop (future).
- **Player abstraction:** single `Player` interface with adapters for native AVPlay (Tizen, hardware HEVC/4K decode) and `<video>` + hls.js (browser/desktop).
- **Spatial navigation:** custom D-pad focus manager — remote-control navigation without relying on the browser's `:focus`.
- **Virtual scroll:** lists never render in full in the DOM (index-based controlled scroll).
- **1h cache + manual clear:** catalog in IndexedDB with TTL and a force-refresh button (EPG always fresh, on demand).
- **Source-agnostic:** Xtream (lazy-loaded JSON API) implemented; M3U (URL/file) on the roadmap — `detectSource()` already auto-detects and promotes Xtream when it recognizes the pattern.
- **On-demand EPG:** loads the guide per channel when needed (`get_short_epg`), instead of downloading the whole XMLTV.

## 📦 Stack

- **TypeScript 5.7** (strict)
- **Vite 6** (build + dev proxy)
- **hls.js** (live HLS in the browser)
- **Playwright** (10 E2E tests against a real provider)
- **Tizen SDK** (standalone CLI, no Tizen Studio IDE)

## 🏗️ Architecture

```
src/
├── platform/          # Runtime detection, keys (D-pad), http, on-screen debug
├── data/              # Source (Xtream), config/detect, cache, sources-store
├── cache/             # IndexedDB store (kv) with 1h TTL
├── player/            # Player factory + adapters (avplay, html5+hls.js)
├── ui/                # Views: app, list-view (virtual), detail, player, form
└── main.ts            # Bootstrap

```

### Data sources

| Type | Path | Pros | Cons |
|------|------|------|------|
| **Xtream** ✅ | `/player_api.php` → JSON | Categories/series as a tree, lazy-load, on-demand EPG | Credentials in the URL |
| **M3U (URL)** 🚧 | HTTP → `.m3u` list | Simple | Streaming parser (100MB+ is heavy) |
| **M3U (file)** 🚧 | Local import | Fast | Heuristic categorization |

> ✅ implemented · 🚧 planned (auto-detection in `detectSource()` already exists).

**Auto-detection:** `detectSource()` recognizes Xtream and promotes it to the JSON API; any other URL becomes a raw M3U.

### Cache

- **IndexedDB with 1h TTL:** catalog only (categories/streams). EPG is always fetched fresh.
- **"Clear cache" button** under Options.
- **Images/logos:** lazy-load of visible items, runtime cache.

## 🎮 Navigation

- **D-pad:** arrows (Up/Down/Left/Right) move focus
- **OK/Enter:** select item or open player
- **Back/Return:** go back to the previous screen
- **Color keys:** customizable shortcuts (config.xml)

No mouse/touch — fully navigable by remote control.

## 📺 Supported devices

### Samsung Smart TV (Tizen)
- **Primary target:** CU8000 (Tizen 7, 4K, HEVC)
- **Compatible with:** older TVs (weak CPU, old WebKit/Chromium)
- **Output:** `.wgt` signed with a **Samsung certificate** (author + distributor per DUID), installable via sdb (Developer Mode) or USB (`.tmg` through the Samsung USB Demo Packaging Tool)

### Browser
- Dev: `npm run dev` (Vite + proxy to work around CORS)
- Web build: `npm run build` → `dist/`
- Live via **hls.js** (native HLS only as a Safari fallback); VOD via `<video>`. HEVC/4K won't decode in the browser (MSE limitation) — works on the TV via AVPlay.

### Desktop (future)
- Tauri wrapper reusing `dist/`

## 🚀 Getting started (development)

### Setup
```bash
npm install
```

### Dev
```bash
npm run dev
# Opens http://localhost:5173 with an `/api` proxy to the provider
```

### Build
```bash
npm run build
npm run preview  # serve the build locally
```

### E2E tests
```bash
npm run test:e2e
# 10 tests against a real provider (home, D-pad, categories, player, cache, etc.)

# With real Chrome:
PW_CHANNEL=chrome npm run test:e2e
```

### Tizen `.wgt`
```bash
npm run package:wgt          # builds IPTVPlayer.wgt (~187 KB)
./scripts/sign-wgt.sh        # signs → IPTVPlayer-signed.wgt (needs Tizen CLI + Samsung cert)
# install on the TV (Developer Mode):
#   sdb connect <TV_IP> && tizen install -n IPTVPlayer-signed.wgt -s <TV_IP>:26101 -- .
```

## 🔐 Security

- **No hardcoded credentials:** the user enters the URL at runtime (UI → localStorage/IndexedDB)
- **Mobile User-Agent:** the proxy injects a mobile `User-Agent` to avoid provider blocks
- **CORS handled:** dev proxy + native headers on Tizen/Tauri
- **`.env` not committed:** template in `.env.example`

## 📊 Numbers

| Metric | Value |
|--------|-------|
| App JS (build) | ~9 KB gzip (hls.js +162 KB, on demand for live) |
| `.wgt` (Tizen) | ~187 KB |
| Reference catalog | 250k+ items (videos), 85 categories |
| Cache TTL | 1h |
| E2E tests | 10 (Playwright, real provider) |
| TypeScript | strict ✓ |

## 🔧 Commands

```bash
npm run dev          # Dev server
npm run build        # Web build
npm run typecheck    # TS strict check
npm run test:e2e     # Playwright E2E
npm run package:wgt  # Tizen package
npm run preview      # Preview build
```

## 🎨 Performance

- **Target:** ES2015 (compatible with old TVs)
- **No heavy polyfills:** relies on native support
- **No needless dynamism:** minimal animations, reflows avoided
- **Batched IndexedDB:** grouped writes for slow TVs

## 📝 License

Personal portfolio project. Respect your streaming provider's ToS.

## 🤝 Contact

adrianofranco@adrianofranco.com.br

---

**Status:** In development · navigable in dev · player and cache validated against a real provider · installed and running on a Samsung CU8000 (AVPlay HEVC/4K via sdb/Developer Mode)
