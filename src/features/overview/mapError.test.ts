import { describeMapError } from './mapError';

describe('describeMapError', () => {
  it('explains 401/403 even though Mapbox sends an empty message for them', () => {
    // Regression: the empty string was stored as-is, was falsy, and the alert never rendered.
    for (const status of [401, 403]) {
      const text = describeMapError({ message: '', status });
      expect(text).not.toBe('');
      expect(text).toMatch(/refused to serve the map/i);
    }
  });

  it("uses Mapbox's message for other errors when there is one", () => {
    expect(describeMapError({ message: 'Style is not done loading', status: undefined })).toBe(
      'Style is not done loading',
    );
  });

  it('never returns an empty string', () => {
    expect(describeMapError({ message: '', status: 500 })).not.toBe('');
    expect(describeMapError({})).not.toBe('');
    expect(describeMapError(undefined)).not.toBe('');
  });
});
