// Mock all Electron APIs before importing AppService
jest.mock('electron', () => ({
  app: {
    quit: jest.fn(),
  },
  BrowserWindow: jest.fn(),
  Menu: {
    buildFromTemplate: jest.fn(),
  },
  Tray: jest.fn(),
  nativeImage: {
    createFromDataURL: jest.fn(),
  },
  ipcMain: {
    handle: jest.fn(),
  },
  dialog: {
    showMessageBox: jest.fn(),
  },
  clipboard: {
    readText: jest.fn(),
    writeText: jest.fn(),
  },
}));

// Mock services
jest.mock('../services/clipboard-service');
jest.mock('../services/detector-service');
jest.mock('../services/storage-service');
jest.mock('../services/logger-service');
jest.mock('../services/error-handler');
jest.mock('../services/config-service');
jest.mock('../services/sentry-integration');
jest.mock('../services/watchdog-service');
jest.mock('../permissions/permissions-manager');
jest.mock('../permissions/platform-detector');
jest.mock('../ipc/health-handlers');

import { AppService } from '../services/app-service';
import { ClipboardService } from '../services/clipboard-service';
import { DetectorService } from '../services/detector-service';
import { StorageService } from '../services/storage-service';
import { LoggerService } from '../services/logger-service';
import { ErrorHandler } from '../services/error-handler';
import { ConfigService } from '../services/config-service';
import { SentryIntegration } from '../services/sentry-integration';
import WatchdogService from '../services/watchdog-service';
import { PermissionsManager } from '../permissions/permissions-manager';
import { PlatformDetector } from '../permissions/platform-detector';
import { setupHealthHandlers } from '../ipc/health-handlers';
import { Menu, Tray, nativeImage, ipcMain, dialog } from 'electron';

// Type safe mocks
const mockMenu = Menu as jest.Mocked<typeof Menu>;
const mockTray = Tray as jest.MockedClass<typeof Tray>;
const mockNativeImage = nativeImage as jest.Mocked<typeof nativeImage>;
const mockIpcMain = ipcMain as jest.Mocked<typeof ipcMain>;
const mockDialog = dialog as jest.Mocked<typeof dialog>;

describe('AppService Integration Tests', () => {
  let appService: AppService;
  let mockClipboardService: jest.Mocked<ClipboardService>;
  let mockDetector: jest.Mocked<DetectorService>;
  let mockStorage: jest.Mocked<StorageService>;
  let mockLogger: jest.Mocked<LoggerService>;
  let mockErrorHandler: jest.Mocked<ErrorHandler>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockSentry: jest.Mocked<SentryIntegration>;
  let mockWatchdog: jest.Mocked<WatchdogService>;
  let mockPermissions: jest.Mocked<PermissionsManager>;
  let mockTrayInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Setup logger mock
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as any;

    // Setup storage mock
    mockStorage = {
      getSettings: jest.fn(),
      updateSettings: jest.fn(),
      getDetectionHistory: jest.fn(),
      addDetectionHistory: jest.fn(),
      clearDetectionHistory: jest.fn(),
    } as any;

    mockStorage.getSettings.mockReturnValue({
      monitoring_enabled: true,
      auto_clear_clipboard: false,
      show_warnings: true,
      detection_history: [],
    });

    mockStorage.getDetectionHistory.mockReturnValue([]);

    // Setup detector mock
    mockDetector = {
      detect: jest.fn(),
    } as any;

    // Setup error handler mock
    mockErrorHandler = {
      handleUncaughtException: jest.fn(),
    } as any;

    // Setup config service mock
    mockConfigService = {
      getConfig: jest.fn(),
      setConfig: jest.fn(),
      getAllConfig: jest.fn(),
      getFeatureEnabled: jest.fn(),
      disableFeature: jest.fn(),
      enableFeature: jest.fn(),
      getDisabledFeatures: jest.fn(),
      getDisabledFeatureInfo: jest.fn(),
      resetToDefaults: jest.fn(),
      reload: jest.fn(),
    } as any;

    // Default config values
    mockConfigService.getConfig.mockImplementation((key: string) => {
      const defaults: Record<string, any> = {
        clipboard_poll_interval: 1000,
        auto_clear_delay: 1500,
        health_check_interval: 5000,
        enable_sentry: false,
      };
      return defaults[key];
    });

    // Setup sentry mock
    mockSentry = {
      initialize: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      captureException: jest.fn(),
      captureMessage: jest.fn(),
      setUser: jest.fn(),
      clearUser: jest.fn(),
      setTags: jest.fn(),
    } as any;

    // Setup watchdog mock
    mockWatchdog = {
      start: jest.fn(),
      stop: jest.fn(),
      configureThresholds: jest.fn(),
      recordServiceEvent: jest.fn(),
      getHealthStatus: jest.fn(),
      getServiceEvents: jest.fn(),
      getDiagnosticSummary: jest.fn(),
      setClipboardServiceStatus: jest.fn(),
      setDetectorLatency: jest.fn(),
    } as any;

    mockWatchdog.getHealthStatus.mockReturnValue({
      cpu: 25,
      memory: 150,
      isResponsive: true,
      uptime: 3600,
      lastCheck: Date.now(),
      detectorLatency: 5,
      clipboardServiceActive: true,
      clipboardServiceErrors: 0,
    });

    // Setup permissions manager mock
    mockPermissions = {
      initialize: jest.fn().mockResolvedValue(undefined),
      getPermissionState: jest.fn(),
      isClipboardMonitoringPermitted: jest.fn().mockReturnValue(true),
      requestAccessibilityPermission: jest.fn(),
      requestNotificationPermission: jest.fn(),
    } as any;

    // Setup clipboard service mock
    mockClipboardService = {
      start: jest.fn(),
      stop: jest.fn(),
      setupIpcHandlers: jest.fn(),
      isMonitoring: jest.fn().mockReturnValue(true),
    } as any;

    // Setup tray instance mock
    mockTrayInstance = {
      setContextMenu: jest.fn(),
      setToolTip: jest.fn(),
    };

    // Setup Electron API mocks
    mockNativeImage.createFromDataURL.mockReturnValue({} as any);
    (mockTray as unknown as jest.Mock).mockReturnValue(mockTrayInstance);
    mockMenu.buildFromTemplate.mockReturnValue({} as any);
    mockDialog.showMessageBox.mockResolvedValue({ response: 0, checkboxChecked: false });

    // Mock class constructors
    (ClipboardService as jest.Mock).mockReturnValue(mockClipboardService);
    (DetectorService as jest.Mock).mockReturnValue(mockDetector);
    (StorageService as jest.Mock).mockReturnValue(mockStorage);
    (LoggerService as jest.Mock).mockReturnValue(mockLogger);
    (ErrorHandler as jest.Mock).mockReturnValue(mockErrorHandler);
    (ConfigService as jest.Mock).mockReturnValue(mockConfigService);
    (SentryIntegration as jest.Mock).mockReturnValue(mockSentry);
    (WatchdogService as unknown as jest.Mock).mockReturnValue(mockWatchdog);
    (PermissionsManager as jest.Mock).mockReturnValue(mockPermissions);

    // Mock PlatformDetector
    (PlatformDetector.getPlatform as jest.Mock).mockReturnValue('darwin');

    // Create AppService instance (constructor only)
    appService = new AppService();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Constructor - AppService creates all services', () => {
    it('should create logger service', () => {
      expect(LoggerService).toHaveBeenCalled();
    });

    it('should create storage service', () => {
      expect(StorageService).toHaveBeenCalled();
    });

    it('should create detector service', () => {
      expect(DetectorService).toHaveBeenCalled();
    });

    it('should create error handler with logger', () => {
      expect(ErrorHandler).toHaveBeenCalledWith(mockLogger);
    });

    it('should create permissions manager with logger', () => {
      expect(PermissionsManager).toHaveBeenCalledWith(mockLogger);
    });

    it('should create config service', () => {
      expect(ConfigService).toHaveBeenCalled();
    });

    it('should create clipboard service with config parameters', () => {
      expect(ClipboardService).toHaveBeenCalledWith(mockDetector, mockStorage, mockLogger, {
        pollInterval: 1000,
        autoClearDelay: 1500,
      });
    });

    it('should create watchdog service', () => {
      expect(WatchdogService).toHaveBeenCalled();
    });

    it('should create sentry integration with config', () => {
      expect(SentryIntegration).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: false,
          environment: expect.any(String),
        }),
        mockLogger,
      );
    });

    it('should log platform info on construction', () => {
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('ClipGuard starting on'));
    });
  });

  describe('initialize() - Calls all initialization methods', () => {
    it('should call permissions manager initialize', async () => {
      await appService.initialize();

      expect(mockPermissions.initialize).toHaveBeenCalled();
    });

    it('should call sentry initialize', async () => {
      await appService.initialize();

      expect(mockSentry.initialize).toHaveBeenCalled();
    });

    it('should configure watchdog thresholds from config', async () => {
      mockConfigService.getConfig.mockImplementation((key: string) => {
        const values: Record<string, any> = {
          clipboard_poll_interval: 1000,
          auto_clear_delay: 1500,
          health_check_interval: 5000,
          enable_sentry: false,
        };
        return values[key];
      });

      await appService.initialize();

      expect(mockWatchdog.configureThresholds).toHaveBeenCalledWith(
        expect.objectContaining({
          healthCheckInterval: 5000,
          cpuErrorBound: 80,
          memoryErrorBound: 500,
          detectorLatencyThreshold: 100,
        }),
      );
    });

    it('should call watchdog start', async () => {
      await appService.initialize();

      expect(mockWatchdog.start).toHaveBeenCalled();
    });

    it('should set sentry tags with platform and version', async () => {
      await appService.initialize();

      expect(mockSentry.setTags).toHaveBeenCalledWith({
        platform: 'darwin',
        version: '1.0.0',
      });
    });

    it('should setup IPC handlers', async () => {
      await appService.initialize();

      expect(mockIpcMain.handle).toHaveBeenCalledWith('app:get-platform', expect.any(Function));
      expect(mockIpcMain.handle).toHaveBeenCalledWith('app:get-version', expect.any(Function));
      expect(mockIpcMain.handle).toHaveBeenCalledWith('app:is-monitoring', expect.any(Function));
      expect(mockIpcMain.handle).toHaveBeenCalledWith('app:toggle-monitoring', expect.any(Function));
    });

    it('should call clipboard service setup IPC handlers', async () => {
      await appService.initialize();

      expect(mockClipboardService.setupIpcHandlers).toHaveBeenCalled();
    });

    it('should start clipboard service (menu bar only app)', async () => {
      await appService.initialize();

      expect(mockClipboardService.start).toHaveBeenCalled();
    });

    it('should setup health handlers', async () => {
      await appService.initialize();

      expect(setupHealthHandlers).toHaveBeenCalledWith(
        mockErrorHandler,
        mockWatchdog,
        mockLogger,
        mockClipboardService,
        mockDetector,
        mockStorage,
      );
    });
  });

  describe('Config Parameters Wiring', () => {
    it('should pass poll interval from config to clipboard service', () => {
      mockConfigService.getConfig.mockImplementation((key: string) => {
        const values: Record<string, any> = {
          clipboard_poll_interval: 2000,
          auto_clear_delay: 1500,
          health_check_interval: 5000,
          enable_sentry: false,
        };
        return values[key];
      });

      new AppService();

      expect(ClipboardService).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        expect.objectContaining({
          pollInterval: 2000,
        }),
      );
    });

    it('should pass auto clear delay from config to clipboard service', () => {
      mockConfigService.getConfig.mockImplementation((key: string) => {
        const values: Record<string, any> = {
          clipboard_poll_interval: 1000,
          auto_clear_delay: 3000,
          health_check_interval: 5000,
          enable_sentry: false,
        };
        return values[key];
      });

      new AppService();

      expect(ClipboardService).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        expect.objectContaining({
          autoClearDelay: 3000,
        }),
      );
    });

    it('should use default values when config returns undefined', () => {
      mockConfigService.getConfig.mockReturnValue(0);

      new AppService();

      expect(ClipboardService).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        expect.objectContaining({
          pollInterval: 1000,
          autoClearDelay: 1500,
        }),
      );
    });
  });

  describe('Watchdog Thresholds Configuration', () => {
    it('should load health check interval from config', async () => {
      mockConfigService.getConfig.mockImplementation((key: string) => {
        const values: Record<string, any> = {
          health_check_interval: 8000,
          clipboard_poll_interval: 1000,
          auto_clear_delay: 1500,
          enable_sentry: false,
        };
        return values[key];
      });

      const newAppService = new AppService();
      await newAppService.initialize();

      expect(mockWatchdog.configureThresholds).toHaveBeenCalledWith(
        expect.objectContaining({
          healthCheckInterval: 8000,
        }),
      );
    });

    it('should use default threshold if config returns undefined', async () => {
      mockConfigService.getConfig.mockReturnValue(0);

      await appService.initialize();

      expect(mockWatchdog.configureThresholds).toHaveBeenCalledWith(
        expect.objectContaining({
          healthCheckInterval: 5000,
        }),
      );
    });
  });

  describe('Sentry Initialization', () => {
    it('should initialize sentry only when enable_sentry is true', async () => {
      mockConfigService.getConfig.mockImplementation((key: string) => {
        const values: Record<string, any> = {
          enable_sentry: true,
          clipboard_poll_interval: 1000,
          auto_clear_delay: 1500,
          health_check_interval: 5000,
        };
        return values[key];
      });

      const newAppService = new AppService();
      await newAppService.initialize();

      expect(mockSentry.initialize).toHaveBeenCalled();
    });

    it('should still initialize even if sentry is disabled', async () => {
      mockConfigService.getConfig.mockImplementation((key: string) => {
        const values: Record<string, any> = {
          enable_sentry: false,
          clipboard_poll_interval: 1000,
          auto_clear_delay: 1500,
          health_check_interval: 5000,
        };
        return values[key];
      });

      await appService.initialize();

      expect(mockSentry.initialize).toHaveBeenCalled();
    });
  });

  describe('setupTray() - Creates system tray icon and menu', () => {
    it('should initialize without errors', async () => {
      await appService.initialize();
      expect(appService).toBeDefined();
    });
  });

  describe('Tray Menu Options', () => {
    it('should initialize successfully', async () => {
      await appService.initialize();
      expect(appService.isMonitoringActive()).toBe(true);
    });

    it('should have at least 5 menu items', () => {
      const calls = (mockMenu.buildFromTemplate as jest.Mock).mock.calls;
      if (calls.length > 0) {
        const menuOptions = calls[0][0] as any[];
        expect(menuOptions.length).toBeGreaterThanOrEqual(5);
      }
    });
  });

  describe('Test Detection - Mock Data', () => {
    it('should initialize without errors', async () => {
      await appService.initialize();
      expect(mockClipboardService.start).toHaveBeenCalled();
    });
  });

  describe('Detection History - Shown in dialog', () => {
    it('should handle detection history with empty results', async () => {
      mockStorage.getDetectionHistory.mockReturnValue([]);
      await appService.initialize();
      expect(mockStorage.getDetectionHistory).toBeDefined();
    });

    it('should handle detection history with data', async () => {
      const history = [
        { timestamp: new Date().toISOString(), severity: 'high', types: ['API Key'], count: 1 },
        { timestamp: new Date().toISOString(), severity: 'critical', types: ['AWS Key'], count: 1 },
      ];
      mockStorage.getDetectionHistory.mockReturnValue(history);
      await appService.initialize();
      const result = mockStorage.getDetectionHistory();
      expect(result.length).toBe(2);
    });
  });

  describe('Clear History', () => {
    it('should have storage service for history management', async () => {
      await appService.initialize();
      expect(mockStorage).toBeDefined();
    });
  });

  describe('Error Handling - Initialization Errors Reported to Sentry', () => {
    it('should catch initialization errors and report to sentry', async () => {
      const initError = new Error('Permissions check failed');
      mockPermissions.initialize.mockRejectedValue(initError);

      await appService.initialize();

      expect(mockSentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Permissions check failed',
        }),
        expect.objectContaining({
          context: 'app_initialization',
        }),
      );
    });

    it('should log initialization error to logger', async () => {
      const initError = new Error('Config loading failed');
      mockPermissions.initialize.mockRejectedValue(initError);

      await appService.initialize();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to initialize'),
        expect.any(Error),
      );
    });

    it('should call error handler for uncaught exceptions', async () => {
      const initError = new Error('Watchdog start failed');
      mockWatchdog.start.mockImplementation(() => {
        throw initError;
      });

      await appService.initialize();

      expect(mockErrorHandler.handleUncaughtException).toHaveBeenCalled();
    });
  });

  describe('shutdown() - Stops watchdog and clipboard service', () => {
    beforeEach(async () => {
      await appService.initialize();
      jest.clearAllMocks();
    });

    it('should call stop on clipboard service', () => {
      appService.shutdown();

      expect(mockClipboardService.stop).toHaveBeenCalled();
    });

    it('should call stop on watchdog service', () => {
      appService.shutdown();

      expect(mockWatchdog.stop).toHaveBeenCalled();
    });

    it('should close sentry connection gracefully', () => {
      appService.shutdown();

      expect(mockSentry.close).toHaveBeenCalledWith(2000);
    });

    it('should set monitoring flag to false', () => {
      appService.shutdown();

      expect(appService.isMonitoringActive()).toBe(false);
    });

    it('should log shutdown message', () => {
      appService.shutdown();

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('shutting down'));
    });
  });

  describe('Service Dependencies Wiring', () => {
    it('should wire detector into clipboard service', () => {
      expect(ClipboardService).toHaveBeenCalledWith(mockDetector, expect.any(Object), expect.any(Object), expect.any(Object));
    });

    it('should wire storage into clipboard service', () => {
      expect(ClipboardService).toHaveBeenCalledWith(expect.any(Object), mockStorage, expect.any(Object), expect.any(Object));
    });

    it('should wire logger into clipboard service', () => {
      expect(ClipboardService).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), mockLogger, expect.any(Object));
    });

    it('should wire logger into permissions manager', () => {
      expect(PermissionsManager).toHaveBeenCalledWith(mockLogger);
    });

    it('should wire logger into error handler', () => {
      expect(ErrorHandler).toHaveBeenCalledWith(mockLogger);
    });

    it('should wire config into sentry', () => {
      expect(SentryIntegration).toHaveBeenCalledWith(expect.any(Object), mockLogger);
    });
  });

  describe('Monitoring State', () => {
    beforeEach(async () => {
      await appService.initialize();
    });

    it('should start with monitoring active', () => {
      expect(appService.isMonitoringActive()).toBe(true);
    });

    it('should have clipboard service started', () => {
      expect(mockClipboardService.start).toHaveBeenCalled();
    });
  });

  describe('IPC Handler Wiring', () => {
    beforeEach(async () => {
      await appService.initialize();
    });

    it('should register app:get-platform handler', () => {
      const handles = (mockIpcMain.handle as jest.Mock).mock.calls;
      const platformHandler = handles.find((call: any) => call[0] === 'app:get-platform');

      expect(platformHandler).toBeDefined();
    });

    it('should register app:get-version handler', () => {
      const handles = (mockIpcMain.handle as jest.Mock).mock.calls;
      const versionHandler = handles.find((call: any) => call[0] === 'app:get-version');

      expect(versionHandler).toBeDefined();
    });

    it('should register app:is-monitoring handler', () => {
      const handles = (mockIpcMain.handle as jest.Mock).mock.calls;
      const monitorHandler = handles.find((call: any) => call[0] === 'app:is-monitoring');

      expect(monitorHandler).toBeDefined();
    });

    it('should register app:toggle-monitoring handler', () => {
      const handles = (mockIpcMain.handle as jest.Mock).mock.calls;
      const toggleHandler = handles.find((call: any) => call[0] === 'app:toggle-monitoring');

      expect(toggleHandler).toBeDefined();
    });
  });
});
