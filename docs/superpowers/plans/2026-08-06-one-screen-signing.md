# One-Screen Proposal Signing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 5-step public signing wizard (review → terms → engagement → identity → sign) with a single Sign card: collapsible documents, prefilled identity, one combined consent checkbox, and Draw/Type signature tabs.

**Architecture:** Frontend-only. `publicSigning.ts` narrows the step machine to `sign → payment → confirmation` and gains a combined-consent payload mapping. `ProposalView.tsx` swaps the four wizard blocks for one Sign card. A new pure renderer (`typedSignature.ts`) + thin component (`TypedSignatureInput.tsx`) produce a typed-signature PNG data-URL with the same `onSave` contract as `SignaturePad`. Backend contract untouched (`agreementAccepted`/`engagementLetterAccepted`/`authorisedToSign` all derived from the single tick).

**Tech Stack:** React 18 + TypeScript, Vite, vitest (happy-dom — canvas 2D context unavailable, so canvas logic is injected/fakeable), Playwright E2E, `@fontsource/dancing-script` for the bundled cursive font (no CDN).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-19-one-screen-signing-and-aml-viewer-design.md` (Feature 1 only; Feature 2 shipped as PR #86).
- No backend, schema, or PDF changes. `documentHash` logic untouched.
- Signature method (`drawn`/`typed`) recorded inside the existing `deviceInfo` JSON blob — no schema change.
- Consent sentence is stored as `consentText` and must name every accepted document.
- Cursive font must be bundled (deterministic, offline) — never a CDN link.
- Existing `data-testid`s kept where the element survives (`signer-name-input`, `signer-email-input`, `signer-role-input`, `confirm-signature-button`); `authorised-checkbox` → `consent-checkbox` (deliberate rename).
- Branch: `feat/one-screen-signing`. Frontend suite + `tsc` must be green before PR; E2E runs in CI.
- Repo tests: `cd frontend && npx vitest run` (or `npm test`); type check `npx tsc --noEmit -p frontend`.

---

### Task 1: publicSigning.ts — combined consent + single-step machine (TDD)

**Files:**

- Modify: `frontend/src/pages/public/publicSigning.ts`
- Test: `frontend/src/pages/public/__tests__/publicSigning.test.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces (used by Task 4):
  - `type SigningStep = 'sign' | 'payment' | 'confirmation'`
  - `buildCombinedConsentText(clientName: string | undefined, hasEngagementLetter: boolean): string`
  - `interface SignatureFormInput { signatureData: string; signerName: string; signerRole: string; signerEmail: string; consentAccepted: boolean }`
  - `collectSignatureValidationErrors(form: SignatureFormInput): string[]`
  - `interface PublicSignPayloadInput extends SignatureFormInput { hasEngagementLetter: boolean; clientName?: string; deviceInfo: string; selectedTierId?: string }`
  - `buildPublicSignPayload(input: PublicSignPayloadInput)` — returns `agreementAccepted`, `engagementLetterAccepted` (undefined when no letter), `authorisedToSign` all derived from `consentAccepted`; `consentText` from `buildCombinedConsentText`.
  - `DeviceInfoSnapshot` gains `signatureMethod?: 'drawn' | 'typed'`; `buildSignatureDeviceInfo` emits it as `method` in the JSON.
  - REMOVED: `buildSigningSteps`, `getNextSigningStep`, `getPreviousSigningStep`, `buildSignatureConsentText`, `PublicSigningProposalInput` (all have no consumers after Task 4). `splitCoverLetterParagraphs`, `isProposalExpired`, `readBrowserDeviceInfo` stay unchanged.

- [ ] **Step 1: Rewrite the test file to the new contract (failing)**

Replace `frontend/src/pages/public/__tests__/publicSigning.test.ts` wholesale:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildCombinedConsentText,
  buildPublicSignPayload,
  buildSignatureDeviceInfo,
  collectSignatureValidationErrors,
  isProposalExpired,
  splitCoverLetterParagraphs,
} from '../publicSigning';

describe('public signing page helpers (one-screen flow)', () => {
  describe('buildCombinedConsentText', () => {
    it('names terms only when there is no engagement letter', () => {
      expect(buildCombinedConsentText('Acme Ltd', false)).toBe(
        'I have read and agree to the terms and conditions, and I confirm I am authorised to sign on behalf of Acme Ltd.'
      );
    });

    it('names both documents when an engagement letter exists', () => {
      expect(buildCombinedConsentText('Acme Ltd', true)).toBe(
        'I have read and agree to the terms and conditions and the engagement letter, and I confirm I am authorised to sign on behalf of Acme Ltd.'
      );
    });

    it('falls back to "the client" when no client name', () => {
      expect(buildCombinedConsentText(undefined, false)).toContain('on behalf of the client.');
      expect(buildCombinedConsentText('   ', true)).toContain('on behalf of the client.');
    });
  });

  describe('splitCoverLetterParagraphs', () => {
    it('splits on blank lines and trims empty paragraphs', () => {
      expect(splitCoverLetterParagraphs('Hello\n\nWorld', '  \n\nFooter ')).toEqual([
        'Hello',
        'World',
        'Footer',
      ]);
    });
  });

  describe('isProposalExpired', () => {
    it('returns true when validUntil is in the past', () => {
      expect(isProposalExpired('2020-01-01T00:00:00.000Z', new Date('2026-07-07'))).toBe(true);
      expect(isProposalExpired('2030-01-01T00:00:00.000Z', new Date('2026-07-07'))).toBe(false);
    });
  });

  describe('collectSignatureValidationErrors', () => {
    const valid = {
      signatureData: 'data:image/png;base64,abc',
      signerName: 'Jane Client',
      signerRole: 'Director',
      signerEmail: 'jane@acme.test',
      consentAccepted: true,
    };

    it('returns no errors for a complete form', () => {
      expect(collectSignatureValidationErrors(valid)).toEqual([]);
    });

    it('flags every missing field including the single consent tick', () => {
      const errors = collectSignatureValidationErrors({
        signatureData: '',
        signerName: ' ',
        signerRole: '',
        signerEmail: '',
        consentAccepted: false,
      });
      expect(errors.length).toBe(5);
      expect(errors).toContain(
        'Please confirm you have read the documents and are authorised to sign'
      );
    });
  });

  describe('buildSignatureDeviceInfo', () => {
    it('serialises the forensic snapshot including signature method', () => {
      const json = buildSignatureDeviceInfo({
        platform: 'MacIntel',
        screenWidth: 1440,
        screenHeight: 900,
        colorDepth: 24,
        timezone: 'Europe/London',
        language: 'en-GB',
        hardwareConcurrency: 8,
        touch: false,
        signatureMethod: 'typed',
      });
      const parsed = JSON.parse(json);
      expect(parsed.screen).toBe('1440x900');
      expect(parsed.method).toBe('typed');
    });

    it('defaults method to drawn when unspecified', () => {
      const json = buildSignatureDeviceInfo({
        platform: 'Win32',
        screenWidth: 1920,
        screenHeight: 1080,
        colorDepth: 24,
        timezone: 'Europe/London',
        language: 'en-GB',
        touch: true,
      });
      expect(JSON.parse(json).method).toBe('drawn');
    });
  });

  describe('buildPublicSignPayload', () => {
    const base = {
      signatureData: 'sig',
      signerName: 'Jane Client',
      signerRole: 'Director',
      signerEmail: 'jane@acme.test',
      consentAccepted: true,
      clientName: 'Acme Ltd',
      deviceInfo: '{"platform":"test"}',
    };

    it('derives all three accept flags from the single tick (with letter)', () => {
      const payload = buildPublicSignPayload({
        ...base,
        hasEngagementLetter: true,
        selectedTierId: 'silver',
      });
      expect(payload).toMatchObject({
        signedBy: 'Jane Client',
        signedByRole: 'Director',
        signerEmail: 'jane@acme.test',
        signatureData: 'sig',
        agreementAccepted: true,
        engagementLetterAccepted: true,
        authorisedToSign: true,
        selectedTierId: 'silver',
      });
      expect(payload.consentText).toBe(
        'I have read and agree to the terms and conditions and the engagement letter, and I confirm I am authorised to sign on behalf of Acme Ltd.'
      );
    });

    it('omits engagement acceptance and tier when absent', () => {
      const payload = buildPublicSignPayload({ ...base, hasEngagementLetter: false });
      expect(payload.engagementLetterAccepted).toBeUndefined();
      expect(payload.selectedTierId).toBeUndefined();
      expect(payload.consentText).toBe(
        'I have read and agree to the terms and conditions, and I confirm I am authorised to sign on behalf of Acme Ltd.'
      );
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/pages/public/__tests__/publicSigning.test.ts`
Expected: FAIL — `buildCombinedConsentText` not exported; `consentAccepted` type errors.

- [ ] **Step 3: Implement publicSigning.ts changes**

In `frontend/src/pages/public/publicSigning.ts`:

Replace the `SigningStep` type, delete `PublicSigningProposalInput`, `buildSigningSteps`, `getNextSigningStep`, `getPreviousSigningStep`, `buildSignatureConsentText`. Keep `splitCoverLetterParagraphs`, `isProposalExpired`, `readBrowserDeviceInfo` untouched. New/changed code:

```ts
/** Pure helpers for the public proposal signing flow (ProposalView). */

export type SigningStep = 'sign' | 'payment' | 'confirmation';

export interface SignatureFormInput {
  signatureData: string;
  signerName: string;
  signerRole: string;
  signerEmail: string;
  /** Single combined tick: documents read + authorised to sign. */
  consentAccepted: boolean;
}

export function collectSignatureValidationErrors(form: SignatureFormInput): string[] {
  const errors: string[] = [];
  if (!form.signatureData) errors.push('Please provide your signature');
  if (!form.signerName.trim()) errors.push('Please provide your name');
  if (!form.signerRole.trim()) errors.push('Please provide your role');
  if (!form.signerEmail.trim()) errors.push('Please provide your email');
  if (!form.consentAccepted) {
    errors.push('Please confirm you have read the documents and are authorised to sign');
  }
  return errors;
}

/**
 * The consent sentence shown next to the single checkbox AND stored on the
 * signature record as consentText — it must name every accepted document.
 */
export function buildCombinedConsentText(
  clientName: string | undefined,
  hasEngagementLetter: boolean
): string {
  const subject = clientName?.trim() || 'the client';
  const documents = hasEngagementLetter
    ? 'the terms and conditions and the engagement letter'
    : 'the terms and conditions';
  return `I have read and agree to ${documents}, and I confirm I am authorised to sign on behalf of ${subject}.`;
}

export interface DeviceInfoSnapshot {
  platform: string;
  screenWidth: number;
  screenHeight: number;
  colorDepth: number;
  timezone: string;
  language: string;
  hardwareConcurrency?: number | 'unknown';
  touch: boolean;
  /** How the signature image was produced. Defaults to 'drawn'. */
  signatureMethod?: 'drawn' | 'typed';
}

export function buildSignatureDeviceInfo(snapshot: DeviceInfoSnapshot): string {
  return JSON.stringify({
    platform: snapshot.platform,
    screen: `${snapshot.screenWidth}x${snapshot.screenHeight}`,
    colorDepth: snapshot.colorDepth,
    timezone: snapshot.timezone,
    language: snapshot.language,
    cores: snapshot.hardwareConcurrency ?? 'unknown',
    touch: snapshot.touch,
    method: snapshot.signatureMethod ?? 'drawn',
  });
}

export interface PublicSignPayloadInput extends SignatureFormInput {
  hasEngagementLetter: boolean;
  clientName?: string;
  deviceInfo: string;
  selectedTierId?: string;
}

export function buildPublicSignPayload(input: PublicSignPayloadInput) {
  return {
    signedBy: input.signerName.trim(),
    signedByRole: input.signerRole.trim(),
    signerEmail: input.signerEmail.trim(),
    signatureData: input.signatureData,
    agreementAccepted: input.consentAccepted,
    engagementLetterAccepted: input.hasEngagementLetter ? input.consentAccepted : undefined,
    authorisedToSign: input.consentAccepted,
    deviceInfo: input.deviceInfo,
    consentText: buildCombinedConsentText(input.clientName, input.hasEngagementLetter),
    ...(input.selectedTierId ? { selectedTierId: input.selectedTierId } : {}),
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd frontend && npx vitest run src/pages/public/__tests__/publicSigning.test.ts`
Expected: PASS (all suites). `ProposalView.tsx` will now fail `tsc` — that's expected until Task 4; do NOT run tsc as this task's gate.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/public/publicSigning.ts frontend/src/pages/public/__tests__/publicSigning.test.ts
git commit -m "feat(signing): combined-consent helpers + single-step machine for one-screen signing"
```

---

### Task 2: typedSignature.ts — pure canvas renderer (TDD)

**Files:**

- Create: `frontend/src/components/signature/typedSignature.ts`
- Test: `frontend/src/components/signature/__tests__/typedSignature.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces (used by Task 3):
  - `TYPED_SIGNATURE_FONT = '"Dancing Script", cursive'` and `TYPED_SIGNATURE_FONT_LOAD = '48px "Dancing Script"'`
  - `interface TypedSignatureCanvas { width: number; height: number; getContext(id: '2d'): TypedSignatureContext | null; toDataURL(type: string): string }`
  - `interface TypedSignatureContext { clearRect(...): void; fillText(...): void; set font/fillStyle/textAlign/textBaseline }` (structural subset of CanvasRenderingContext2D — a real canvas satisfies it)
  - `renderTypedSignature(canvas: TypedSignatureCanvas, name: string): string` — clears, draws the trimmed name centred in the cursive font, returns `canvas.toDataURL('image/png')`; returns `''` for blank names without drawing.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/signature/__tests__/typedSignature.test.ts`. happy-dom has no 2D context, so the test drives a hand-rolled fake that records calls and returns a stub data-URL — this also proves the function works against the structural interface, not a concrete canvas:

```ts
import { describe, expect, it } from 'vitest';
import { renderTypedSignature } from '../typedSignature';
import { collectSignatureValidationErrors } from '../../../pages/public/publicSigning';

function makeFakeCanvas() {
  const calls: string[] = [];
  const ctx = {
    font: '',
    fillStyle: '',
    textAlign: '',
    textBaseline: '',
    clearRect: (..._args: number[]) => calls.push('clearRect'),
    fillText: (text: string, _x: number, _y: number) => calls.push(`fillText:${text}`),
  };
  const canvas = {
    width: 600,
    height: 200,
    getContext: (_id: '2d') => ctx,
    toDataURL: (_type: string) => 'data:image/png;base64,typedsig',
  };
  return { canvas, ctx, calls };
}

describe('renderTypedSignature', () => {
  it('draws the trimmed name in the cursive font and returns a PNG data-URL', () => {
    const { canvas, ctx, calls } = makeFakeCanvas();
    const dataUrl = renderTypedSignature(canvas, '  Jane Client  ');
    expect(dataUrl).toBe('data:image/png;base64,typedsig');
    expect(calls).toEqual(['clearRect', 'fillText:Jane Client']);
    expect(ctx.font).toContain('Dancing Script');
    expect(ctx.textAlign).toBe('center');
  });

  it('returns empty string for blank input without drawing text', () => {
    const { canvas, calls } = makeFakeCanvas();
    expect(renderTypedSignature(canvas, '   ')).toBe('');
    expect(calls).toEqual(['clearRect']);
  });

  it('round-trips through signature validation', () => {
    const { canvas } = makeFakeCanvas();
    const dataUrl = renderTypedSignature(canvas, 'Jane Client');
    const errors = collectSignatureValidationErrors({
      signatureData: dataUrl,
      signerName: 'Jane Client',
      signerRole: 'Director',
      signerEmail: 'jane@acme.test',
      consentAccepted: true,
    });
    expect(errors).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/components/signature/__tests__/typedSignature.test.ts`
Expected: FAIL — module `../typedSignature` not found.

- [ ] **Step 3: Implement typedSignature.ts**

Create `frontend/src/components/signature/typedSignature.ts`:

```ts
/**
 * Pure typed-signature rendering — takes any canvas satisfying the structural
 * interface so unit tests can inject a fake (happy-dom has no 2D context).
 */

export const TYPED_SIGNATURE_FONT = '"Dancing Script", cursive';
/** FontFaceSet.load() spec string for preloading before first render. */
export const TYPED_SIGNATURE_FONT_LOAD = '48px "Dancing Script"';

export interface TypedSignatureContext {
  font: string;
  fillStyle: string;
  textAlign: string;
  textBaseline: string;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
}

export interface TypedSignatureCanvas {
  width: number;
  height: number;
  getContext(contextId: '2d'): TypedSignatureContext | null;
  toDataURL(type: string): string;
}

/**
 * Draw `name` centred on the canvas in the bundled cursive font and return a
 * PNG data-URL (same contract as SignaturePad's onSave payload). Blank names
 * clear the canvas and return '' so callers can treat it as "no signature".
 */
export function renderTypedSignature(canvas: TypedSignatureCanvas, name: string): string {
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const trimmed = name.trim();
  if (!trimmed) return '';

  // Scale the font down for long names so the signature always fits.
  const size = Math.min(
    64,
    Math.max(28, Math.floor((canvas.width * 1.6) / Math.max(trimmed.length, 1)))
  );
  ctx.font = `${size}px ${TYPED_SIGNATURE_FONT}`;
  ctx.fillStyle = '#1e293b';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(trimmed, canvas.width / 2, canvas.height / 2);
  return canvas.toDataURL('image/png');
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd frontend && npx vitest run src/components/signature/__tests__/typedSignature.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/signature/typedSignature.ts frontend/src/components/signature/__tests__/typedSignature.test.ts
git commit -m "feat(signing): pure typed-signature canvas renderer"
```

---

### Task 3: TypedSignatureInput component + bundled cursive font

**Files:**

- Modify: `frontend/package.json` (add `@fontsource/dancing-script`)
- Create: `frontend/src/components/signature/TypedSignatureInput.tsx`

**Interfaces:**

- Consumes: `renderTypedSignature`, `TYPED_SIGNATURE_FONT_LOAD` from Task 2.
- Produces (used by Task 4): `<TypedSignatureInput onSave={(dataUrl: string) => void} onClear={() => void} height?: number />` — same contract as `SignaturePad`: fires `onSave(dataUrl)` whenever a non-blank name renders, `onClear()` when the field empties.

- [ ] **Step 1: Install the font**

Run: `cd frontend && npm install @fontsource/dancing-script`
Expected: dependency added to `frontend/package.json`; woff2 files under `node_modules/@fontsource/dancing-script` (Vite bundles them — no CDN).

- [ ] **Step 2: Implement the component**

Create `frontend/src/components/signature/TypedSignatureInput.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import '@fontsource/dancing-script/400.css';
import { renderTypedSignature, TYPED_SIGNATURE_FONT_LOAD } from './typedSignature';

interface TypedSignatureInputProps {
  onSave: (signatureData: string) => void;
  onClear?: () => void;
  height?: number;
}

/**
 * Type-to-sign input: the signer types their name and it renders live onto a
 * canvas in the bundled cursive font, producing the same PNG data-URL contract
 * as SignaturePad.
 */
const TypedSignatureInput = ({ onSave, onClear, height = 160 }: TypedSignatureInputProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [typedName, setTypedName] = useState('');
  const [fontReady, setFontReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Preload the cursive face so the first render is already styled.
    // document.fonts is undefined in some test environments — treat as ready.
    const fonts = (document as { fonts?: FontFaceSet }).fonts;
    if (!fonts) {
      setFontReady(true);
      return;
    }
    fonts
      .load(TYPED_SIGNATURE_FONT_LOAD)
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) setFontReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !fontReady) return;
    const dataUrl = renderTypedSignature(canvas, typedName);
    if (dataUrl) {
      onSave(dataUrl);
    } else {
      onClear?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- render on name/font change only
  }, [typedName, fontReady]);

  return (
    <div className="space-y-3">
      <input
        data-testid="typed-signature-input"
        type="text"
        value={typedName}
        onChange={(e) => setTypedName(e.target.value)}
        placeholder="Type your full name"
        autoComplete="name"
        className="input-field w-full"
      />
      <div className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 overflow-hidden">
        <canvas
          data-testid="typed-signature-canvas"
          ref={canvasRef}
          width={600}
          height={height}
          className="w-full"
          style={{ height }}
          aria-label="Typed signature preview"
        />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Typing your name creates a legally valid electronic signature.
      </p>
    </div>
  );
};

export default TypedSignatureInput;
```

- [ ] **Step 3: Type check + suite still green**

Run: `cd frontend && npx tsc --noEmit` — expected: only pre-existing Task 4 errors in `ProposalView.tsx` (from Task 1's type narrowing); no errors in the new component. Then `npx vitest run` — expected: all frontend tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/components/signature/TypedSignatureInput.tsx
git commit -m "feat(signing): type-to-sign input with bundled cursive font"
```

---

### Task 4: ProposalView.tsx — the Sign card

**Files:**

- Modify: `frontend/src/pages/public/ProposalView.tsx`

**Interfaces:**

- Consumes: everything Tasks 1–3 produce.
- Produces (relied on by Task 5 E2E): `data-testid`s — `signing-flow`, `sign-doc-terms-toggle`, `sign-doc-engagement-toggle`, `signer-name-input`, `signer-role-input`, `signer-email-input`, `consent-checkbox`, `signature-tab-draw`, `signature-tab-type`, `typed-signature-input`, `confirm-signature-button`, `decline-proposal-button`. The Draw tab keeps SignaturePad's internal `signature-canvas` testid.

- [ ] **Step 1: State + handler changes**

In `frontend/src/pages/public/ProposalView.tsx`:

1. Imports: drop `buildSigningSteps`; add `buildCombinedConsentText` and `TypedSignatureInput`:

```ts
import {
  buildCombinedConsentText,
  buildPublicSignPayload,
  buildSignatureDeviceInfo,
  collectSignatureValidationErrors,
  readBrowserDeviceInfo,
  type SigningStep,
} from './publicSigning';
import TypedSignatureInput from '../../components/signature/TypedSignatureInput';
```

2. State: replace `engagementLetterAccepted`/`authorisedToSign` with one `consentAccepted`; add signature method:

```ts
const [consentAccepted, setConsentAccepted] = useState(false);
const [signatureTab, setSignatureTab] = useState<'draw' | 'typed'>('draw');
const [termsOpen, setTermsOpen] = useState(false);
const [engagementOpen, setEngagementOpen] = useState(false);
```

(`termsAccepted` stays — it still powers the browse-mode terms checkbox + summary card.)

3. Prefill signer name as well as email in the proposal-load effect (right after the existing `contactEmail` prefill):

```ts
if (response.data.client?.contactEmail) {
  setSignerEmail(response.data.client.contactEmail);
}
if (response.data.client?.contactName?.trim()) {
  setSignerName(response.data.client.contactName.trim());
}
```

4. Delete `signingSteps`, `goToNextStep`, `goToPrevStep`, `currentStepIndex`, and the whole `StepIndicator` component. `startSigningFlow` sets the single step:

```ts
const startSigningFlow = () => {
  setShowDecline(false);
  setSigningStep('sign');
};
```

5. The additional-signatory button (`data-testid="additional-signatory-button"`) changes `setSigningStep('identity')` → `setSigningStep('sign')`.

6. The signing-summary loader effect condition `signingStep && signingStep !== 'review'` becomes just `signingStep` (the guard list no longer contains 'review'; keep the rest of the condition unchanged).

7. Switching signature tabs clears any captured signature (a drawn signature must not survive into the Type tab and vice versa):

```ts
const switchSignatureTab = (tab: 'draw' | 'typed') => {
  setSignatureTab(tab);
  setSignatureData('');
};
```

8. `handleSubmitSignature`: validation + payload use the new shapes:

```ts
const validationErrors = collectSignatureValidationErrors({
  signatureData,
  signerName,
  signerRole,
  signerEmail,
  consentAccepted,
});
```

and in the POST body:

```ts
buildPublicSignPayload({
  signatureData,
  signerName,
  signerRole,
  signerEmail,
  consentAccepted,
  hasEngagementLetter,
  clientName: proposal?.client?.name,
  deviceInfo: buildSignatureDeviceInfo({
    ...readBrowserDeviceInfo(),
    signatureMethod: signatureTab === 'typed' ? 'typed' : 'drawn',
  }),
  selectedTierId: tierToSubmit,
});
```

- [ ] **Step 2: Replace the four wizard blocks with the Sign card**

Delete the `signingStep === 'review'`, `'terms'`, `'engagement'`, `'identity'`, and `'sign'` JSX blocks (and the `<StepIndicator />` line) inside the `inSigningFlow` container. In their place, one Sign card (`payment` block and the trailing decline button stay exactly as they are):

```tsx
{
  signingStep === 'sign' && (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          Sign &amp; accept this proposal
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Total engagement value:{' '}
          <strong className="text-slate-900 dark:text-white">
            {formatCurrency(displayTotals.total)}
          </strong>{' '}
          · {proposal.services.length} service{proposal.services.length !== 1 ? 's' : ''}
        </p>
      </div>

      {signingSummary && (
        <p className="text-sm text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-3">
          {signingSummary}
        </p>
      )}

      {/* Documents — collapsed by default, full text in-page */}
      <div className="space-y-2">
        <div className="rounded-xl border border-slate-200 dark:border-slate-600 overflow-hidden">
          <button
            type="button"
            data-testid="sign-doc-terms-toggle"
            onClick={() => setTermsOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-slate-900 dark:text-white min-h-[44px] hover:bg-slate-50 dark:hover:bg-slate-800/50"
          >
            <span>Terms &amp; conditions</span>
            {termsOpen ? (
              <ChevronUpIcon className="h-4 w-4 shrink-0 text-slate-400" />
            ) : (
              <ChevronDownIcon className="h-4 w-4 shrink-0 text-slate-400" />
            )}
          </button>
          {termsOpen && (
            <div className="px-4 pb-3 max-h-56 overflow-y-auto">
              <pre className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-sans">
                {proposal.terms || 'Standard terms and conditions apply.'}
              </pre>
            </div>
          )}
        </div>

        {Boolean(proposal.engagementLetter?.trim()) && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-600 overflow-hidden">
            <button
              type="button"
              data-testid="sign-doc-engagement-toggle"
              onClick={() => setEngagementOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-slate-900 dark:text-white min-h-[44px] hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <span>Engagement letter</span>
              {engagementOpen ? (
                <ChevronUpIcon className="h-4 w-4 shrink-0 text-slate-400" />
              ) : (
                <ChevronDownIcon className="h-4 w-4 shrink-0 text-slate-400" />
              )}
            </button>
            {engagementOpen && (
              <div className="px-4 pb-3 max-h-64 overflow-y-auto">
                <pre className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-sans">
                  {proposal.engagementLetter}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Identity — prefilled from the proposal's client contact */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
            Full name
          </label>
          <input
            data-testid="signer-name-input"
            type="text"
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            placeholder="John Smith"
            className="mt-1 input-field w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
            Role / title
          </label>
          <input
            data-testid="signer-role-input"
            type="text"
            value={signerRole}
            onChange={(e) => setSignerRole(e.target.value)}
            placeholder="Director"
            className="mt-1 input-field w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
            Email address
          </label>
          <input
            data-testid="signer-email-input"
            type="email"
            value={signerEmail}
            onChange={(e) => setSignerEmail(e.target.value)}
            placeholder="director@company.co.uk"
            className="mt-1 input-field w-full"
          />
        </div>
      </div>

      {/* One combined consent tick — the rendered sentence IS the stored consentText */}
      <label className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-200">
        <input
          data-testid="consent-checkbox"
          type="checkbox"
          checked={consentAccepted}
          onChange={(e) => setConsentAccepted(e.target.checked)}
          className="mt-1 h-4 w-4 rounded"
        />
        <span>
          {buildCombinedConsentText(
            proposal.client.name,
            Boolean(proposal.engagementLetter?.trim())
          )}
        </span>
      </label>

      {/* Signature — Draw / Type tabs */}
      <div>
        <div className="flex gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1 w-fit mb-3">
          <button
            type="button"
            data-testid="signature-tab-draw"
            onClick={() => switchSignatureTab('draw')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              signatureTab === 'draw'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Draw
          </button>
          <button
            type="button"
            data-testid="signature-tab-type"
            onClick={() => switchSignatureTab('typed')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              signatureTab === 'typed'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Type
          </button>
        </div>
        {signatureTab === 'draw' ? (
          <SignaturePad
            onSave={handleSignatureSave}
            onClear={() => setSignatureData('')}
            fullWidth
            height={220}
            hideConfirm
          />
        ) : (
          <TypedSignatureInput
            onSave={handleSignatureSave}
            onClear={() => setSignatureData('')}
            height={160}
          />
        )}
      </div>

      <button
        data-testid="confirm-signature-button"
        type="button"
        className="btn-primary w-full py-3"
        disabled={isSubmitting || !signatureData || !consentAccepted}
        onClick={handleSubmitSignature}
      >
        {isSubmitting ? 'Submitting…' : 'Sign & accept'}
      </button>
    </div>
  );
}
```

Note the confirm button is now always rendered (disabled until signature + consent) — mobile users see the goal state up front; validation toasts still catch identity gaps.

- [ ] **Step 3: Type check + full frontend suite**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: tsc clean (the Task 1 narrowing errors are resolved by this rewrite); all vitest suites pass.

- [ ] **Step 4: Visual smoke in the running app**

Run the dev stack (see `.claude/skills/run-local`) and open a seeded proposal's public link: verify single card, collapsed documents, prefilled name/email, consent sentence names the right documents, Draw and Type tabs both enable "Sign & accept", full sign → confirmation journey works, decline link still present. Check dark mode + 375px width.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/public/ProposalView.tsx
git commit -m "feat(signing): one-screen Sign card replaces the five-step wizard"
```

---

### Task 5: E2E specs — walk the one-screen flow

**Files:**

- Modify: `e2e-tests/specs/mobile-signing.spec.ts:90-108`
- Modify: `e2e-tests/specs/money-path.spec.ts:82-96`
- Modify: `e2e-tests/specs/proposal-share.spec.ts:154-169`

**Interfaces:**

- Consumes: Task 4's testids (`consent-checkbox`, kept `signer-*-input`, `confirm-signature-button`, SignaturePad's `signature-canvas`).

- [ ] **Step 1: Update the wizard walk in all three specs**

In each spec, the old sequence (click "Continue to terms" → check `terms-checkbox` → "Continue" → optional engagement "Continue" → fill signer fields → check `authorised-checkbox` → click "Continue to sign") collapses to: fill signer fields → check `consent-checkbox`. The accept-button click before it and the canvas drawing + `confirm-signature-button` click after it stay.

`money-path.spec.ts` lines 82–96 become:

```ts
await publicPage.fill('[data-testid="signer-name-input"]', 'Jane Money');
await publicPage.fill('[data-testid="signer-role-input"]', 'Director');
await publicPage.fill('[data-testid="signer-email-input"]', client.email);
await publicPage.check('[data-testid="consent-checkbox"]');
```

`proposal-share.spec.ts` lines 154–169 become:

```ts
await publicPage.fill('[data-testid="signer-name-input"]', 'John Smith');
await publicPage.fill('[data-testid="signer-role-input"]', 'Director');
await publicPage.fill('[data-testid="signer-email-input"]', 'signature-test@example.com');
await publicPage.check('[data-testid="consent-checkbox"]');
```

`mobile-signing.spec.ts` lines 90–108 become (keeping its canvas-metrics assertions that follow):

```ts
await publicPage.fill('[data-testid="signer-name-input"]', 'Mo Bile');
await publicPage.fill('[data-testid="signer-role-input"]', 'Director');
await publicPage.fill(
  '[data-testid="signer-email-input"]',
  client.email // keep whatever expression the spec currently passes here
);
await publicPage.check('[data-testid="consent-checkbox"]');
```

Also delete any now-unreachable `button:has-text("Continue")` waits in the removed ranges. In `mobile-signing.spec.ts`, the confirm button is now rendered before drawing — if the spec asserted the button _appears_ after drawing, change it to assert the button becomes **enabled** after drawing:

```ts
const confirmButton = publicPage.getByTestId('confirm-signature-button');
await expect(confirmButton).toBeEnabled();
```

- [ ] **Step 2: Run the E2E suite locally (or lean on CI)**

Run: `cd e2e-tests && npx playwright test specs/proposal-share.spec.ts specs/money-path.spec.ts specs/mobile-signing.spec.ts`
Expected: PASS. If the local stack isn't running, push the branch and let the CI E2E job be the gate — do not merge on red.

- [ ] **Step 3: Commit**

```bash
git add e2e-tests/specs/mobile-signing.spec.ts e2e-tests/specs/money-path.spec.ts e2e-tests/specs/proposal-share.spec.ts
git commit -m "test(e2e): walk the one-screen signing flow"
```

---

### Task 6: PR

- [ ] **Step 1: Push branch + open PR**

```bash
git push -u origin feat/one-screen-signing
gh pr create --title "One-screen proposal signing" --body "Implements Feature 1 of docs/superpowers/specs/2026-07-19-one-screen-signing-and-aml-viewer-design.md: single Sign card (collapsible documents, prefilled identity, one combined consent tick whose rendered sentence is stored as consentText, Draw/Type signature tabs with a bundled cursive font). Frontend-only; backend contract, schema, PDF and documentHash untouched. Signature method recorded in deviceInfo. E2E specs updated to the new walk.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 2: CI green, then hold for William's merge call**

Expected: Test Suite, Lint & Type Check, E2E all green. Post-deploy: manual smoke on a real proposal (spec requirement) before telling Caroline.

---

## Self-review notes

- Spec coverage: documents-in-page ✔ (Task 4 collapsibles), prefilled identity ✔ (Task 4 step 1.3), dynamic consent sentence stored as consentText ✔ (Tasks 1+4), Draw/Type tabs with bundled font + deviceInfo method ✔ (Tasks 2–4), payment/confirmation untouched ✔, publicSigning contract per spec ✔ (Task 1), unit tests per spec ✔ (Tasks 1–2), E2E rename `authorised-checkbox`→`consent-checkbox` ✔ (Task 5), manual smoke ✔ (Task 6).
- Deliberate deviations: none from the spec. `buildSigningSteps` returns nothing — it's removed outright instead, since with one pre-payment step the list carries no information and its only consumers were the wizard and its tests.
- Pre-existing dead code noticed, NOT touched (surgical-changes rule): `splitCoverLetterParagraphs` (no non-test consumers), `isMobileSign` state in ProposalView.
