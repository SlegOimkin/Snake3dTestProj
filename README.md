# Surreal 3D Snake (Browser)

Third-person 3D snake game built with `Three.js + TypeScript`.

## Features

- Third-person cinematic camera with inertia and dynamic FOV
- Toroidal world (`X/Z` wraparound)
- Free movement snake model with tail interpolation
- Obstacles (`static` + `pulse`) and 3 powerups (`overdrive`, `phase`, `magnet`)
- Expanded HUD with mini radar
- Full loop: menu -> play -> pause -> game over -> restart
- RU/EN runtime localization
- Local highscores + versioned settings storage
- Quality presets and dynamic resolution scaling

## Scripts

- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run test`
- `npm run test:e2e`
- `npm run lint`

## Tech

- Vite
- Three.js
- i18next
- zod
- Vitest + Playwright

## Notes

- Mobile orientation target: landscape
- Audio is intentionally out of scope for V1
- Add `?debug=1` to URL to show perf overlay
