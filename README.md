# Surreal 3D Snake (Browser)

Third-person 3D snake game built with `Three.js + TypeScript`.

## Features

- Third-person cinematic camera with inertia and dynamic FOV
- Toroidal world (`X/Z` wraparound)
- Free movement snake model with tail interpolation
- Obstacles (`static` + `pulse`) and 3 powerups (`overdrive`, `phase`, `magnet`)
- Expanded HUD with mini radar
- Full loop: menu -> play -> pause -> game over -> restart
- Online arena mode (io-style) via Vercel API (ephemeral in-memory arena)
- Name is required before joining arena
- RU/EN runtime localization
- Local highscores + versioned settings storage
- Quality presets and dynamic resolution scaling

## Scripts

- `npm run dev`
- `npm run dev:vercel`
- `npm run build`
- `npm run preview`
- `npm run test`
- `npm run test:e2e`
- `npm run lint`

## Tech

- Vite
- Three.js
- Vercel Functions (`/api/*`)
- i18next
- zod
- Vitest + Playwright

## Multiplayer Setup (Vercel)

1. Deploy project to Vercel (no external storage setup required).
2. API endpoints:
   - `POST /api/multiplayer/join`
   - `POST /api/multiplayer/sync`
   - `POST /api/multiplayer/leave`
   - `GET /api/multiplayer/health`
3. Arena storage is in-memory:
   - server state exists only while a function instance is warm;
   - stale players are cleaned automatically.

## Notes

- Mobile orientation target: landscape
- Audio is intentionally out of scope for V1
- Add `?debug=1` to URL to show perf overlay
- Local `vite dev` runs without Vercel functions; multiplayer auto-falls back to offline mode.
