import { externalReferrer, nextFirstTouchRecord } from '../signupAttribution';

describe('nextFirstTouchRecord', () => {
  const origin = 'https://capstonesoftware.co.uk';

  it('keeps the first visit and ignores a later one', () => {
    const first = nextFirstTouchRecord(
      null,
      '?utm_source=linkedin&utm_medium=social&utm_campaign=spring',
      'https://www.linkedin.com/feed',
      origin
    );
    expect(first).toEqual({
      utmSource: 'linkedin',
      utmMedium: 'social',
      utmCampaign: 'spring',
      referrer: 'https://www.linkedin.com/feed',
    });

    const stored = JSON.stringify(first);
    expect(
      nextFirstTouchRecord(stored, '?utm_source=google', 'https://www.google.com/', origin)
    ).toBeNull();
  });

  it('ignores a same-site referrer and an empty landing URL', () => {
    expect(
      nextFirstTouchRecord(null, '', 'https://capstonesoftware.co.uk/engage', origin)
    ).toBeNull();
    expect(externalReferrer('https://capstonesoftware.co.uk/engage/login', origin)).toBeUndefined();
  });

  it('stores an external referrer when there are no campaign params', () => {
    expect(nextFirstTouchRecord(null, '', 'https://www.xero.com/uk/apps/', origin)).toEqual({
      referrer: 'https://www.xero.com/uk/apps/',
    });
  });

  it('keeps utm_source=chatgpt.com from the landing URL, including the engage proxy', () => {
    expect(
      nextFirstTouchRecord(
        null,
        '?utm_source=chatgpt.com',
        'https://capstonesoftware.co.uk/engage/',
        origin
      )
    ).toEqual({ utmSource: 'chatgpt.com' });

    const stored = JSON.stringify({ utmSource: 'chatgpt.com' });
    expect(
      nextFirstTouchRecord(stored, '?utm_source=google', 'https://www.google.com/', origin)
    ).toBeNull();
  });

  it('copies utm_source=chatgpt.com from a capstonesoftware.co.uk referrer when the page has none', () => {
    expect(
      nextFirstTouchRecord(
        null,
        '',
        'https://capstonesoftware.co.uk/?utm_source=chatgpt.com&utm_medium=referral',
        origin
      )
    ).toEqual({ utmSource: 'chatgpt.com', utmMedium: 'referral' });

    expect(
      nextFirstTouchRecord(
        null,
        '',
        'https://www.capstonesoftware.co.uk/engage/?utm_source=chatgpt.com',
        origin
      )
    ).toEqual({ utmSource: 'chatgpt.com' });
  });

  it('lets the landing URL win when both it and the referrer carry a campaign', () => {
    expect(
      nextFirstTouchRecord(
        null,
        '?utm_source=chatgpt.com&utm_campaign=spring',
        'https://capstonesoftware.co.uk/?utm_source=linkedin&utm_medium=social',
        origin
      )
    ).toEqual({
      utmSource: 'chatgpt.com',
      utmMedium: 'social',
      utmCampaign: 'spring',
    });
  });
});
