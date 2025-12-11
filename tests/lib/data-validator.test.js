import {
  validateTrackData,
  validateAudioFeatures,
  validateFormattedTrack,
  sanitizeString,
  sanitizeTrackData,
  isLikelyNonMusic,
  isValid
} from '../../lib/data-validator.js';

describe('data-validator', () => {
  describe('validateTrackData', () => {
    it('should pass for valid track data', () => {
      const track = {
        trackName: 'Test Song',
        artists: 'Test Artist',
        trackId: 'abc123',
        timestamp: new Date().toISOString(),
        duration: 180000,
        playDuration: 60000
      };

      const result = validateTrackData(track);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail for missing track name', () => {
      const track = {
        trackName: '',
        artists: 'Test Artist',
        trackId: 'abc123',
        timestamp: new Date().toISOString()
      };

      const result = validateTrackData(track);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Track Name is required but missing');
    });

    it('should fail for missing artist', () => {
      const track = {
        trackName: 'Test Song',
        artists: null,
        trackId: 'abc123',
        timestamp: new Date().toISOString()
      };

      const result = validateTrackData(track);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Artist'))).toBe(true);
    });

    it('should warn for very long duration', () => {
      const track = {
        trackName: 'Long Podcast',
        artists: 'Host',
        trackId: 'abc123',
        timestamp: new Date().toISOString(),
        duration: 7200000 // 2 hours
      };

      const result = validateTrackData(track);
      expect(result.warnings.some(w => w.includes('podcast'))).toBe(true);
    });
  });

  describe('validateAudioFeatures', () => {
    it('should pass for valid audio features', () => {
      const features = {
        energy: 0.8,
        danceability: 0.7,
        valence: 0.6,
        acousticness: 0.2,
        instrumentalness: 0.0,
        speechiness: 0.05,
        tempo: 120,
        loudness: -5
      };

      const result = validateAudioFeatures(features);
      expect(result.valid).toBe(true);
    });

    it('should fail for out-of-range energy', () => {
      const features = {
        energy: 1.5 // Invalid: should be 0-1
      };

      const result = validateAudioFeatures(features);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('energy'))).toBe(true);
    });

    it('should pass for null features', () => {
      const result = validateAudioFeatures(null);
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('No audio features provided');
    });
  });

  describe('sanitizeString', () => {
    it('should return unchanged for normal strings', () => {
      const input = 'Normal Song Title';
      expect(sanitizeString(input)).toBe(input);
    });

    it('should remove control characters', () => {
      const input = 'Song\x00with\x1Fcontrol';
      const result = sanitizeString(input);
      expect(result).toBe('Songwithcontrol');
    });

    it('should truncate very long strings', () => {
      const input = 'x'.repeat(600);
      const result = sanitizeString(input);
      expect(result.length).toBeLessThanOrEqual(500);
      expect(result.endsWith('...')).toBe(true);
    });

    it('should handle null/undefined', () => {
      expect(sanitizeString(null)).toBeNull();
      expect(sanitizeString(undefined)).toBeUndefined();
    });
  });

  describe('isLikelyNonMusic', () => {
    it('should detect podcasts by duration', () => {
      const track = { duration: 25 * 60 * 1000 }; // 25 minutes
      expect(isLikelyNonMusic(track)).toBe(true);
    });

    it('should detect podcasts by speechiness', () => {
      const track = {
        duration: 180000,
        speechiness: 0.85,
        instrumentalness: 0.01
      };
      expect(isLikelyNonMusic(track)).toBe(true);
    });

    it('should detect podcasts by name', () => {
      const track = {
        trackName: 'Episode 42: Tech Talk',
        duration: 180000
      };
      expect(isLikelyNonMusic(track)).toBe(true);
    });

    it('should return false for normal music', () => {
      const track = {
        trackName: 'Regular Song',
        duration: 180000,
        speechiness: 0.05,
        instrumentalness: 0.3
      };
      expect(isLikelyNonMusic(track)).toBe(false);
    });
  });

  describe('isValid', () => {
    it('should return true for valid track', () => {
      const track = {
        trackName: 'Valid Song',
        artists: 'Artist',
        trackId: '123',
        timestamp: new Date().toISOString(),
        status: 'COMPLETED'
      };
      expect(isValid(track)).toBe(true);
    });

    it('should return false for invalid track', () => {
      const track = {
        trackName: '',
        artists: '',
        trackId: ''
      };
      expect(isValid(track)).toBe(false);
    });
  });
});
