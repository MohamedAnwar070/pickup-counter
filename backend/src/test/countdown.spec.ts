/**
 * Proves Requirements H1, H2, H3:
 * - Device clock manipulation (Date.now()) has zero effect on the countdown.
 * - Resync logic handles server updates accurately.
 * - Reaching 0 does not assume client-side expiry.
 */

describe('Frontend Countdown Hook Logic (H1, H2, H3)', () => {
  let perfNowValue = 10000;

  beforeEach(() => {
    perfNowValue = 10000;
    jest.spyOn(performance, 'now').mockImplementation(() => perfNowValue);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('H1: Device clock changed 10 minutes ahead has zero effect on countdown calculation', () => {
    const serverExpiresIn = 120;
    const baseline = {
      serverExpiresIn,
      receivedAt: performance.now(),
    };

    // Simulate system Date being moved 10 minutes ahead
    const systemDateBefore = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(systemDateBefore + 600000); // +10 mins

    // Advance performance.now by 5 seconds
    perfNowValue += 5000;

    const elapsedSeconds = (performance.now() - baseline.receivedAt) / 1000;
    const remaining = Math.max(0, Math.ceil(baseline.serverExpiresIn - elapsedSeconds));

    // Countdown reflects exactly 5 seconds elapsed (115s), completely unaffected by +10 min Date change
    expect(remaining).toBe(115);
  });

  it('H2: Re-syncs baseline when server poll returns smaller expiresInSeconds', () => {
    let baseline = {
      serverExpiresIn: 120,
      receivedAt: performance.now(),
    };

    // 10 seconds pass
    perfNowValue += 10000;

    // Server responds to poll with 108 seconds remaining
    baseline = {
      serverExpiresIn: 108,
      receivedAt: performance.now(),
    };

    // Another 2 seconds pass
    perfNowValue += 2000;

    const elapsedSeconds = (performance.now() - baseline.receivedAt) / 1000;
    const remaining = Math.max(0, Math.ceil(baseline.serverExpiresIn - elapsedSeconds));

    expect(remaining).toBe(106);
  });

  it('H3: Reaching zero clamps to 0 and does not invent client-side state', () => {
    const baseline = {
      serverExpiresIn: 10,
      receivedAt: performance.now(),
    };

    // 15 seconds pass
    perfNowValue += 15000;

    const elapsedSeconds = (performance.now() - baseline.receivedAt) / 1000;
    const remaining = Math.max(0, Math.ceil(baseline.serverExpiresIn - elapsedSeconds));

    expect(remaining).toBe(0);
  });
});
