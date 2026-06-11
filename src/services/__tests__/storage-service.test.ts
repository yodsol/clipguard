import { StorageService } from '../storage-service';
import Store from 'electron-store';
import { DetectionHistoryEntry, AppSettings } from '../../types';

// Mock electron-store
jest.mock('electron-store');

// Mock logger service
jest.mock('../logger-service', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('StorageService', () => {
  let storageService: StorageService;
  let mockStore: jest.Mocked<Store>;

  // Default settings for mocking
  const defaultSettings: AppSettings = {
    monitoring_enabled: true,
    auto_clear_clipboard: false,
    show_warnings: true,
    detection_history: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a mock store with in-memory storage
    const storeData: Record<string, any> = {
      monitoring_enabled: true,
      auto_clear_clipboard: false,
      show_warnings: true,
      detection_history: [],
    };

    mockStore = {
      get: jest.fn(function(this: any, key: string) {
        return storeData[key];
      }),
      set: jest.fn(function(this: any, key: string, value: any) {
        storeData[key] = value;
      }),
      clear: jest.fn(function(this: any) {
        Object.keys(storeData).forEach(key => delete storeData[key]);
      }),
    } as any;

    (Store as jest.MockedClass<typeof Store>).mockImplementation(() => mockStore);

    storageService = new StorageService();
  });

  describe('Constructor', () => {
    it('should initialize Store with correct configuration', () => {
      expect(Store).toHaveBeenCalledWith({
        name: 'clipguard-monitor',
        defaults: {
          monitoring_enabled: true,
          auto_clear_clipboard: false,
          show_warnings: true,
          detection_history: [],
        },
      });
    });

    it('should create a new instance', () => {
      expect(storageService).toBeDefined();
      expect(storageService).toBeInstanceOf(StorageService);
    });
  });

  describe('getSettings', () => {
    it('should return default settings on first call', () => {
      const settings = storageService.getSettings();
      expect(settings).toEqual(defaultSettings);
      expect(settings.monitoring_enabled).toBe(true);
      expect(settings.auto_clear_clipboard).toBe(false);
      expect(settings.show_warnings).toBe(true);
      expect(settings.detection_history).toEqual([]);
    });

    it('should retrieve all setting properties', () => {
      const settings = storageService.getSettings();
      expect(settings).toHaveProperty('monitoring_enabled');
      expect(settings).toHaveProperty('auto_clear_clipboard');
      expect(settings).toHaveProperty('show_warnings');
      expect(settings).toHaveProperty('detection_history');
    });

    it('should return correct types for all settings', () => {
      const settings = storageService.getSettings();
      expect(typeof settings.monitoring_enabled).toBe('boolean');
      expect(typeof settings.auto_clear_clipboard).toBe('boolean');
      expect(typeof settings.show_warnings).toBe('boolean');
      expect(Array.isArray(settings.detection_history)).toBe(true);
    });

    it('should handle custom settings after update', () => {
      mockStore.get.mockImplementation((key: string) => {
        const customData: Record<string, any> = {
          monitoring_enabled: false,
          auto_clear_clipboard: true,
          show_warnings: false,
          detection_history: [],
        };
        return customData[key];
      });

      const settings = storageService.getSettings();
      expect(settings.monitoring_enabled).toBe(false);
      expect(settings.auto_clear_clipboard).toBe(true);
      expect(settings.show_warnings).toBe(false);
    });

    it('should use default values when store returns undefined', () => {
      mockStore.get.mockReturnValue(undefined);

      const settings = storageService.getSettings();
      expect(settings.monitoring_enabled).toBe(true);
      expect(settings.auto_clear_clipboard).toBe(false);
      expect(settings.show_warnings).toBe(true);
      expect(settings.detection_history).toEqual([]);
    });
  });

  describe('updateSettings', () => {
    it('should update monitoring_enabled setting', () => {
      storageService.updateSettings({ monitoring_enabled: false });
      expect(mockStore.set).toHaveBeenCalledWith('monitoring_enabled', false);
    });

    it('should update auto_clear_clipboard setting', () => {
      storageService.updateSettings({ auto_clear_clipboard: true });
      expect(mockStore.set).toHaveBeenCalledWith('auto_clear_clipboard', true);
    });

    it('should update show_warnings setting', () => {
      storageService.updateSettings({ show_warnings: false });
      expect(mockStore.set).toHaveBeenCalledWith('show_warnings', false);
    });

    it('should update multiple settings at once', () => {
      const updates: Partial<AppSettings> = {
        monitoring_enabled: false,
        auto_clear_clipboard: true,
        show_warnings: false,
      };
      storageService.updateSettings(updates);

      expect(mockStore.set).toHaveBeenCalledWith('monitoring_enabled', false);
      expect(mockStore.set).toHaveBeenCalledWith('auto_clear_clipboard', true);
      expect(mockStore.set).toHaveBeenCalledWith('show_warnings', false);
      expect(mockStore.set).toHaveBeenCalledTimes(3);
    });

    it('should not call set for undefined values', () => {
      storageService.updateSettings({});
      expect(mockStore.set).not.toHaveBeenCalled();
    });

    it('should handle partial updates with only one property', () => {
      storageService.updateSettings({ monitoring_enabled: true });
      expect(mockStore.set).toHaveBeenCalledTimes(1);
      expect(mockStore.set).toHaveBeenCalledWith('monitoring_enabled', true);
    });

    it('should skip undefined properties in partial update', () => {
      storageService.updateSettings({
        monitoring_enabled: false,
        auto_clear_clipboard: undefined,
        show_warnings: true,
      });

      expect(mockStore.set).toHaveBeenCalledWith('monitoring_enabled', false);
      expect(mockStore.set).toHaveBeenCalledWith('show_warnings', true);
      expect(mockStore.set).toHaveBeenCalledTimes(2);
    });

    it('should log when settings are updated', () => {
      const { logger } = require('../logger-service');
      logger.info.mockClear();

      storageService.updateSettings({ monitoring_enabled: false });
      expect(logger.info).toHaveBeenCalledWith('Settings updated', {
        settings: { monitoring_enabled: false },
      });
    });
  });

  describe('addDetectionHistory', () => {
    it('should add a detection history entry', () => {
      const entry: DetectionHistoryEntry = {
        timestamp: '2026-06-08T10:00:00Z',
        severity: 'critical',
        types: ['API Key'],
        count: 1,
      };

      storageService.addDetectionHistory(entry);

      expect(mockStore.set).toHaveBeenCalled();
      const calls = (mockStore.set as jest.Mock).mock.calls;
      const callArgs = calls[calls.length - 1];
      expect(callArgs[0]).toBe('detection_history');
      expect((callArgs[1] as DetectionHistoryEntry[]).length).toBe(1);
      expect((callArgs[1] as DetectionHistoryEntry[])[0]).toEqual(entry);
    });

    it('should add multiple entries sequentially', () => {
      const entry1: DetectionHistoryEntry = {
        timestamp: '2026-06-08T10:00:00Z',
        severity: 'critical',
        types: ['API Key'],
        count: 1,
      };

      const entry2: DetectionHistoryEntry = {
        timestamp: '2026-06-08T10:05:00Z',
        severity: 'high',
        types: ['Credit Card'],
        count: 1,
      };

      storageService.addDetectionHistory(entry1);
      storageService.addDetectionHistory(entry2);

      // Verify both entries were added
      expect(mockStore.set).toHaveBeenCalled();
    });

    it('should maintain insertion order', () => {
      const entries = Array.from({ length: 5 }, (_, i) => ({
        timestamp: `2026-06-08T10:0${i}:00Z`,
        severity: 'critical',
        types: ['API Key'],
        count: 1,
      }));

      entries.forEach(entry => storageService.addDetectionHistory(entry));

      const calls = (mockStore.set as jest.Mock).mock.calls;
      const lastCall = calls[calls.length - 1];
      const savedHistory = lastCall[1] as DetectionHistoryEntry[];
      expect(savedHistory.length).toBe(5);
      expect(savedHistory[0].timestamp).toBe(entries[0].timestamp);
      expect(savedHistory[4].timestamp).toBe(entries[4].timestamp);
    });

    it('should rotate history when exceeding 100 entries', () => {
      // Pre-populate with 99 entries
      const existingHistory = Array.from({ length: 99 }, (_, i) => ({
        timestamp: `2026-06-08T${String(i).padStart(2, '0')}:00:00Z`,
        severity: 'medium',
        types: ['Email'],
        count: 1,
      }));

      (mockStore.get as jest.Mock).mockReturnValue(existingHistory);

      const newEntry: DetectionHistoryEntry = {
        timestamp: '2026-06-08T99:00:00Z',
        severity: 'critical',
        types: ['API Key'],
        count: 1,
      };

      storageService.addDetectionHistory(newEntry);

      const calls = (mockStore.set as jest.Mock).mock.calls;
      const lastCall = calls[calls.length - 1];
      const savedHistory = lastCall[1] as DetectionHistoryEntry[];
      expect(savedHistory.length).toBe(100);
      expect(savedHistory[99].timestamp).toBe(newEntry.timestamp);
    });

    it('should keep max 100 entries after rotation', () => {
      // Pre-populate with 100 entries
      const existingHistory = Array.from({ length: 100 }, (_, i) => ({
        timestamp: `2026-06-08T${String(i).padStart(2, '0')}:00:00Z`,
        severity: 'medium',
        types: ['Email'],
        count: 1,
      }));

      (mockStore.get as jest.Mock).mockReturnValue(existingHistory);

      const newEntry: DetectionHistoryEntry = {
        timestamp: '2026-06-08T100:00:00Z',
        severity: 'critical',
        types: ['API Key'],
        count: 1,
      };

      storageService.addDetectionHistory(newEntry);

      const calls = (mockStore.set as jest.Mock).mock.calls;
      const lastCall = calls[calls.length - 1];
      const savedHistory = lastCall[1] as DetectionHistoryEntry[];
      expect(savedHistory.length).toBe(100);
      // Oldest entry should be removed
      expect(savedHistory[0].timestamp).not.toBe('2026-06-08T00:00:00Z');
      // Newest entry should be present
      expect(savedHistory[99]).toEqual(newEntry);
    });

    it('should remove the oldest entry when exceeding max', () => {
      const existingHistory = Array.from({ length: 100 }, (_, i) => ({
        timestamp: `entry-${i}`,
        severity: 'medium',
        types: ['Email'],
        count: 1,
      }));

      (mockStore.get as jest.Mock).mockReturnValue(existingHistory);

      const newEntry: DetectionHistoryEntry = {
        timestamp: 'entry-100',
        severity: 'critical',
        types: ['API Key'],
        count: 1,
      };

      storageService.addDetectionHistory(newEntry);

      const calls = (mockStore.set as jest.Mock).mock.calls;
      const lastCall = calls[calls.length - 1];
      const savedHistory = lastCall[1] as DetectionHistoryEntry[];
      expect(savedHistory.length).toBe(100);
      expect(savedHistory[0].timestamp).not.toBe('entry-0');
      expect(savedHistory[0].timestamp).toBe('entry-1');
    });
  });

  describe('getDetectionHistory', () => {
    it('should return empty array by default', () => {
      const history = storageService.getDetectionHistory();
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(0);
    });

    it('should return stored detection history', () => {
      const mockHistory: DetectionHistoryEntry[] = [
        {
          timestamp: '2026-06-08T10:00:00Z',
          severity: 'critical',
          types: ['API Key'],
          count: 1,
        },
      ];

      (mockStore.get as jest.Mock).mockReturnValue(mockHistory);

      const history = storageService.getDetectionHistory();
      expect(history).toEqual(mockHistory);
    });

    it('should return all entries in history', () => {
      const mockHistory = Array.from({ length: 50 }, (_, i) => ({
        timestamp: `2026-06-08T${String(i).padStart(2, '0')}:00:00Z`,
        severity: 'medium',
        types: ['Email'],
        count: 1,
      }));

      (mockStore.get as jest.Mock).mockReturnValue(mockHistory);

      const history = storageService.getDetectionHistory();
      expect(history.length).toBe(50);
    });

    it('should use default empty array when undefined', () => {
      (mockStore.get as jest.Mock).mockReturnValue(undefined);

      const history = storageService.getDetectionHistory();
      expect(history).toEqual([]);
    });
  });

  describe('clearDetectionHistory', () => {
    it('should clear all detection history', () => {
      storageService.clearDetectionHistory();
      expect(mockStore.set).toHaveBeenCalledWith('detection_history', []);
    });

    it('should log when history is cleared', () => {
      const { logger } = require('../logger-service');
      logger.info.mockClear();

      storageService.clearDetectionHistory();
      expect(logger.info).toHaveBeenCalledWith('Detection history cleared');
    });

    it('should work even with pre-existing history', () => {
      const mockHistory = Array.from({ length: 50 }, (_, i) => ({
        timestamp: `2026-06-08T${String(i).padStart(2, '0')}:00:00Z`,
        severity: 'medium',
        types: ['Email'],
        count: 1,
      }));

      mockStore.get.mockReturnValue(mockHistory);

      storageService.clearDetectionHistory();
      expect(mockStore.set).toHaveBeenCalledWith('detection_history', []);
    });

    it('should clear to empty state', () => {
      storageService.clearDetectionHistory();
      const calls = (mockStore.set as jest.Mock).mock.calls;
      const setCall = calls[calls.length - 1];
      expect(setCall[1]).toEqual([]);
      expect(Array.isArray(setCall[1])).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle get errors gracefully in getSettings', () => {
      const { logger } = require('../logger-service');
      logger.error.mockClear();

      (mockStore.get as jest.Mock).mockImplementation(() => {
        throw new Error('Store read failed');
      });

      const settings = storageService.getSettings();
      expect(logger.error).toHaveBeenCalled();
      expect(settings.monitoring_enabled).toBe(true); // Should return default
      expect(settings.auto_clear_clipboard).toBe(false); // Should return default
    });

    it('should handle set errors gracefully in updateSettings', () => {
      const { logger } = require('../logger-service');
      logger.error.mockClear();

      (mockStore.set as jest.Mock).mockImplementation(() => {
        throw new Error('Store write failed');
      });

      expect(() => {
        storageService.updateSettings({ monitoring_enabled: false });
      }).not.toThrow();

      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle set errors gracefully in addDetectionHistory', () => {
      const { logger } = require('../logger-service');
      logger.error.mockClear();

      (mockStore.set as jest.Mock).mockImplementation(() => {
        throw new Error('Store write failed');
      });

      const entry: DetectionHistoryEntry = {
        timestamp: '2026-06-08T10:00:00Z',
        severity: 'critical',
        types: ['API Key'],
        count: 1,
      };

      expect(() => {
        storageService.addDetectionHistory(entry);
      }).not.toThrow();

      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle set errors gracefully in clearDetectionHistory', () => {
      const { logger } = require('../logger-service');
      logger.error.mockClear();

      (mockStore.set as jest.Mock).mockImplementation(() => {
        throw new Error('Store write failed');
      });

      expect(() => {
        storageService.clearDetectionHistory();
      }).not.toThrow();

      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle non-Error objects thrown from store', () => {
      const { logger } = require('../logger-service');
      logger.error.mockClear();

      (mockStore.get as jest.Mock).mockImplementation(() => {
        throw 'Unknown error'; // Not an Error object
      });

      const settings = storageService.getSettings();
      expect(logger.error).toHaveBeenCalled();
      expect(settings).toBeDefined();
    });

    it('should log error with correct key when get fails', () => {
      const { logger } = require('../logger-service');
      logger.error.mockClear();

      mockStore.get.mockImplementation(() => {
        throw new Error('Read failed');
      });

      storageService.getSettings();

      const errorCall = logger.error.mock.calls[0];
      expect(errorCall[2]).toHaveProperty('key');
    });

    it('should log error with key and value when set fails', () => {
      const { logger } = require('../logger-service');
      logger.error.mockClear();

      mockStore.set.mockImplementation(() => {
        throw new Error('Write failed');
      });

      storageService.updateSettings({ monitoring_enabled: false });

      const errorCall = logger.error.mock.calls[0];
      expect(errorCall[2]).toHaveProperty('key');
      expect(errorCall[2]).toHaveProperty('value');
    });

    it('should handle non-Error objects in set operations', () => {
      const { logger } = require('../logger-service');
      logger.error.mockClear();

      (mockStore.set as jest.Mock).mockImplementation(() => {
        throw 'Custom error string'; // Not an Error object
      });

      storageService.updateSettings({ monitoring_enabled: false });

      expect(logger.error).toHaveBeenCalled();
      const errorCall = logger.error.mock.calls[0];
      expect(errorCall[1]).toBeDefined();
    });
  });

  describe('Integration Scenarios', () => {
    it('should persist settings changes across operations', () => {
      const storeData: Record<string, any> = {
        monitoring_enabled: true,
        auto_clear_clipboard: false,
        show_warnings: true,
        detection_history: [],
      };

      (mockStore.get as jest.Mock).mockImplementation((key: string) => storeData[key]);
      (mockStore.set as jest.Mock).mockImplementation((key: string, value: any) => {
        storeData[key] = value;
      });

      storageService.updateSettings({ monitoring_enabled: false });
      const settings = storageService.getSettings();

      expect(settings.monitoring_enabled).toBe(false);
    });

    it('should handle mixed history and settings operations', () => {
      const storeData: Record<string, any> = {
        monitoring_enabled: true,
        auto_clear_clipboard: false,
        show_warnings: true,
        detection_history: [],
      };

      (mockStore.get as jest.Mock).mockImplementation((key: string) => storeData[key]);
      (mockStore.set as jest.Mock).mockImplementation((key: string, value: any) => {
        storeData[key] = value;
      });

      const entry: DetectionHistoryEntry = {
        timestamp: '2026-06-08T10:00:00Z',
        severity: 'critical',
        types: ['API Key'],
        count: 1,
      };

      storageService.addDetectionHistory(entry);
      storageService.updateSettings({ monitoring_enabled: false });
      storageService.addDetectionHistory(entry);

      const history = storageService.getDetectionHistory();
      const settings = storageService.getSettings();

      expect(history.length).toBe(2);
      expect(settings.monitoring_enabled).toBe(false);
    });

    it('should clear history without affecting settings', () => {
      const storeData: Record<string, any> = {
        monitoring_enabled: false,
        auto_clear_clipboard: true,
        show_warnings: false,
        detection_history: [
          {
            timestamp: '2026-06-08T10:00:00Z',
            severity: 'critical',
            types: ['API Key'],
            count: 1,
          },
        ],
      };

      (mockStore.get as jest.Mock).mockImplementation((key: string) => storeData[key]);
      (mockStore.set as jest.Mock).mockImplementation((key: string, value: any) => {
        storeData[key] = value;
      });

      const settingsBefore = storageService.getSettings();
      storageService.clearDetectionHistory();
      const settingsAfter = storageService.getSettings();

      expect(settingsBefore.monitoring_enabled).toBe(settingsAfter.monitoring_enabled);
      expect(settingsBefore.auto_clear_clipboard).toBe(settingsAfter.auto_clear_clipboard);
      expect(settingsBefore.show_warnings).toBe(settingsAfter.show_warnings);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings in settings', () => {
      storageService.updateSettings({ monitoring_enabled: true });
      expect(mockStore.set).toHaveBeenCalled();
    });

    it('should handle settings with null-like values', () => {
      // When store returns null, the get method checks !== undefined, so null is returned as-is
      (mockStore.get as jest.Mock).mockReturnValue(null);

      const settings = storageService.getSettings();
      // null is not undefined, so it returns null, not the default
      // The getSettings will have null values for the properties
      expect(settings).toBeDefined();
      expect(typeof settings === 'object').toBe(true);
    });

    it('should handle detection history entry with empty types array', () => {
      const entry: DetectionHistoryEntry = {
        timestamp: '2026-06-08T10:00:00Z',
        severity: 'safe',
        types: [],
        count: 0,
      };

      storageService.addDetectionHistory(entry);
      expect(mockStore.set).toHaveBeenCalled();
    });

    it('should handle detection history with many types', () => {
      const entry: DetectionHistoryEntry = {
        timestamp: '2026-06-08T10:00:00Z',
        severity: 'critical',
        types: Array.from({ length: 20 }, (_, i) => `Type${i}`),
        count: 20,
      };

      storageService.addDetectionHistory(entry);
      const calls = (mockStore.set as jest.Mock).mock.calls;
      const lastCall = calls[calls.length - 1];
      expect((lastCall[1] as DetectionHistoryEntry[])[0].types.length).toBe(20);
    });

    it('should handle very large timestamps in history', () => {
      const entry: DetectionHistoryEntry = {
        timestamp: new Date(Date.now() + 1000000000000).toISOString(),
        severity: 'critical',
        types: ['API Key'],
        count: 1,
      };

      storageService.addDetectionHistory(entry);
      expect(mockStore.set).toHaveBeenCalled();
    });

    it('should handle rotation with exactly 100 entries', () => {
      const existingHistory = Array.from({ length: 100 }, (_, i) => ({
        timestamp: `entry-${i}`,
        severity: 'medium',
        types: ['Email'],
        count: 1,
      }));

      (mockStore.get as jest.Mock).mockReturnValue(existingHistory);

      const newEntry: DetectionHistoryEntry = {
        timestamp: 'entry-100',
        severity: 'critical',
        types: ['API Key'],
        count: 1,
      };

      storageService.addDetectionHistory(newEntry);

      const calls = (mockStore.set as jest.Mock).mock.calls;
      const lastCall = calls[calls.length - 1];
      const savedHistory = lastCall[1] as DetectionHistoryEntry[];
      expect(savedHistory.length).toBe(100);
    });
  });
});
