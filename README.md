# Surreal 3D Snake (Browser)

Third-person 3D snake game built with `Three.js + TypeScript`.

## Features

- Third-person cinematic camera with inertia and dynamic FOV
- Toroidal world (`X/Z` wraparound)
- Free movement snake model with tail interpolation
- Obstacles (`static` + `pulse`) and 3 powerups (`overdrive`, `phase`, `magnet`)
- Expanded HUD with mini radar
- Full loop: menu -> play -> pause -> game over -> restart
- Online arena mode (io-style) via Vercel API + Vercel KV
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
- Vercel KV (`@vercel/kv`)
- i18next
- zod
- Vitest + Playwright

## Multiplayer Setup (Vercel)

1. In Vercel project dashboard, add **Storage -> KV**.
2. Make sure KV env vars are available in Production/Preview:
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`
   - `KV_REST_API_READ_ONLY_TOKEN`
3. Deploy. API endpoints are:
   - `POST /api/multiplayer/join`
   - `POST /api/multiplayer/sync`
   - `POST /api/multiplayer/leave`
4. If KV is missing or temporarily unavailable, API auto-falls back to in-memory mode.
   - Useful for quick self-testing.
   - In-memory mode is ephemeral and not suitable for production multiplayer.

## Notes

- Mobile orientation target: landscape
- Audio is intentionally out of scope for V1
- Add `?debug=1` to URL to show perf overlay
- Local `vite dev` runs without Vercel functions; multiplayer auto-falls back to offline mode.
