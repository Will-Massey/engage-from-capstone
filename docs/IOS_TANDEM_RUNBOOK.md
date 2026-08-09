# Engage iOS build — Mac tandem runbook

How to run the Engage iOS build on the Mac as a Capstone Tandem session
(Claude builds + narrates, Grok red-teams, William watches the viewer).
Written 2026-08-09, when the Windows box shipped the Android shell and
everything the Mac needs was pushed.

The iOS project is already scaffolded and committed at `frontend/ios/App`
(app id `uk.co.capstonesoftware.engage`, web dir `frontend/dist`). What the
Mac session does is: sync the web bundle, install pods, and archive/sign in
Xcode — then run the store submission following Graft's
`docs/APP-STORE-SUBMISSION.md` in the graft repo as the template.

## 1. Mac preparation (once)

1. **Xcode** installed from the App Store, opened at least once (accepts the
   licence), plus command-line tools: `xcode-select --install`.
2. **Node 20+**: `node --version`. (Apple-silicon native; Rosetta is NOT
   needed for this stack.)
3. **CocoaPods**: `pod --version` — if missing, `brew install cocoapods`
   (or `sudo gem install cocoapods`).
4. **Repos**:
   - `git clone git@github.com:Will-Massey/engage-from-capstone.git`
     (or `git pull` if present — must include the Android-shell PR merge).
   - `git pull` in `grok-chat` (cloned there 2026-07-11). As of 2026-08-09
     origin carries protocol v2.2, the sync-safety work, and the Ruflo
     bridge — the first pull auto-generates this Mac's own machine id and
     per-machine chat file.
5. **xAI key for grok-chat** (Mac has no HQ config): either
   `export XAI_API_KEY=...` in the shell, or put the key in
   `~/.config/grok-chat/config.json` per the grok-chat README's Mac section.
6. **Thread choice**: by default the Mac gets its own tandem thread (own
   `chat-<id>.jsonl`). To share one thread with the Windows PC, point
   `GROK_CHAT_DIR` at a synced folder on BOTH machines — safe since the
   v2.1 per-machine-file sync work. Own-thread is fine for this build.

## 2. Build loop (each session)

```sh
# viewer (William watches at http://localhost:4816)
cd grok-chat && node server.mjs &

# tandem session
node grok.mjs brief  --session engage-ios-ship "scope..."
node grok.mjs status --session engage-ios-ship "narration..."   # free, no API
node grok.mjs ruling --session engage-ios-ship "1. ACCEPTED — ..."

# the actual build
cd ../engage-from-capstone
npm ci && npm run build:shared
cd frontend
npm run cap:sync:ios          # vite build (capacitor mode) + cap sync ios
cd ios/App && pod install
npx cap open ios              # opens Xcode workspace
```

In Xcode: select the `App` target → Signing & Capabilities → William's Apple
Developer team (same as Graft) → Product → Archive → Distribute App.

## 3. Facts that save time

- `frontend/.env.capacitor` bakes `VITE_API_URL=https://engage-backend-e1ue.onrender.com`
  — the native WebView is cross-origin, so the absolute base is required.
  No local backend is needed for a store build.
- CORS already allows `capacitor://localhost` and `https://localhost`
  (`backend/src/app/corsOptions.ts`).
- The staff tab bar is `frontend/src/components/NativeTabBar.tsx`
  (Home · Jobs · Inbox · Clients · Proposals).
- Store listing raw material: Graft's `docs/APP-STORE-SUBMISSION.md` is the
  proven template (screenshots sizes, review notes, demo account pattern).
- Android's CI build (`.github/workflows/android-debug-apk.yml`) is the
  reference for the exact web-build order if anything drifts.

## 4. Troubleshooting

- **`pod install` fails on repo state** → `pod repo update` first.
- **grok.mjs "cannot find key"** → step 1.5 above; the error names the two
  locations it checked.
- **Xcode archive greyed out** → select a "Any iOS Device (arm64)"
  destination, not a simulator.
- **White screen on device** → the web bundle didn't sync; re-run
  `npm run cap:sync:ios` and confirm `ios/App/App/public/index.html` updated.
- **Signing errors** → Xcode → Settings → Accounts → re-auth the Apple ID,
  then let Xcode "Automatically manage signing".
