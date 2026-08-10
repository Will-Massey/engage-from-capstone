# Engage on Google Play — submission pack

Everything needed to put the Engage Android shell on the Play Store, split
into what is already done, what only William can do, and the copy to paste.

Written 2026-08-10. The Android shell itself shipped in PR #113; the signed
release build shipped in this PR.

## Where this stands

| Piece            | State                                                                  |
| ---------------- | ---------------------------------------------------------------------- |
| Android platform | Committed at `frontend/android`, Capacitor 7                           |
| Debug APK        | Green, built by the `Android debug APK` workflow                       |
| Release signing  | Wired: `signingConfigs.release` reads gitignored `keystore.properties` |
| Signed AAB build | `Android release AAB` workflow, manual dispatch, needs four secrets    |
| Upload keystore  | **Not minted yet** (see below)                                         |
| Play Console app | **Not created yet** (William)                                          |
| Listing copy     | Ready, below                                                           |
| Screenshots      | **Not captured yet** (see the note at the end)                         |

## 1. The developer-account decision (William, first)

Graft already ships on Play, so a Capstone developer account exists. Reuse it
for Engage rather than opening a second one. Two reasons: it is a one-off $25
per account, and — the one that actually matters — a personal account created
after November 2023 must run a closed test with at least 12 testers opted in
for 14 continuous days before it can apply for production. An organisation
account is exempt and can go straight to production review.

If the account Graft used is the organisation account for Capstone Software
Ltd, nothing to do here. If Graft went out on a personal account, decide now
whether Engage is worth opening the org account for, because the 12-tester
rule would otherwise put roughly two weeks between here and a public listing.

## 2. Mint the upload keystore (needs a JDK)

The upload key is what proves a release came from us. Google's Play App
Signing holds the actual app signing key; this is the key we sign uploads
with. Generate it once, back it up, never commit it.

```bash
keytool -genkeypair -v \
  -keystore engage-upload.keystore \
  -alias engage-upload \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Capstone Software Ltd, O=Capstone Software Ltd, C=GB"
```

Then, in the repo's GitHub settings, add four secrets:

| Secret                      | Value                             |
| --------------------------- | --------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | the keystore file, base64 encoded |
| `ANDROID_KEYSTORE_PASSWORD` | store password chosen above       |
| `ANDROID_KEY_ALIAS`         | `engage-upload`                   |
| `ANDROID_KEY_PASSWORD`      | key password chosen above         |

Base64 on Windows:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("engage-upload.keystore")) | Set-Clipboard
```

**Back the keystore up before the first release.** If it is lost, no further
update can be published until Google resets the upload key, which is a support
request with a wait.

## 3. Build the AAB

Actions → **Android release AAB** → Run workflow, giving a `versionCode`
(integer, must exceed the last one Play accepted; start at 1) and a
`versionName` (`1.0.0`). The run fails immediately with a named list if any
secret is missing, verifies the bundle is signed and actually contains the web
assets, and uploads `engage-release-aab` as an artifact.

## 4. Store listing

**App name:** Engage by Capstone

**Short description** (80 char limit):

```
Win the client in five minutes. Proposals, e-signing and fees for accountants.
```

**Full description:**

```
Engage is proposal-to-cash software for UK accountancy practices. Look a company up, send a priced proposal, get the engagement letter signed, and collect the fee. One flow, from first hello to first payment.

WIN THE WORK
Type a company name and Engage pulls the record straight from Companies House. Athena drafts a priced, compliant proposal from your own service catalogue and pricing rules. You review it and you send it. Most take under five minutes.

GET IT SIGNED
The engagement letter travels with the proposal and is signed on whatever device the client is holding. Every signature carries a forensic audit trail: who signed, when, and against which version of the document.

COLLECT THE FEE
Recurring fees start collecting on Stripe the moment the letter is signed, so the work you win is the money you bank. Dispute protection submits the evidence for you if a charge is ever challenged.

ONBOARD PROPERLY
Clients upload their identification documents through the portal and they land in a practice-side review queue. Onboarding and AML record keeping stop being separate errands.

RUN THE PRACTICE
Jobs, phases and deadlines. A client portal for records and documents. Your connected mailbox alongside the work it relates to. Chase sequences that follow up unsigned proposals so nothing dies quietly in a prospect's inbox.

This app is a companion to the Engage web app. You will need an Engage account to sign in. Solo £29 a month, Practice £59 a month plus VAT, flat for the whole team, cancel any time.
```

**Category:** Business. **Tags:** finance, productivity.

**Contact:** support email plus `https://capstonesoftware.co.uk/engage`.
**Privacy policy:** the live Engage privacy URL (confirm it returns 200
before submitting, Play checks it).

## 5. App content declarations

- **App access:** all functionality requires an account. Play requires working
  demo credentials for review. Create a dedicated reviewer tenant with seeded
  demo data. Do NOT hand over Fortis or any tenant holding real client data.
- **Ads:** none.
- **Content rating:** questionnaire answers land at Everyone / PEGI 3. No
  user-generated public content, no gambling.
- **Target audience:** 18+. It is a business tool; this avoids child-policy
  overhead entirely.
- **Data safety:** declare collection of name, email, and financial info
  (client fees and proposal values), all encrypted in transit, all used for
  app functionality rather than advertising, with account deletion available.
  These must match the privacy policy exactly, since Play cross-checks them.
- **News app:** no. **COVID app:** no.

## 6. Screenshots — the remaining gap

Play requires at least two phone screenshots, 16:9 to 9:16, minimum 320px on
the short edge. They should show the real app, not marketing art.

They are not captured yet because it needs the app running against seeded
data: either the local stack (`.claude/skills/run-local`, then a phone-sized
viewport capture) or a signed-in session on a demo tenant. Worth capturing:
the proposal builder, a signed engagement letter, the jobs board, and the
client portal. Reuse Graft's approach in `docs/PLAY-STORE-SUBMISSION.md` in
the graft repo, which padded iOS captures to Play's ratio limits.

## 7. Order of operations

1. Confirm the developer account (org vs personal).
2. Mint the keystore, add the four secrets, back the keystore up.
3. Run the release workflow, download the AAB.
4. Create the app in Play Console, paste the listing above.
5. Capture and upload screenshots, the 512px icon and the 1024x500 feature
   graphic.
6. Complete the content declarations, including the reviewer demo account.
7. Upload the AAB to production (or internal testing first, which is free and
   instant, to check the shell behaves on a real device).
8. Submit. Review typically takes a few days.
