import {
  isValidPlay,
  isDuplicate,
  filterNewPlays,
  sortTracksByTimestamp,
  getMostRecentTrack,
  calculateActualPlayTime,
  createLastProcessedState,
  analyzeRepeatBehavior
} from '../../lib/play-filter.js';

describe('play-filter', () => {
  describe('isValidPlay', () => {
    it('should accept tracks with duration >= 30 seconds', () => {
      const track = { track: { duration_ms: 180000 } };
      expect(isValidPlay(track)).toBe(true);
    });

    it('should accept short tracks that have non-zero duration', () => {
      const track = { track: { duration_ms: 25000 } }; // 25 second track
      expect(isValidPlay(track)).toBe(true);
    });

    it('should reject tracks with zero duration', () => {
      const track = { track: { duration_ms: 0 } };
      expect(isValidPlay(track)).toBe(false);
    });

    it('should accept custom minimum duration', () => {
      const track = { track: { duration_ms: 60000 } };
      expect(isValidPlay(track, 60000)).toBe(true);
    });

    it('should return false for missing track data (zero duration)', () => {
      const track = { track: null };
      // When track.track is null, duration_ms is 0, which fails the duration > 0 check
      expect(isValidPlay(track)).toBe(false);
    });
  });

  describe('isDuplicate', () => {
    it('should return false when no lastProcessed', () => {
      const track = {
        track: { id: 'abc123' },
        played_at: new Date().toISOString()
      };
      expect(isDuplicate(track, null)).toBe(false);
      expect(isDuplicate(track, {})).toBe(false);
    });

    it('should detect duplicate within 30 seconds', () => {
      const now = new Date();
      const track = {
        track: { id: 'abc123', name: 'Test' },
        played_at: now.toISOString()
      };
      const lastProcessed = {
        trackId: 'abc123',
        playedAt: new Date(now.getTime() - 10000).toISOString() // 10 seconds ago
      };
      expect(isDuplicate(track, lastProcessed)).toBe(true);
    });

    it('should allow repeat plays more than 30 seconds apart', () => {
      const now = new Date();
      const track = {
        track: { id: 'abc123', name: 'Test' },
        played_at: now.toISOString()
      };
      const lastProcessed = {
        trackId: 'abc123',
        playedAt: new Date(now.getTime() - 60000).toISOString() // 60 seconds ago
      };
      expect(isDuplicate(track, lastProcessed)).toBe(false);
    });

    it('should not flag different tracks as duplicates', () => {
      const track = {
        track: { id: 'abc123' },
        played_at: new Date().toISOString()
      };
      const lastProcessed = {
        trackId: 'different456',
        playedAt: new Date().toISOString()
      };
      expect(isDuplicate(track, lastProcessed)).toBe(false);
    });
  });

  describe('filterNewPlays', () => {
    it('should return empty array for empty input', () => {
      expect(filterNewPlays([], {})).toEqual([]);
      expect(filterNewPlays(null, {})).toEqual([]);
    });

    it('should filter out old plays', () => {
      const oldTime = new Date(Date.now() - 3600000); // 1 hour ago
      const newTime = new Date();

      const tracks = [
        { track: { id: '1', duration_ms: 180000 }, played_at: oldTime.toISOString() },
        { track: { id: '2', duration_ms: 180000 }, played_at: newTime.toISOString() }
      ];

      const state = {
        lastProcessed: {
          trackId: 'previous',
          playedAt: new Date(Date.now() - 1800000).toISOString() // 30 min ago
        }
      };

      const result = filterNewPlays(tracks, state);
      expect(result).toHaveLength(1);
      expect(result[0].track.id).toBe('2');
    });

    it('should filter out duplicates', () => {
      const now = new Date();
      const tracks = [
        { track: { id: 'abc123', duration_ms: 180000 }, played_at: now.toISOString() }
      ];

      const state = {
        lastProcessed: {
          trackId: 'abc123',
          playedAt: new Date(now.getTime() - 5000).toISOString() // 5 seconds ago (duplicate)
        }
      };

      const result = filterNewPlays(tracks, state);
      expect(result).toHaveLength(0);
    });
  });

  describe('sortTracksByTimestamp', () => {
    it('should sort tracks oldest first', () => {
      const now = Date.now();
      const tracks = [
        { played_at: new Date(now).toISOString() },
        { played_at: new Date(now - 60000).toISOString() },
        { played_at: new Date(now - 30000).toISOString() }
      ];

      const sorted = sortTracksByTimestamp(tracks);
      expect(new Date(sorted[0].played_at).getTime()).toBeLessThan(
        new Date(sorted[1].played_at).getTime()
      );
    });

    it('should not mutate original array', () => {
      const tracks = [
        { played_at: new Date().toISOString() },
        { played_at: new Date(Date.now() - 60000).toISOString() }
      ];
      const original = [...tracks];
      sortTracksByTimestamp(tracks);
      expect(tracks).toEqual(original);
    });
  });

  describe('getMostRecentTrack', () => {
    it('should return null for empty array', () => {
      expect(getMostRecentTrack([])).toBeNull();
      expect(getMostRecentTrack(null)).toBeNull();
    });

    it('should return most recent track', () => {
      const now = Date.now();
      const tracks = [
        { track: { id: 'old' }, played_at: new Date(now - 60000).toISOString() },
        { track: { id: 'newest' }, played_at: new Date(now).toISOString() },
        { track: { id: 'middle' }, played_at: new Date(now - 30000).toISOString() }
      ];

      const result = getMostRecentTrack(tracks);
      expect(result.track.id).toBe('newest');
    });
  });

  describe('calculateActualPlayTime', () => {
    it('should return progress_ms if available', () => {
      const track = {
        track: { duration_ms: 180000 },
        progress_ms: 90000
      };
      expect(calculateActualPlayTime(track)).toBe(90000);
    });

    it('should return full duration if no progress', () => {
      const track = {
        track: { duration_ms: 180000 }
      };
      expect(calculateActualPlayTime(track)).toBe(180000);
    });

    it('should return 0 for missing track data', () => {
      const track = { track: null };
      expect(calculateActualPlayTime(track)).toBe(0);
    });
  });

  describe('createLastProcessedState', () => {
    it('should create state object with correct fields', () => {
      const track = {
        track: { id: 'track123' },
        played_at: '2024-01-15T12:00:00Z'
      };

      const state = createLastProcessedState(track);

      expect(state.trackId).toBe('track123');
      expect(state.playedAt).toBe('2024-01-15T12:00:00Z');
      expect(state.timestamp).toBeDefined();
    });

    it('should handle missing track id', () => {
      const track = {
        track: {},
        played_at: '2024-01-15T12:00:00Z'
      };

      const state = createLastProcessedState(track);

      expect(state.trackId).toBe('');
    });
  });

  describe('analyzeRepeatBehavior', () => {
    it('should return not repeating for empty or single track', () => {
      expect(analyzeRepeatBehavior([])).toEqual({ isRepeating: false, repeatCount: 0 });
      expect(analyzeRepeatBehavior(null)).toEqual({ isRepeating: false, repeatCount: 0 });

      const singleTrack = [{ track: { id: 'abc', name: 'Test' } }];
      expect(analyzeRepeatBehavior(singleTrack)).toEqual({ isRepeating: false, repeatCount: 0 });
    });

    it('should detect repeat behavior', () => {
      const tracks = [
        { track: { id: 'abc123', name: 'Repeated Song' } },
        { track: { id: 'abc123', name: 'Repeated Song' } },
        { track: { id: 'abc123', name: 'Repeated Song' } },
        { track: { id: 'different', name: 'Other Song' } }
      ];

      const result = analyzeRepeatBehavior(tracks);

      expect(result.isRepeating).toBe(true);
      expect(result.repeatCount).toBe(3);
      expect(result.trackName).toBe('Repeated Song');
    });

    it('should return not repeating for different consecutive tracks', () => {
      const tracks = [
        { track: { id: 'abc', name: 'Song 1' } },
        { track: { id: 'def', name: 'Song 2' } }
      ];

      const result = analyzeRepeatBehavior(tracks);

      expect(result.isRepeating).toBe(false);
      expect(result.repeatCount).toBe(1);
    });
  });
});
