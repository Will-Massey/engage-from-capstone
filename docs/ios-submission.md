# Capstone Engage for iOS — build and submission runbook

Capstone Engage ships to iOS as a Capacitor shell around the existing React SPA. There is
no second codebase: `frontend/` is built with `CAPACITOR=true` and copied into
`frontend/ios/App/App/public`. Anything true of the web app is true of the phone
app unless this document says otherwise.

- **Bundle ID:** `uk.co.capstonesoftware.engage`
- **App name:** Capstone Engage — use this for the App Store Connect listing and
  the home-screen name; it fits the home screen in full without truncating.
  The bundle ID stays `….engage` because a bundle ID can never be changed once
  registered, and it is never shown to users.
- **Marketing version:** 1.0 · **Build:** 1
- **Devices:** iPhone and iPad (`TARGETED_DEVICE_FAMILY = "1,2"`)
- **Deployment target:** iOS 14.0
- **Xcode used:** 26.4 · **CocoaPods:** 1.16.2

---

## 1. Blocking gate before any submission

**The backend must be deployed with the `X-Client` CORS change** (`backend/src/app/corsOptions.ts`).

The iOS shell sends `X-Client: ios` on every request. That is a custom header,
so WKWebView issues a CORS preflight, and until the deployed API lists
`X-Client` in `Access-Control-Allow-Headers` the preflight fails and _every_
API call from the app dies as an opaque network error. The app degrades
politely — it retries, then shows the login screen — but nobody can sign in.

Deploy is merge-to-`master` only (see `docs/agent-handover.md` §1); CI runs
lint + typecheck + Playwright, then deploys backend and frontend via the Render
API. Confirm afterwards:

```sh
curl -s -D - -o /dev/null -X OPTIONS https://capstonesoftware.co.uk/engage/api/auth/me \
  -H "Origin: capacitor://localhost" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: x-client,authorization" \
  | grep -i access-control-allow-headers
```

The response must contain `X-Client`. Covered by
`backend/src/app/__tests__/corsNativeClient.test.ts`.

---

## 2. How the app authenticates (and why it differs from the web)

Production cookies resolve to `sameSite: 'lax'` (`backend/src/utils/authCookies.ts`)
because the frontend and API share a host behind the engage-proxy worker. The
WebView is served from `capacitor://localhost`, which is cross-site to the API,
so **cookies can never reach it**. Native therefore uses bearer tokens:

|                | Web browser                                    | iOS shell                                                  |
| -------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| Login response | `csrfToken` + user, tokens in httpOnly cookies | `accessToken` + `refreshToken` in the body, **no cookies** |
| Request auth   | cookie + `X-CSRF-Token`                        | `Authorization: Bearer …`                                  |
| Refresh        | cookie, empty body                             | stored refresh token in the body, rotated pair stored      |
| CSRF           | enforced                                       | not applicable — no ambient credential exists              |

The native branch is gated on **`Origin`**, not on the `X-Client` header alone
(`backend/src/utils/nativeClient.ts`). `Origin` is a forbidden header name, so
browser script cannot forge it. Without that gate, script injected into the app
origin could POST `/auth/refresh` — cookies ride along same-site — claim to be
the app, and read the long-lived refresh token out of the body, turning a
session-bound XSS into persistent account access. Tokens live in Capacitor
Preferences (UserDefaults) via `frontend/src/lib/nativeSession.ts`.

Verified live against a running API: a native origin receives tokens and no
cookies; a browser origin sending `X-Client: ios` receives cookies and **no
tokens**.

---

## 3. App Store compliance decisions

**3.1.1 — no purchase route in the app.** Practices buy Engage on the web
before staff install the app. The native build therefore has no tier
storefront, no card form, and never loads the Stripe SDK; `/subscription`
renders a read-only statement of the plan the practice already holds
(`frontend/src/pages/Subscription.tsx`, guarded by `isNativeApp()`).

A link out to web checkout was considered and **rejected**: 3.1.1 bars
"buttons, external links, or other calls to action" directing users to another
purchasing mechanism, and linking out requires the External Purchase Link
entitlement, which Capstone does not hold. Pinned by
`frontend/src/pages/__tests__/Subscription.native.test.tsx`, which fails the
build if a button, link, price, or purchase word appears on that screen.

Client fee collection (a practice charging its own clients for accountancy
work) is untouched — that is payment for real-world services outside the app,
which IAP rules do not cover.

**5.1.1(v) — account deletion** already exists in-app: Settings → Security →
Delete Account (`DELETE /auth/me`).

**Sign in with Apple** is not required: Engage offers no third-party social
login.

**Encryption / export compliance.** `ITSAppUsesNonExemptEncryption = false` in
`Info.plist`. Engage uses only HTTPS and Apple-provided cryptography (exempt
under 5D992.c). Answer App Store Connect's export questions to match: uses
encryption → **Yes**; exempt → **Yes** (standard encryption only). A mismatch
between the plist and the ASC answers is its own rejection.

**App icon** is the mark from the desktop lockup
(`frontend/public/images/engage-logo.svg`) — the solid gradient hexagon users
already recognise, not the outlined `engage-icon.svg` variant, which reads as a
hollow ring at icon sizes. Three appearances ship: light (gradient mark on
white), dark and tinted (both transparent, so the system supplies its own
ground). Shipping only one appearance is not neutral — iOS 18+ improvises the
others, and with a white-ground icon that produced a shrunken circle on a grey
tile in dark mode. Regenerate with
`scratchpad/compose_appearances.py`-style compositing if the brand mark changes;
the light icon must stay free of an alpha channel.

**Privacy manifest** ships at `frontend/ios/App/App/PrivacyInfo.xcprivacy` and
is wired into the target's Resources build phase — confirm it is present inside
the built `.app`, because a manifest that is not a target resource silently
never ships.

---

## 4. App Privacy answers (must match the manifest exactly)

Tracking: **No**. No third-party analytics, ads, or tracking SDKs.

| Data type                                    | Collected | Linked | Tracking | Purpose           |
| -------------------------------------------- | --------- | ------ | -------- | ----------------- |
| Name                                         | Yes       | Yes    | No       | App Functionality |
| Email address                                | Yes       | Yes    | No       | App Functionality |
| Phone number                                 | Yes       | Yes    | No       | App Functionality |
| User ID                                      | Yes       | Yes    | No       | App Functionality |
| Other data (client records, proposals, fees) | Yes       | Yes    | No       | App Functionality |

---

## 5. Reviewer notes and demo account

Graft was rejected on bad reviewer credentials and The Forge on a cross-tenant
403; both are avoidable. Before submitting: create a demo user in a
pre-provisioned tenant that already contains a few clients, services and
proposals, **sign in as that user on a real device**, and walk the reviewer path
end to end.

Suggested review notes:

> Capstone Engage is a business tool for UK accountancy practices. Accounts are
> created by a practice administrator on our website as part of a paid practice
> subscription; there is no consumer signup and nothing can be purchased inside
> the app. The Subscription screen shows the practice's existing plan for
> reference only.
>
> Demo account: <email> / <password>
>
> The account is pre-loaded with sample clients and proposals. Sign in, then the
> dashboard, Clients and Proposals tabs show the main functionality.

Do not claim "nothing can be purchased" without re-checking it is still true —
that exact mismatch cost The Forge a 2.1(b) rejection.

---

## 6. Build and upload

```sh
# From frontend/ — VITE_API_URL must point at production
VITE_API_URL=https://capstonesoftware.co.uk/engage npm run build:capacitor
npx cap sync ios
npm run cap:open:ios          # or archive from the command line
```

In Xcode: select **Any iOS Device**, set the team and signing, then
Product → Archive → Distribute App → App Store Connect.

Sanity checks before uploading:

- The bundled `.app` contains `PrivacyInfo.xcprivacy`.
- `capacitor.config.json` inside the bundle has the production `VITE_API_URL`
  baked into the JS (`grep -r capstonesoftware.co.uk App.app/public/assets`).
- The build number is higher than anything already on App Store Connect.

Screenshots required: iPhone 6.9" and, because iPad is enabled, 13" iPad.

**On keeping iPad:** the app was launched on an iPad Pro 13" simulator and the
layout renders correctly — centred card, full footer, sensible use of the
space. This is a responsive web app that already serves desktop widths daily,
so an iPad is a form factor it is built for rather than an unknown. The signed-
in dashboard has not been eyeballed at iPad size specifically. If you would
rather not carry that risk or produce iPad screenshots for 1.0, set
`TARGETED_DEVICE_FAMILY = "1"` in `project.pbxproj` and ship iPhone-only; it is
a one-line change and iPad can return in 1.1.

---

## 7. What has been verified, and what has not

**Status: not submittable today.** The code is complete and the native path is
proven, but §1 has to happen first — the backend must be deployed and the
preflight re-checked, then login confirmed on real hardware. Submit after that,
not before.

Verified on the iOS Simulator (iPhone 17, iOS 18.7; plus iPad Pro 13" for layout):

- Builds clean; installs; launches; the SPA renders the branded Engage UI.
- Capacitor Preferences reads and writes; a persisted token pair survives
  relaunch and restores an authenticated session.
- With a token pair in the store, launch reaches the **dashboard** with live
  data (`200` on `/auth/me`, `/notifications`, `/clients`, `/analytics/dashboard`).
- Login, from inside the real WebView, returns tokens in the body with no
  cookies, and a bearer-authenticated `/auth/me` succeeds.
- A cold or unreachable API no longer signs the user out — transient failures
  retry with backoff instead of clearing the stored session.

Not yet verified, and needing a person:

- The same flows **on physical hardware** with a real signing profile.
- Typing credentials into the login form by hand (the network contract beneath
  it is proven; the form itself was not driven).
- Anything against the **deployed** API, which still needs the `X-Client` CORS
  change from §1.
- The signed-in dashboard at iPad size (the login screen was checked; see §6).

---

## 8. One pre-existing issue found on the way (not iOS-specific)

**A fresh database built by `prisma migrate deploy` is missing
`Proposal.subtotal`**, which the code still queries — `/api/proposals`,
`/api/proposals/approval-queue` and `/api/ai/attention-queue` all 500 on a
clean environment. Production is fine because it migrated forward in place, but
disaster recovery or any new environment would land on this.

(An earlier draft of this document also reported 25 typecheck errors on
`master`. That was a measurement error: `npm run typecheck` needs
`npm run build:shared` and `prisma generate` first, exactly as the CI lint job
does them. Run that way, typecheck and lint are clean.)
