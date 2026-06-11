import { ConfigService } from '../config-service';
import Store from 'electron-store';
import { PlatformDetector } from '../../permissions/platform-detector';
import fs from 'fs';
import path from 'path';

describe('ConfigService', () => {
  let configService: ConfigService;
  let mockStore: jest.Mocked<Store>;

  // Sample default config
  const mockDefaults = {
    clipboard_poll_interval: 1000,
    auto_clear_delay: 1500,
    max_history: 100,
    detection_timeout: 5000,
    health_check_interval: 5000,
    enable_sentry: false,
    log_level: 'info',
    features: {
      clipboard_monitoring: true,
      auto_clear_clipboard: false,
    },
  };

  // Sample macOS platform config
  const mockMacOSConfig = {
    clipboard_poll_interval: 800,
    system_tray: {
      icon_size: 20,
    },
    keyboard_shortcut: 'Cmd+Shift+C',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock path.join to return predictable paths
    (path.join as jest.Mock).mockImplementation((...args) => args.join('/'));

    // Mock fs.readFileSync
    (fs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
      if (filePath.includes('defaults.json')) {
        return JSON.stringify(mockDefaults);
      }
      if (filePath.includes('macos.json')) {
        return JSON.stringify(mockMacOSConfig);
      }
      throw new Error(`File not found: ${filePath}`);
    });

    // Mock fs.existsSync
    (fs.existsSync as jest.Mock).mockImplementation((filePath: string) => {
      return filePath.includes('macos.json') || filePath.includes('defaults.json');
    });

    // Mock PlatformDetector.getPlatform to return darwin (macOS)
    (PlatformDetector.getPlatform as jest.Mock).mockReturnValue('darwin');

    // Mock electron-store instance
    mockStore = {
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'disabled_features') {
          return {};
        }
        if (key === 'user_config') {
          return {};
        }
        return defaultValue;
      }),
      set: jest.fn(),
      clear: jest.fn(),
    } as any;

    // Mock the Store constructor
    (Store as jest.MockedClass<typeof Store>).mockImplementation(() => mockStore);

    configService = new ConfigService();
  });

  describe('Load defaults from config/defaults.json', () => {
    it('should load default configuration from defaults.json', () => {
      const config = configService.getAllConfig();
      // Platform override (macOS: 800) takes precedence over default (1000)
      expect(config.clipboard_poll_interval).toBe(800);
      expect(config.auto_clear_delay).toBe(1500);
      expect(config.max_history).toBe(100);
    });

    it('should handle missing defaults.json gracefully', () => {
      (fs.readFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('File not found');
      });

      const newService = new ConfigService();
      const config = newService.getAllConfig();

      // Should return fallback defaults
      expect(config.clipboard_poll_interval).toBeDefined();
      expect(config.auto_clear_delay).toBeDefined();
    });

    it('should handle invalid JSON in defaults.json', () => {
      (fs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes('defaults.json')) {
          return 'invalid json {';
        }
        throw new Error('File not found');
      });

      expect(() => {
        new ConfigService();
      }).not.toThrow();
    });

    it('should merge nested objects from defaults', () => {
      const config = configService.getAllConfig();
      expect(config.features).toEqual({
        clipboard_monitoring: true,
        auto_clear_clipboard: false,
      });
    });
  });

  describe('Load platform overrides (macOS)', () => {
    it('should load platform-specific overrides for macOS', () => {
      const config = configService.getAllConfig();
      expect(config.clipboard_poll_interval).toBe(800);
      expect(config.keyboard_shortcut).toBe('Cmd+Shift+C');
    });

    it('should merge platform config with defaults', () => {
      const config = configService.getAllConfig();
      // From defaults
      expect(config.auto_clear_delay).toBe(1500);
      // From macOS override
      expect(config.clipboard_poll_interval).toBe(800);
    });

    it('should load windows config when platform is win32', () => {
      (PlatformDetector.getPlatform as jest.Mock).mockReturnValue('win32');
      (fs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes('defaults.json')) {
          return JSON.stringify(mockDefaults);
        }
        if (filePath.includes('windows.json')) {
          return JSON.stringify({ clipboard_poll_interval: 1200 });
        }
        throw new Error(`File not found: ${filePath}`);
      });
      (fs.existsSync as jest.Mock).mockImplementation((filePath: string) => {
        return filePath.includes('windows.json') || filePath.includes('defaults.json');
      });

      const newService = new ConfigService();
      const config = newService.getAllConfig();
      expect(config.clipboard_poll_interval).toBe(1200);
    });

    it('should load linux config when platform is linux', () => {
      (PlatformDetector.getPlatform as jest.Mock).mockReturnValue('linux');
      (fs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes('defaults.json')) {
          return JSON.stringify(mockDefaults);
        }
        if (filePath.includes('linux.json')) {
          return JSON.stringify({ clipboard_poll_interval: 900 });
        }
        throw new Error(`File not found: ${filePath}`);
      });
      (fs.existsSync as jest.Mock).mockImplementation((filePath: string) => {
        return filePath.includes('linux.json') || filePath.includes('defaults.json');
      });

      const newService = new ConfigService();
      const config = newService.getAllConfig();
      expect(config.clipboard_poll_interval).toBe(900);
    });

    it('should handle missing platform config file gracefully', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      expect(() => {
        new ConfigService();
      }).not.toThrow();
    });
  });

  describe('getConfig(key) with dot notation', () => {
    it('should get top-level configuration values', () => {
      const value = configService.getConfig('clipboard_poll_interval');
      expect(value).toBe(800); // macOS override
    });

    it('should support nested dot notation access', () => {
      const value = configService.getConfig('features.clipboard_monitoring');
      expect(value).toBe(true);
    });

    it('should support deep nested access', () => {
      const value = configService.getConfig('system_tray.icon_size');
      expect(value).toBe(20);
    });

    it('should return undefined for non-existent keys', () => {
      const value = configService.getConfig('non_existent_key');
      expect(value).toBeUndefined();
    });

    it('should return platform override when available', () => {
      const value = configService.getConfig('clipboard_poll_interval');
      expect(value).toBe(800); // macOS override, not default 1000
    });

    it('should fall back to default when platform override not present', () => {
      const value = configService.getConfig('auto_clear_delay');
      expect(value).toBe(1500); // From defaults
    });

    it('should handle dot notation with missing intermediate keys', () => {
      const value = configService.getConfig('non.existent.path');
      expect(value).toBeUndefined();
    });
  });

  describe('setConfig(key, value) persists to electron-store', () => {
    it('should set configuration value in electron-store', () => {
      mockStore.get.mockReturnValue({});

      configService.setConfig('custom_key', 'custom_value');

      expect(mockStore.set).toHaveBeenCalledWith(
        'user_config',
        expect.objectContaining({
          custom_key: 'custom_value',
        })
      );
    });

    it('should persist multiple configuration values', () => {
      mockStore.get.mockReturnValue({});

      configService.setConfig('key1', 'value1');
      configService.setConfig('key2', 123);

      expect(mockStore.set).toHaveBeenCalledTimes(2);
    });

    it('should merge with existing user config', () => {
      const existingConfig = { existing_key: 'existing_value' };
      mockStore.get.mockReturnValueOnce(existingConfig);

      configService.setConfig('new_key', 'new_value');

      expect(mockStore.set).toHaveBeenCalledWith(
        'user_config',
        expect.objectContaining({
          existing_key: 'existing_value',
          new_key: 'new_value',
        })
      );
    });

    it('should accept various value types', () => {
      mockStore.get.mockReturnValue({});

      configService.setConfig('string_val', 'test');
      configService.setConfig('number_val', 42);
      configService.setConfig('boolean_val', true);
      configService.setConfig('object_val', { nested: 'value' });

      expect(mockStore.set).toHaveBeenCalledTimes(4);
    });

    it('should overwrite existing keys', () => {
      const existingConfig = { key: 'old_value' };
      mockStore.get.mockReturnValueOnce(existingConfig);

      configService.setConfig('key', 'new_value');

      expect(mockStore.set).toHaveBeenCalledWith(
        'user_config',
        expect.objectContaining({
          key: 'new_value',
        })
      );
    });
  });

  describe('disableFeature(feature, reason) and enableFeature(feature)', () => {
    it('should disable a feature with a reason', () => {
      configService.disableFeature('clipboard_monitoring', 'Testing');

      const disabled = configService.getDisabledFeatures();
      expect(disabled.length).toBe(1);
      expect(disabled[0].feature).toBe('clipboard_monitoring');
      expect(disabled[0].disabled).toBe(true);
      expect(disabled[0].reason).toBe('Testing');
    });

    it('should disable a feature without a reason', () => {
      configService.disableFeature('clipboard_monitoring');

      const disabled = configService.getDisabledFeatures();
      expect(disabled[0].reason).toBeUndefined();
    });

    it('should record disabledAt timestamp', () => {
      const beforeTime = Date.now();
      configService.disableFeature('clipboard_monitoring');
      const afterTime = Date.now();

      const disabled = configService.getDisabledFeatures();
      expect(disabled[0].disabledAt).toBeGreaterThanOrEqual(beforeTime);
      expect(disabled[0].disabledAt).toBeLessThanOrEqual(afterTime);
    });

    it('should enable a previously disabled feature', () => {
      configService.disableFeature('clipboard_monitoring');
      configService.enableFeature('clipboard_monitoring');

      const disabled = configService.getDisabledFeatures();
      expect(disabled.length).toBe(0);
    });

    it('should set enabled flag to true when enabling', () => {
      configService.disableFeature('clipboard_monitoring');
      configService.enableFeature('clipboard_monitoring');

      const state = configService.getDisabledFeatureInfo('clipboard_monitoring');
      expect(state?.enabled).toBe(true);
      expect(state?.disabled).toBe(false);
    });

    it('should persist feature toggle state to store', () => {
      mockStore.get.mockReturnValue({});
      configService.disableFeature('clipboard_monitoring');

      expect(mockStore.set).toHaveBeenCalledWith(
        'disabled_features',
        expect.objectContaining({
          clipboard_monitoring: expect.any(Object),
        })
      );
    });

    it('should disable multiple features independently', () => {
      configService.disableFeature('feature1', 'Reason 1');
      configService.disableFeature('feature2', 'Reason 2');

      const disabled = configService.getDisabledFeatures();
      expect(disabled.length).toBe(2);
    });

    it('should not enable a feature that was never disabled', () => {
      configService.enableFeature('never_disabled');

      const disabled = configService.getDisabledFeatures();
      expect(disabled.length).toBe(0);
    });
  });

  describe('getDisabledFeatures() returns disabled list', () => {
    it('should return empty list when no features are disabled', () => {
      const disabled = configService.getDisabledFeatures();
      expect(disabled).toEqual([]);
    });

    it('should return only disabled features', () => {
      configService.disableFeature('feature1');
      configService.disableFeature('feature2');
      configService.disableFeature('feature3');

      const disabled = configService.getDisabledFeatures();
      expect(disabled.length).toBe(3);
    });

    it('should exclude enabled features from list', () => {
      configService.disableFeature('feature1');
      configService.disableFeature('feature2');
      configService.enableFeature('feature1');

      const disabled = configService.getDisabledFeatures();
      expect(disabled.length).toBe(1);
      expect(disabled[0].feature).toBe('feature2');
    });

    it('should return features with complete state information', () => {
      configService.disableFeature('test_feature', 'Test reason');

      const disabled = configService.getDisabledFeatures();
      expect(disabled[0]).toHaveProperty('feature');
      expect(disabled[0]).toHaveProperty('enabled');
      expect(disabled[0]).toHaveProperty('disabled');
      expect(disabled[0]).toHaveProperty('disabledAt');
      expect(disabled[0]).toHaveProperty('reason');
    });
  });

  describe('resetToDefaults() clears all overrides', () => {
    it('should clear all user configuration', () => {
      mockStore.get.mockReturnValue({});

      configService.setConfig('key1', 'value1');
      configService.resetToDefaults();

      expect(mockStore.clear).toHaveBeenCalled();
    });

    it('should clear all disabled features', () => {
      configService.disableFeature('feature1');
      configService.disableFeature('feature2');

      configService.resetToDefaults();

      const disabled = configService.getDisabledFeatures();
      expect(disabled.length).toBe(0);
    });

    it('should reset both user config and disabled features', () => {
      mockStore.get.mockReturnValue({});

      configService.setConfig('key1', 'value1');
      configService.disableFeature('feature1');

      configService.resetToDefaults();

      expect(mockStore.clear).toHaveBeenCalled();
      expect(configService.getDisabledFeatures().length).toBe(0);
    });

    it('should not affect default configuration', () => {
      configService.resetToDefaults();

      const config = configService.getAllConfig();
      expect(config.clipboard_poll_interval).toBe(800); // Still has platform override
    });
  });

  describe('reload() refreshes from disk', () => {
    it('should reload defaults from disk', () => {
      const newDefaults = { clipboard_poll_interval: 2000, test_key: 'test' };

      (fs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes('defaults.json')) {
          return JSON.stringify(newDefaults);
        }
        if (filePath.includes('macos.json')) {
          return JSON.stringify(mockMacOSConfig);
        }
        throw new Error('File not found');
      });

      configService.reload();

      const config = configService.getAllConfig();
      expect(config.test_key).toBe('test');
    });

    it('should reload platform config from disk', () => {
      const newPlatformConfig = { clipboard_poll_interval: 500 };

      (fs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes('defaults.json')) {
          return JSON.stringify(mockDefaults);
        }
        if (filePath.includes('macos.json')) {
          return JSON.stringify(newPlatformConfig);
        }
        throw new Error('File not found');
      });

      configService.reload();

      const config = configService.getAllConfig();
      expect(config.clipboard_poll_interval).toBe(500);
    });

    it('should reload disabled features from store', () => {
      const storedDisabledFeatures = {
        feature1: {
          feature: 'feature1',
          enabled: false,
          disabled: true,
          disabledAt: 1234567890,
          reason: 'Stored reason',
        },
      };

      mockStore.get.mockImplementation((key: string) => {
        if (key === 'disabled_features') {
          return storedDisabledFeatures;
        }
        return {};
      });

      configService.reload();

      const disabled = configService.getDisabledFeatures();
      expect(disabled.length).toBe(1);
      expect(disabled[0].reason).toBe('Stored reason');
    });

    it('should apply reload updates to getConfig results', () => {
      const newDefaults = {
        ...mockDefaults,
        auto_clear_delay: 3000,
      };

      (fs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes('defaults.json')) {
          return JSON.stringify(newDefaults);
        }
        if (filePath.includes('macos.json')) {
          return JSON.stringify(mockMacOSConfig);
        }
        throw new Error('File not found');
      });

      configService.reload();

      const value = configService.getConfig('auto_clear_delay');
      expect(value).toBe(3000);
    });
  });

  describe('Feature toggle enable/disable state', () => {
    it('should check if feature is enabled by default', () => {
      const enabled = configService.getFeatureEnabled('any_feature');
      expect(enabled).toBe(true);
    });

    it('should return false for disabled features', () => {
      configService.disableFeature('test_feature');

      const enabled = configService.getFeatureEnabled('test_feature');
      expect(enabled).toBe(false);
    });

    it('should return true for re-enabled features', () => {
      configService.disableFeature('test_feature');
      configService.enableFeature('test_feature');

      const enabled = configService.getFeatureEnabled('test_feature');
      expect(enabled).toBe(true);
    });

    it('should provide feature info with getDisabledFeatureInfo', () => {
      configService.disableFeature('test_feature', 'Test reason');

      const info = configService.getDisabledFeatureInfo('test_feature');
      expect(info).not.toBeUndefined();
      expect(info?.feature).toBe('test_feature');
      expect(info?.reason).toBe('Test reason');
    });

    it('should return undefined for non-disabled features', () => {
      const info = configService.getDisabledFeatureInfo('never_disabled');
      expect(info).toBeUndefined();
    });
  });

  describe('Error handling for missing config files', () => {
    it('should use fallback defaults when defaults.json is missing', () => {
      (fs.readFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const newService = new ConfigService();
      const config = newService.getAllConfig();

      // Should have fallback values
      expect(config.clipboard_poll_interval).toBe(1000);
      expect(config.enable_sentry).toBe(false);
    });

    it('should handle corrupted JSON in defaults.json', () => {
      (fs.readFileSync as jest.Mock).mockImplementation(() => {
        throw new SyntaxError('Unexpected token } in JSON at position 0');
      });

      expect(() => {
        new ConfigService();
      }).not.toThrow();
    });

    it('should continue when platform config file is missing', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      expect(() => {
        new ConfigService();
      }).not.toThrow();
    });

    it('should continue when platform config has errors', () => {
      (fs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes('defaults.json')) {
          return JSON.stringify(mockDefaults);
        }
        if (filePath.includes('macos.json')) {
          throw new Error('Read error');
        }
        throw new Error('File not found');
      });

      expect(() => {
        new ConfigService();
      }).not.toThrow();
    });

    it('should return sensible defaults from fallback', () => {
      (fs.readFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('File system error');
      });

      const newService = new ConfigService();
      const config = newService.getAllConfig();

      expect(config.clipboard_poll_interval).toBeDefined();
      expect(config.auto_clear_delay).toBeDefined();
      expect(config.max_history).toBeDefined();
      expect(config.detection_timeout).toBeDefined();
      expect(config.health_check_interval).toBeDefined();
      expect(config.enable_sentry).toBeDefined();
    });
  });

  describe('Config priority and merging', () => {
    it('should apply priority: user > platform > defaults', () => {
      mockStore.get.mockImplementation((key: string) => {
        if (key === 'user_config') {
          return { clipboard_poll_interval: 500 };
        }
        return {};
      });

      const newService = new ConfigService();
      const config = newService.getAllConfig();

      // User config should win over platform config (800) and defaults (1000)
      expect(config.clipboard_poll_interval).toBe(500);
    });

    it('should merge configs without overwriting unset keys', () => {
      const config = configService.getAllConfig();

      // From defaults
      expect(config.auto_clear_delay).toBe(1500);
      // From platform
      expect(config.keyboard_shortcut).toBe('Cmd+Shift+C');
      // Both layers present
      expect(config.clipboard_poll_interval).toBe(800);
    });
  });

  describe('Store integration', () => {
    it('should initialize Store with correct name', () => {
      configService = new ConfigService();

      expect(Store).toHaveBeenCalledWith({ name: 'clipguard-config' });
    });

    it('should load disabled features from store on initialization', () => {
      mockStore.get.mockImplementation((key: string) => {
        if (key === 'disabled_features') {
          return {
            feature1: {
              feature: 'feature1',
              enabled: false,
              disabled: true,
            },
          };
        }
        return {};
      });

      const newService = new ConfigService();
      const disabled = newService.getDisabledFeatures();

      expect(disabled.length).toBe(1);
      expect(mockStore.get).toHaveBeenCalledWith('disabled_features', {});
    });
  });
});
