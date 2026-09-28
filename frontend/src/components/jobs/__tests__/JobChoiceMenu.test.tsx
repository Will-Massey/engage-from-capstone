import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import JobChoiceMenu from '../JobChoiceMenu';
import { shouldPersistChoice } from '../jobChoice';

describe('shouldPersistChoice', () => {
  it('is false when the staff keep the current value', () => {
    expect(shouldPersistChoice('REQUEST_RECORDS', 'REQUEST_RECORDS')).toBe(false);
    expect(shouldPersistChoice('abc', '')).toBe(true);
    expect(shouldPersistChoice(null, '')).toBe(false);
    expect(shouldPersistChoice(undefined, null)).toBe(false);
  });
});

describe('JobChoiceMenu markup', () => {
  const html = renderToStaticMarkup(
    <JobChoiceMenu
      label="Board column"
      value="REQUEST_RECORDS"
      options={[
        { value: 'REQUEST_RECORDS', label: 'Request Records' },
        { value: 'COMPLETE', label: 'Complete' },
      ]}
      onChange={() => undefined}
      testId="job-board-column"
    />
  );

  it('is a button, not a native select that must be completed', () => {
    expect(html).toContain('type="button"');
    expect(html).not.toContain('<select');
    expect(html).toContain('Request Records');
    expect(html).toContain('aria-expanded="false"');
  });
});
