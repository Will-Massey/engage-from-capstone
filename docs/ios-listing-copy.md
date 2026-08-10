# Capstone Engage — App Store listing copy

Paste-ready values for App Store Connect. Character counts are checked against
Apple's limits in `scripts/check-listing-copy.mjs`; run it after any edit.

## Identity

| Field              | Value                                                      |
| ------------------ | ---------------------------------------------------------- |
| App name           | `Capstone Engage`                                          |
| Subtitle           | `Proposals, letters and fees`                              |
| Bundle ID          | `uk.co.capstonesoftware.engage` (registered, `88KCA872XA`) |
| SKU                | `capstone-engage-001`                                      |
| Primary category   | Business                                                   |
| Secondary category | Productivity                                               |
| Age rating         | 4+                                                         |
| Primary language   | English (U.K.)                                             |
| Copyright          | `2026 Capstone Software Ltd`                               |

## URLs

| Field          | Value                                                 |
| -------------- | ----------------------------------------------------- |
| Privacy Policy | `https://capstonesoftware.co.uk/engage/legal/privacy` |
| Support URL    | `https://capstonesoftware.co.uk/engage`               |
| Marketing URL  | `https://capstonesoftware.co.uk/engage`               |

The privacy URL is a public route and renders without signing in. Apple checks
this, and a login wall on it is a common rejection.

## Keywords

```
accountant,accounting,practice,proposal,engagement,letter,quote,fees,client,esign,pricing
```

Deliberately no "HMRC" and no "GOV.UK". Footnote was rejected under 4.1(a) in
July for exactly that, because tax-authority names in metadata read as implying
an official connection. The same caution applies to any wording that suggests
this is a government service.

## Promotional text

Editable without a new build, so use it for whatever is current.

```
Turn a client conversation into a priced proposal and a signed engagement letter
before the meeting is over.
```

## Description

```
Capstone Engage is the proposal and engagement system for UK accountancy
practices. It was built by a practising accountant, so it follows the way a
practice actually wins and starts work.

WIN THE WORK
Build a priced proposal from your own service catalogue and fee rules, so
quoting is consistent whoever does it. Pull company details from Companies House
instead of retyping them. Send a proposal your client can read and accept on a
phone.

MAKE IT OFFICIAL
Engagement letters are generated from the services on the proposal, so the
letter always matches what was sold. Clients sign electronically, and the signed
copy is stored against the client record with an audit trail.

PRICE WITH CONFIDENCE
Set fees by service, by complexity, or by your own rules. Compare a quote
against benchmarks before it goes out, and see the annual and monthly value of
what you are proposing.

KEEP THE PRACTICE MOVING
Client records, jobs, and the work in front of you today, in one place. See what
is unsigned, what is waiting on a client, and what is due to renew.

GET PAID
Collect fees by card or Direct Debit, including recurring monthly fees, and see
what has been collected against what was agreed.

BUILT FOR UK PRACTICES
VAT handling, UK company types, Companies House lookup, and engagement wording
aimed at UK compliance work.

An Engage subscription is arranged by your practice on our website. This app is
for people whose practice already has an account.
```

## Review notes

Fill in the demo account before submitting. Sign in as that exact user on a real
device first: bad reviewer credentials rejected Graft, and a reviewer account
that hit a permissions error rejected The Forge.

```
Capstone Engage is a business tool for UK accountancy practices. Accounts are
created by a practice administrator on our website as part of a paid practice
subscription. There is no consumer signup, and nothing can be purchased inside
the app. The Subscription screen shows the practice's existing plan for
reference only.

Demo account
Email: <email>
Password: <password>

The account is pre-loaded with sample clients, services and proposals. After
signing in, the Dashboard, Clients and Proposals tabs show the main
functionality.

The app is a companion to the web service at
https://capstonesoftware.co.uk/engage and talks to the same API.
```

Do not claim nothing can be purchased without re-checking it is still true. A
live purchase surface contradicting that sentence is what cost The Forge a
2.1(b) rejection.

## Screenshots

Generated at native resolution from the simulator against a seeded demo
practice, so they show real records rather than empty states.

| Set         | Size        | Files                                              |
| ----------- | ----------- | -------------------------------------------------- |
| iPhone 6.9" | 1320 x 2868 | dashboard, proposals, clients, services, analytics |
| iPad 13"    | 2064 x 2752 | dashboard, proposals, clients, services, analytics |

Regenerate with a temporary route-walking harness in `index.html`; the simulator
cannot be driven from the host. Strip the harness and confirm it is absent from
`ios/App/App/public/index.html` before any store build.
