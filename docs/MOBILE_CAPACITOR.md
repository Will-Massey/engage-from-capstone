# Engage mobile shells (Capacitor) — W4.1

**Status:** iOS project scaffolded under `frontend/ios/`; **Android platform committed under `frontend/android/` (2026-08-09)** — build APKs via the `Android debug APK` workflow (Actions tab; CI is the canonical Android build env, local boxes need no SDK). iOS ship steps: `docs/IOS_TANDEM_RUNBOOK.md`.  
**Gate:** Cut iOS only after `docs/DESKTOP_WALKTHROUGH.md` is signed off.  
**App id:** `uk.co.capstonesoftware.engage`  
**Web dir:** `frontend/dist` (Capacitor build mode)

## Staff native tabs (current)

Home · Jobs · **Inbox** · Clients · Proposals — see `NativeTabBar.tsx`.

## Architecture

```
Capacitor shell (iOS / Android)
  └── Vite SPA (same Engage frontend)
        ├── Staff: login → jobs board / workload / job detail
        └── Public: /portal/:token · /proposals/view/:token
```

API base URL is baked at build time via `VITE_API_URL` (practice: `http://localhost:3101/api` or LAN IP for device; production: Render API).

CORS already allows `capacitor://localhost` and `https://localhost` (see `backend/src/app/corsOptions.ts`).

## Scripts (from `frontend/`)

| Command                   | Purpose                          |
| ------------------------- | -------------------------------- |
| `npm run build:capacitor` | Vite build with `CAPACITOR=true` |
| `npm run cap:sync`        | Build + `cap sync` all platforms |
| `npm run cap:sync:ios`    | Build + sync iOS only            |
| `npm run cap:open:ios`    | Open Xcode                       |
| `npm run cap:run:ios`     | Sync + run on simulator/device   |

## Add Android (when SDK present)

```bash
cd frontend
npm i -D @capacitor/android
npx cap add android
npm run build:capacitor
npx cap sync android
npx cap open android
```

`capacitor.config.ts` already sets `androidScheme: 'https'`.

## Live reload (device on LAN)

In `capacitor.config.ts` temporarily:

```ts
server: {
  url: 'http://YOUR_LAN_IP:5273',
  cleartext: true,
}
```

Run Vite with `--host` (already default in `npm run dev`).

## Safe areas

`initNativeShell()` (main.tsx) adds `capacitor-native` class; `index.css` applies `env(safe-area-inset-*)` padding on body.

## Portal deep links

Use universal links / custom scheme later. For now open:

- Staff: `https://app…/` (or cap server url) after login
- Client portal: `/portal/{token}`
- Public sign: `/proposals/view/{token}`

## Practice vs production

|        | Practice                              | Production cutover                 |
| ------ | ------------------------------------- | ---------------------------------- |
| Bundle | Local `cap:sync` against practice API | Point `VITE_API_URL` at Render API |
| Store  | Not published                         | Separate release checklist         |

Do **not** publish store builds from practice secrets.
