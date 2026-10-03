# Engage mobile shells (Capacitor) — W4.1

**Status:** Real Xcode and Android Studio projects, not a PWA. iOS is `frontend/ios` (iPhone and iPad, `TARGETED_DEVICE_FAMILY = 1,2`). Android is `frontend/android` (phones and large screens, resizable activity).  
**App id:** `uk.co.capstonesoftware.engage`  
**Display name:** Capstone Engage  
**Web dir:** `frontend/dist` (Capacitor build mode, `npm run build:capacitor`)  
**API:** baked in from `frontend/.env.capacitor` (`VITE_API_URL`). Production points at the Render API. Do not commit keystores or secrets.

## Layout

The same Engage SPA runs in the WebView. Sign-in, clients, proposals, jobs, and inbox are the staff product, not a separate mobile rewrite.

| Screen                                 | Chrome                                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| iPhone, Android phone, landscape phone | Bottom tabs (Home, Jobs, Inbox, Clients, Proposals) and a drawer for the rest of the nav              |
| iPad (portrait and landscape)          | Persistent sidebar. The tab bar is not stretched across the tablet                                    |
| Android tablet / large screen          | Same adaptive sidebar when the window is at least 768×600 CSS pixels. Phones stay on the phone chrome |
| Desktop web at 1024px and wider        | Existing sidebar                                                                                      |

Thresholds live in `frontend/src/lib/layoutMode.ts` and the shell media queries in `frontend/src/index.css`. Proposal and job lists use cards until the window is wide enough for the table. Sign-in is a single column on a phone and a two-pane layout on iPad.

iOS ship steps: `docs/IOS_TANDEM_RUNBOOK.md`. Play listing: `docs/PLAY_STORE_SUBMISSION.md`.

## Run iOS (Xcode)

From the repo root, after `npm ci`:

```bash
npm run ios:sync          # Vite capacitor build + cap sync ios
cd frontend/ios/App && pod install
npm run ios:open          # opens frontend/ios/App/App.xcworkspace
```

In Xcode, pick an iPhone or iPad simulator (or a device) and run the **App** scheme. The workspace is `frontend/ios/App/App.xcworkspace`. Minimum iOS is 15. Bundle id `uk.co.capstonesoftware.engage`.

Command-line build (example, iPad simulator):

```bash
cd frontend/ios/App
xcodebuild -workspace App.xcworkspace -scheme App \
  -destination 'platform=iOS Simulator,name=iPad Pro 11-inch (M5)' \
  -configuration Debug build
```

## Run Android (Android Studio)

```bash
npm run android:sync      # Vite capacitor build + cap sync android
npm run android:open      # opens frontend/android
```

Or from `frontend/android`:

```bash
./gradlew assembleDebug
```

Install the debug APK on a phone or a tablet emulator. `minSdk` 23, `targetSdk` 35, application id `uk.co.capstonesoftware.engage`. Release signing reads a gitignored `frontend/android/keystore.properties` and is not required for a debug build.

CI can also build the debug APK (`Android debug APK` workflow) and a signed AAB (`Android release AAB`, needs the four keystore secrets in `docs/PLAY_STORE_SUBMISSION.md`).

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

Android is already added. `capacitor.config.ts` sets `androidScheme: 'https'`. Re-sync with `npm run android:sync` from the repo root.

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

Custom scheme `engage://` is registered on Android (`AndroidManifest`) and iOS (`CFBundleURLTypes`). Capacitor `appUrlOpen` / `getLaunchUrl` run through `parseNativeOpenUrl` so production `https://capstonesoftware.co.uk/engage/…` links still land on the SPA path (the native Vite build has no `/engage` basename).

| Link                                                   | Opens                                               |
| ------------------------------------------------------ | --------------------------------------------------- |
| `engage://portal/{token}`                              | Client portal                                       |
| `engage://proposals/view/{token}`                      | Public proposal sign                                |
| `engage://letters/view/{token}`                        | Letter e-sign                                       |
| `engage://onboarding/aml/{token}`                      | AML form                                            |
| `https://capstonesoftware.co.uk/engage/portal/{token}` | Same portal path once the OS delivers it to the app |

Staff URLs (`/jobs`, `/login`, …) are ignored so a stray https share does not hijack the tab shell. Universal / App Links (https host ownership) are not registered yet — until then, share `engage://…` or open the https URL in the in-app WebView.

## Practice vs production

|        | Practice                              | Production cutover                 |
| ------ | ------------------------------------- | ---------------------------------- |
| Bundle | Local `cap:sync` against practice API | Point `VITE_API_URL` at Render API |
| Store  | Not published                         | Separate release checklist         |

Do **not** publish store builds from practice secrets.
