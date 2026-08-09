import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../../lib/native', () => ({ isNativeApp: () => true }));

import { NativeSubscriptionSummary } from '../Subscription';

const TIERS = {
  PROFESSIONAL: {
    name: 'Professional',
    description: 'For growing practices',
    price: 99,
    maxUsers: 10,
    maxClients: 500,
    maxProposals: 'Unlimited',
    features: ['Unlimited proposals', 'E-signing', 'AML checks'],
    priceId: 'price_live_123',
  },
};

/**
 * These assertions encode App Store Review Guideline 3.1.1: inside the native
 * shell there must be no route to buy an Engage plan — not a card form, and not
 * a button or link pointing at one somewhere else. A failure here is a
 * submission blocker, not a cosmetic regression.
 */
describe('Subscription surface on iOS', () => {
  const active = renderToStaticMarkup(
    <NativeSubscriptionSummary
      subscription={{ hasSubscription: true, tier: 'PROFESSIONAL', status: 'active' }}
      tiers={TIERS}
    />
  );
  const none = renderToStaticMarkup(
    <NativeSubscriptionSummary subscription={{ hasSubscription: false }} tiers={TIERS} />
  );

  it('shows the plan the practice already holds', () => {
    expect(active).toContain('Professional');
    expect(active).toContain('active');
    expect(active).toContain('Unlimited proposals');
  });

  it('offers no purchase control of any kind', () => {
    for (const markup of [active, none]) {
      expect(markup).not.toContain('<button');
      expect(markup).not.toContain('<form');
      expect(markup).not.toContain('<a ');
      expect(markup).not.toContain('href');
    }
  });

  it('names no price — a price with no plan attached to it is a storefront', () => {
    for (const markup of [active, none]) {
      expect(markup).not.toContain('£');
      expect(markup).not.toContain('/month');
      expect(markup).not.toMatch(/\bprice_/);
    }
  });

  it('uses no purchase or link-out language', () => {
    // Visible copy only — raw markup carries the icon SVG's xmlns, which is not
    // a link the user can follow.
    const visibleText = (markup: string) => markup.replace(/<[^>]*>/g, ' ');
    const banned = [
      'Subscribe',
      'Buy',
      'Purchase',
      'Upgrade',
      'Checkout',
      'Start trial',
      'capstonesoftware.co.uk',
      'http',
    ];
    for (const markup of [active, none]) {
      const text = visibleText(markup);
      for (const phrase of banned) {
        expect(text).not.toContain(phrase);
      }
    }
  });

  it('states plainly who manages the plan, so the screen reads as account status', () => {
    expect(active).toContain('managed by your practice administrator');
    expect(none).toContain('arranged by your practice administrator');
  });
});
