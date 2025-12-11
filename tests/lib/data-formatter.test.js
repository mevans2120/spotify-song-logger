import {
  formatTimestamp,
  extractPlaybackContext,
  calculatePlayDuration,
  calculateCompletionPercentage,
  formatTrackForLogging,
  formatAsSheetRow,
  getSheetHeaders,
  validateFormattedTrack,
  createErrorPlaceholder
} from '../../lib/data-formatter.js';

describe('data-formatter', () => {
  describe('formatTimestamp', () => {
    it('should return ISO string for valid date string', () => {
      const date = '2024-01-15T12:00:00Z';
      expect(formatTimestamp(date)).toBe(new Date(date).toISOString());
    });

    it('should handle Date objects', () => {
      const date = new Date('2024-01-15T12:00:00Z');
      expect(formatTimestamp(date)).toBe(date.toISOString());
    });

    it('should return current time for null', () => {
      const before = Date.now();
      const result = formatTimestamp(null);
      const after = Date.now();

      const resultTime = new Date(result).getTime();
      expect(resultTime).toBeGreaterThanOrEqual(before);
      expect(resultTime).toBeLessThanOrEqual(after);
    });

    it('should return current time for undefined', () => {
      const before = Date.now();
      const result = formatTimestamp(undefined);
      const after = Date.now();

      const resultTime = new Date(result).getTime();
      expect(resultTime).toBeGreaterThanOrEqual(before);
      expect(resultTime).toBeLessThanOrEqual(after);
    });
  });

  describe('extractPlaybackContext', () => {
    it('should extract device and context info', () => {
      const playbackInfo = {
        device: { name: 'MacBook Pro', type: 'Computer' },
        context: { type: 'playlist', uri: 'spotify:playlist:abc123' },
        shuffle_state: true,
        repeat_state: 'context'
      };

      const result = extractPlaybackContext(playbackInfo);
      expect(result.device).toBe('MacBook Pro');
      expect(result.deviceType).toBe('Computer');
      expect(result.contextType).toBe('playlist');
      expect(result.contextUri).toBe('spotify:playlist:abc123');
      expect(result.shuffleState).toBe(true);
      expect(result.repeatState).toBe('context');
    });

    it('should handle missing device', () => {
      const playbackInfo = {
        context: { type: 'album', uri: 'spotify:album:xyz' }
      };
      const result = extractPlaybackContext(playbackInfo);

      expect(result.device).toBe('Unknown Device');
      expect(result.deviceType).toBe('Unknown');
    });

    it('should handle missing context', () => {
      const playbackInfo = {
        device: { name: 'iPhone', type: 'Smartphone' }
      };
      const result = extractPlaybackContext(playbackInfo);

      expect(result.contextType).toBe('None');
      expect(result.contextUri).toBe('');
    });

    it('should handle empty playback info', () => {
      const playbackInfo = {};
      const result = extractPlaybackContext(playbackInfo);

      expect(result.device).toBe('Unknown Device');
      expect(result.deviceType).toBe('Unknown');
      expect(result.contextType).toBe('None');
      expect(result.contextUri).toBe('');
      expect(result.shuffleState).toBe(false);
      expect(result.repeatState).toBe('off');
    });
  });

  describe('calculatePlayDuration', () => {
    it('should return progress_ms when available', () => {
      const track = { duration_ms: 180000 };
      const playbackInfo = { progress_ms: 90000 };
      expect(calculatePlayDuration(track, playbackInfo)).toBe(90000);
    });

    it('should return full duration when no progress', () => {
      const track = { duration_ms: 180000 };
      const playbackInfo = {};
      expect(calculatePlayDuration(track, playbackInfo)).toBe(180000);
    });

    it('should return 0 when track has no duration', () => {
      const track = {};
      const playbackInfo = {};
      expect(calculatePlayDuration(track, playbackInfo)).toBe(0);
    });

    it('should prefer progress_ms over track duration', () => {
      const track = { duration_ms: 180000 };
      const playbackInfo = { progress_ms: 0 };
      expect(calculatePlayDuration(track, playbackInfo)).toBe(0);
    });
  });

  describe('calculateCompletionPercentage', () => {
    it('should calculate correct percentage', () => {
      expect(calculateCompletionPercentage(90000, 180000)).toBe(50);
      expect(calculateCompletionPercentage(180000, 180000)).toBe(100);
    });

    it('should cap at 100%', () => {
      expect(calculateCompletionPercentage(200000, 180000)).toBe(100);
    });

    it('should return 0 for zero duration', () => {
      expect(calculateCompletionPercentage(90000, 0)).toBe(0);
    });

    it('should return 0 for null duration', () => {
      expect(calculateCompletionPercentage(90000, null)).toBe(0);
    });

    it('should round to 2 decimal places', () => {
      // 60000 / 180000 = 0.3333... = 33.33%
      expect(calculateCompletionPercentage(60000, 180000)).toBe(33.33);
    });
  });

  describe('formatTrackForLogging', () => {
    const mockTrack = {
      id: 'track123',
      name: 'Test Song',
      duration_ms: 180000,
      popularity: 75,
      explicit: false,
      artists: [{ id: 'artist1', name: 'Test Artist' }],
      album: {
        id: 'album1',
        name: 'Test Album',
        release_date: '2024-01-15'
      }
    };

    const mockPlaybackInfo = {
      played_at: '2024-01-15T12:00:00Z',
      context: { type: 'album', uri: 'spotify:album:album1' }
    };

    const mockAudioFeatures = {
      tempo: 120,
      energy: 0.8,
      danceability: 0.7,
      valence: 0.6,
      acousticness: 0.2,
      instrumentalness: 0.0,
      speechiness: 0.05,
      loudness: -5
    };

    const mockArtist = {
      genres: ['pop', 'rock']
    };

    it('should format all fields correctly', () => {
      const result = formatTrackForLogging(
        mockTrack,
        mockPlaybackInfo,
        mockAudioFeatures,
        mockArtist
      );

      expect(result.trackName).toBe('Test Song');
      expect(result.artists).toBe('Test Artist');
      expect(result.album).toBe('Test Album');
      expect(result.trackId).toBe('track123');
      expect(result.tempo).toBe(120);
      expect(result.energy).toBe(0.8);
      expect(result.genres).toBe('pop, rock');
      expect(result.status).toBe('COMPLETED');
    });

    it('should handle missing audio features', () => {
      const result = formatTrackForLogging(mockTrack, mockPlaybackInfo, null, null);

      expect(result.tempo).toBeNull();
      expect(result.energy).toBeNull();
      expect(result.danceability).toBeNull();
      expect(result.genres).toBe('');
    });

    it('should handle multiple artists', () => {
      const trackWithMultipleArtists = {
        ...mockTrack,
        artists: [
          { id: 'artist1', name: 'Artist One' },
          { id: 'artist2', name: 'Artist Two' }
        ]
      };

      const result = formatTrackForLogging(trackWithMultipleArtists, mockPlaybackInfo, null, null);
      expect(result.artists).toBe('Artist One, Artist Two');
      expect(result.artistIds).toBe('artist1, artist2');
    });

    it('should use custom status when provided', () => {
      const result = formatTrackForLogging(
        mockTrack,
        mockPlaybackInfo,
        null,
        null,
        'PENDING',
        'Waiting for retry'
      );

      expect(result.status).toBe('PENDING');
      expect(result.errorDetails).toBe('Waiting for retry');
    });

    it('should handle missing track data gracefully', () => {
      const minimalTrack = {};
      const result = formatTrackForLogging(minimalTrack, mockPlaybackInfo, null, null);

      expect(result.trackName).toBe('Unknown Track');
      expect(result.artists).toBe('Unknown Artist');
      expect(result.album).toBe('Unknown Album');
    });
  });

  describe('formatAsSheetRow', () => {
    it('should return array with 28 elements', () => {
      const formatted = {
        timestamp: '2024-01-15T12:00:00Z',
        trackName: 'Test',
        artists: 'Artist',
        album: 'Album',
        duration: 180000,
        playDuration: 180000,
        completion: 100,
        trackId: '123',
        albumId: '456',
        artistIds: '789',
        genres: 'pop',
        tempo: 120,
        energy: 0.8,
        danceability: 0.7,
        valence: 0.6,
        acousticness: 0.2,
        instrumentalness: 0.0,
        speechiness: 0.05,
        loudness: -5,
        popularity: 75,
        device: 'MacBook',
        deviceType: 'Computer',
        context: 'album',
        contextUri: 'uri',
        explicit: false,
        releaseDate: '2024-01-15',
        status: 'COMPLETED',
        errorDetails: ''
      };

      const row = formatAsSheetRow(formatted);
      expect(row).toHaveLength(28);
      expect(row[0]).toBe('2024-01-15T12:00:00Z');
      expect(row[1]).toBe('Test');
      expect(row[2]).toBe('Artist');
      expect(row[26]).toBe('COMPLETED');
      expect(row[27]).toBe('');
    });

    it('should maintain correct column order', () => {
      const formatted = {
        timestamp: 'ts',
        trackName: 'name',
        artists: 'artists',
        album: 'album',
        duration: 1,
        playDuration: 2,
        completion: 3,
        trackId: 'tid',
        albumId: 'aid',
        artistIds: 'aids',
        genres: 'genres',
        tempo: 4,
        energy: 5,
        danceability: 6,
        valence: 7,
        acousticness: 8,
        instrumentalness: 9,
        speechiness: 10,
        loudness: 11,
        popularity: 12,
        device: 'dev',
        deviceType: 'dtype',
        context: 'ctx',
        contextUri: 'curi',
        explicit: true,
        releaseDate: 'rd',
        status: 'status',
        errorDetails: 'err'
      };

      const row = formatAsSheetRow(formatted);
      expect(row[0]).toBe('ts');
      expect(row[7]).toBe('tid');
      expect(row[11]).toBe(4); // tempo
      expect(row[19]).toBe(12); // popularity
      expect(row[24]).toBe(true); // explicit
    });
  });

  describe('getSheetHeaders', () => {
    it('should return 28 headers', () => {
      const headers = getSheetHeaders();
      expect(headers).toHaveLength(28);
    });

    it('should have correct first and last headers', () => {
      const headers = getSheetHeaders();
      expect(headers[0]).toBe('Timestamp');
      expect(headers[1]).toBe('Track Name');
      expect(headers[27]).toBe('Error Details');
    });

    it('should contain all expected column names', () => {
      const headers = getSheetHeaders();
      expect(headers).toContain('Timestamp');
      expect(headers).toContain('Track Name');
      expect(headers).toContain('Artist(s)');
      expect(headers).toContain('Album');
      expect(headers).toContain('Tempo');
      expect(headers).toContain('Energy');
      expect(headers).toContain('Status');
      expect(headers).toContain('Error Details');
    });
  });

  describe('validateFormattedTrack', () => {
    it('should pass for valid track with all required fields', () => {
      const track = {
        timestamp: '2024-01-15T12:00:00Z',
        trackName: 'Test Song',
        artists: 'Test Artist',
        album: 'Test Album',
        trackId: 'abc123',
        status: 'COMPLETED'
      };

      const result = validateFormattedTrack(track);
      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('should fail for missing trackName', () => {
      const track = {
        timestamp: '2024-01-15T12:00:00Z',
        trackName: '',
        artists: 'Test Artist',
        album: 'Test Album',
        trackId: 'abc123',
        status: 'COMPLETED'
      };

      const result = validateFormattedTrack(track);
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('trackName');
    });

    it('should fail for missing artists', () => {
      const track = {
        timestamp: '2024-01-15T12:00:00Z',
        trackName: 'Test Song',
        artists: '',
        album: 'Test Album',
        trackId: 'abc123',
        status: 'COMPLETED'
      };

      const result = validateFormattedTrack(track);
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('artists');
    });

    it('should fail for missing trackId', () => {
      const track = {
        timestamp: '2024-01-15T12:00:00Z',
        trackName: 'Test Song',
        artists: 'Artist',
        album: 'Test Album',
        trackId: '',
        status: 'COMPLETED'
      };

      const result = validateFormattedTrack(track);
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('trackId');
    });

    it('should report all missing fields', () => {
      const track = {
        timestamp: '',
        trackName: '',
        artists: '',
        album: '',
        trackId: '',
        status: ''
      };

      const result = validateFormattedTrack(track);
      expect(result.valid).toBe(false);
      expect(result.missing.length).toBeGreaterThan(1);
    });
  });

  describe('createErrorPlaceholder', () => {
    it('should create placeholder with ERROR status', () => {
      const partialTrack = {
        played_at: '2024-01-15T12:00:00Z',
        track: {
          id: 'track123',
          name: 'Failed Track',
          artists: [{ id: 'artist1', name: 'Artist' }],
          album: { id: 'album1', name: 'Album' },
          duration_ms: 180000
        }
      };

      const result = createErrorPlaceholder(partialTrack, 'API Error');

      expect(result.status).toBe('ERROR');
      expect(result.errorDetails).toBe('API Error');
      expect(result.trackName).toBe('Failed Track');
      expect(result.tempo).toBeNull();
    });

    it('should handle missing track data', () => {
      const partialTrack = {
        played_at: '2024-01-15T12:00:00Z'
      };

      const result = createErrorPlaceholder(partialTrack, 'Track not found');

      expect(result.status).toBe('ERROR');
      expect(result.errorDetails).toBe('Track not found');
      expect(result.trackName).toBe('ERROR: Unable to fetch');
      expect(result.artists).toBe('Unknown');
    });

    it('should use current time when played_at is missing', () => {
      const before = Date.now();
      const partialTrack = {};
      const result = createErrorPlaceholder(partialTrack, 'Error');
      const after = Date.now();

      const resultTime = new Date(result.timestamp).getTime();
      expect(resultTime).toBeGreaterThanOrEqual(before);
      expect(resultTime).toBeLessThanOrEqual(after);
    });

    it('should set audio features to null', () => {
      const partialTrack = {
        track: { id: '123', name: 'Song' }
      };

      const result = createErrorPlaceholder(partialTrack, 'Error');

      expect(result.tempo).toBeNull();
      expect(result.energy).toBeNull();
      expect(result.danceability).toBeNull();
      expect(result.valence).toBeNull();
      expect(result.acousticness).toBeNull();
      expect(result.instrumentalness).toBeNull();
      expect(result.speechiness).toBeNull();
      expect(result.loudness).toBeNull();
      expect(result.popularity).toBeNull();
    });

    it('should set playDuration and completion to 0', () => {
      const partialTrack = {
        track: { id: '123', name: 'Song', duration_ms: 180000 }
      };

      const result = createErrorPlaceholder(partialTrack, 'Error');

      expect(result.playDuration).toBe(0);
      expect(result.completion).toBe(0);
    });
  });
});
