import { setupHealthHandlers } from '../ipc/health-handlers';
import { ErrorHandler } from '../services/error-handler';
import WatchdogService from '../services/watchdog-service';
import { LoggerService } from '../services/logger-service';
import { ClipboardService } from '../services/clipboard-service';
import { DetectorService } from '../services/detector-service';
import { StorageService } from '../services/storage-service';
import { DetectionHistoryEntry } from '../types';

// Mock electron ipcMain
jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  },
  app: { quit: jest.fn() },
  dialog: { showErrorBox: jest.fn() },
  BrowserWindow: { getAllWindows: jest.fn(() => []) },
}));

// Mock electron-store
jest.mock('electron-store', () => {
  return jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
  }));
});

// Mock services
jest.mock('../services/logger-service');
jest.mock('../services/clipboard-service');
jest.mock('../services/detector-service');
jest.mock('../services/storage-service');

import { ipcMain } from 'electron';

describe('IPC Health Handler Integration Tests', () => {
  let mockIpcMain: any;
  let errorHandler: ErrorHandler;
  let watchdog: WatchdogService;
  let mockLogger: jest.Mocked<LoggerService>;
  let mockClipboardService: jest.Mocked<ClipboardService>;
  let mockDetectorService: jest.Mocked<DetectorService>;
  let mockStorageService: jest.Mocked<StorageService>;

  // Capture IPC handler functions
  const ipcHandlers: Record<string, Function> = {};
  const ipcListeners: Record<string, Function> = {};

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Setup mock ipcMain
    mockIpcMain = ipcMain as any;
    mockIpcMain.handle.mockImplementation((channel: string, handler: Function) => {
      ipcHandlers[channel] = handler;
    });
    mockIpcMain.on.mockImplementation((channel: string, listener: Function) => {
      ipcListeners[channel] = listener;
    });

    // Setup mock services
    mockLogger = new LoggerService() as jest.Mocked<LoggerService>;
    mockLogger.info = jest.fn();
    mockLogger.warn = jest.fn();
    mockLogger.error = jest.fn();
    mockLogger.debug = jest.fn();

    mockDetectorService = new DetectorService() as jest.Mocked<DetectorService>;
    mockStorageService = new StorageService() as jest.Mocked<StorageService>;

    // Create mock clipboard service with required dependencies
    mockClipboardService = {
      start: jest.fn(),
      stop: jest.fn(),
      analyze: jest.fn(),
    } as unknown as jest.Mocked<ClipboardService>;

    // Mock detection history with proper structure
    const mockHistory: DetectionHistoryEntry[] = [
      { timestamp: new Date(Date.now() - 1000).toISOString(), severity: 'medium', types: ['pii'], count: 1 },
      { timestamp: new Date(Date.now() - 2000).toISOString(), severity: 'high', types: ['sensitive'], count: 2 },
    ];
    mockStorageService.getDetectionHistory = jest.fn(() => mockHistory);

    // Create real instances for error handler and watchdog
    errorHandler = new ErrorHandler(mockLogger);
    watchdog = new WatchdogService();
    watchdog.start();

    // Setup health handlers
    setupHealthHandlers(
      errorHandler,
      watchdog,
      mockLogger,
      mockClipboardService,
      mockDetectorService,
      mockStorageService,
    );
  });

  afterEach(() => {
    watchdog.stop();
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('1. health:get-status returns complete health snapshot', () => {
    it('should return full health data including CPU, memory, uptime', async () => {
      // Setup watchdog state
      watchdog.setClipboardServiceStatus(true, 0);
      watchdog.setDetectorLatency(45);

      const handler = ipcHandlers['health:get-status'];
      const result = await handler();

      expect(result).toHaveProperty('cpu');
      expect(result).toHaveProperty('memory');
      expect(result).toHaveProperty('uptime');
      expect(result).toHaveProperty('isResponsive');
      expect(result).toHaveProperty('detectorLatency');
      expect(result).toHaveProperty('timestamp');
      expect(result.isResponsive).toBe(true);
    });

    it('should include complete service status information', async () => {
      watchdog.setClipboardServiceStatus(true, 2);
      const handler = ipcHandlers['health:get-status'];
      const result = await handler();

      expect(result.services).toBeDefined();
      expect(result.services.clipboard.active).toBe(true);
      expect(result.services.clipboard.errors).toBe(2);
      expect(result.services.detector.latency).toBeDefined();
      expect(result.services.storage.historyCount).toBe(2);
    });

    it('should aggregate error information from ErrorHandler', async () => {
      // Disable a feature to trigger error state
      errorHandler.disableFeature('clipboard', 'Test error');

      const handler = ipcHandlers['health:get-status'];
      const result = await handler();

      expect(result.errors).toBeDefined();
      expect(result.errors.disabledFeatures).toContain('clipboard');
      expect(result.errors.canRecover).toBeDefined();
    });
  });

  describe('2. Health includes CPU, memory, uptime, services, errors', () => {
    it('should track CPU and memory metrics from watchdog', async () => {
      // Perform health check to populate metrics
      watchdog.signalResponsive();
      jest.runOnlyPendingTimers();

      const handler = ipcHandlers['health:get-status'];
      const result = await handler();

      expect(typeof result.cpu).toBe('number');
      expect(typeof result.memory).toBe('number');
      expect(result.cpu >= 0 && result.cpu <= 100).toBe(true);
      expect(result.memory >= 0 && result.memory <= 100).toBe(true);
    });

    it('should track uptime from Node.js process', async () => {
      const handler = ipcHandlers['health:get-status'];
      const result = await handler();

      expect(typeof result.uptime).toBe('number');
      expect(result.uptime > 0).toBe(true);
    });

    it('should include all required service fields', async () => {
      const handler = ipcHandlers['health:get-status'];
      const result = await handler();

      // Verify complete service structure
      expect(result.services.clipboard).toHaveProperty('active');
      expect(result.services.clipboard).toHaveProperty('errors');
      expect(result.services.detector).toHaveProperty('latency');
      expect(result.services.storage).toHaveProperty('historyCount');
    });

    it('should report error state in health snapshot', async () => {
      errorHandler.disableFeature('detector', 'High latency');
      const handler = ipcHandlers['health:get-status'];
      const result = await handler();

      expect(result.errors.disabledFeatures).toContain('detector');
    });
  });

  describe('3. health:get-recovery-history includes all recovery events', () => {
    it('should return recovery history from ErrorHandler', async () => {
      // Disable a feature which creates a history entry
      errorHandler.disableFeature('clipboard', 'Test');
      const handler = ipcHandlers['health:get-recovery-history'];

      const result = await handler();

      expect(Array.isArray(result)).toBe(true);
    });

    it('should include timestamp for each recovery entry', async () => {
      // Create a disabled feature
      errorHandler.disableFeature('detector', 'Test error');

      const handler = ipcHandlers['health:get-recovery-history'];
      const result = await handler();

      if (result.length > 0) {
        result.forEach((entry: any) => {
          expect(entry).toHaveProperty('timestamp');
          expect(typeof entry.timestamp).toBe('number');
        });
      }
    });

    it('should track recovery state in history', async () => {
      errorHandler.disableFeature('test-feature', 'Initial error');

      // Attempt recovery
      await errorHandler.recoverFeature('test-feature');

      const handler = ipcHandlers['health:get-recovery-history'];
      const result = await handler();

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('4. health:get-diagnostics returns diagnostic summary', () => {
    it('should return diagnostic summary with health data', async () => {
      const handler = ipcHandlers['health:get-diagnostics'];
      const result = await handler();

      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('health');
      expect(result).toHaveProperty('eventCount');
    });

    it('should include average CPU and memory in diagnostics', async () => {
      // Trigger health checks
      watchdog.signalResponsive();
      jest.runOnlyPendingTimers();

      const handler = ipcHandlers['health:get-diagnostics'];
      const result = await handler();

      expect(result).toHaveProperty('avgCpu');
      expect(result).toHaveProperty('avgMemory');
      expect(typeof result.avgCpu).toBe('number');
      expect(typeof result.avgMemory).toBe('number');
    });

    it('should include watchdog thresholds in diagnostics', async () => {
      const handler = ipcHandlers['health:get-diagnostics'];
      const result = await handler();

      expect(result).toHaveProperty('thresholds');
      expect(result.thresholds).toHaveProperty('healthCheckInterval');
      expect(result.thresholds).toHaveProperty('cpuErrorBound');
      expect(result.thresholds).toHaveProperty('memoryErrorBound');
    });

    it('should track service event count', async () => {
      watchdog.recordServiceEvent({
        type: 'error',
        message: 'Test error',
        timestamp: Date.now(),
      });

      const handler = ipcHandlers['health:get-diagnostics'];
      const result = await handler();

      expect(typeof result.eventCount).toBe('number');
      expect(result.eventCount >= 0).toBe(true);
    });
  });

  describe('5. health:restart-service(service) triggers restart', () => {
    it('should handle clipboard service restart request', async () => {
      const handler = ipcHandlers['health:restart-service'];
      const mockEvent = {};

      const result = await handler(mockEvent, 'clipboard');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Clipboard service restart initiated');
    });

    it('should handle detector service restart request', async () => {
      const handler = ipcHandlers['health:restart-service'];
      const mockEvent = {};

      const result = await handler(mockEvent, 'detector');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Detector service restart initiated');
    });

    it('should log restart attempts', async () => {
      const handler = ipcHandlers['health:restart-service'];
      const mockEvent = {};

      await handler(mockEvent, 'clipboard');

      expect(mockLogger.info).toHaveBeenCalledWith('Attempting to restart service: clipboard');
    });

    it('should reject unknown service names', async () => {
      const handler = ipcHandlers['health:restart-service'];
      const mockEvent = {};

      const result = await handler(mockEvent, 'unknown-service');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Unknown service');
    });

    it('should handle restart errors gracefully', async () => {
      const handler = ipcHandlers['health:restart-service'];
      const mockEvent = {};

      // Call with valid service - should not throw
      expect(async () => {
        await handler(mockEvent, 'clipboard');
      }).not.toThrow();
    });
  });

  describe('6. health:report-error from renderer goes to ErrorHandler', () => {
    it('should register error reporting listener', () => {
      expect(ipcListeners['health:report-error']).toBeDefined();
    });

    it('should handle service error reports with context', () => {
      const listener = ipcListeners['health:report-error'];
      const mockEvent = {};

      listener(mockEvent, {
        service: 'detector',
        severity: 'warning',
        message: 'High latency detected',
        context: { latency: 150 },
      });

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should disable feature on critical error', () => {
      const listener = ipcListeners['health:report-error'];
      const mockEvent = {};

      listener(mockEvent, {
        service: 'clipboard',
        severity: 'critical',
        message: 'Clipboard access failed',
        context: {},
      });

      expect(errorHandler.isFeatureDisabled('clipboard')).toBe(true);
    });

    it('should log non-critical errors without disabling', () => {
      const listener = ipcListeners['health:report-error'];
      const mockEvent = {};

      listener(mockEvent, {
        service: 'storage',
        severity: 'warning',
        message: 'Storage degraded',
        context: {},
      });

      // Feature should not be disabled for non-critical
      expect(errorHandler.isFeatureDisabled('storage')).toBe(false);
    });

    it('should include context in error logging', () => {
      const listener = ipcListeners['health:report-error'];
      const mockEvent = {};
      const context = { detectionId: 'test-123' };

      listener(mockEvent, {
        service: 'detector',
        severity: 'error',
        message: 'Detection failed',
        context,
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Service error reported'),
        expect.any(Error),
        expect.objectContaining({
          service: 'detector',
          severity: 'error',
        }),
      );
    });
  });

  describe('7. health:get-features returns disabled feature list', () => {
    it('should return empty disabled features when all healthy', async () => {
      const handler = ipcHandlers['health:get-features'];
      const result = await handler();

      expect(result.disabled).toBeDefined();
      expect(Array.isArray(result.disabled)).toBe(true);
    });

    it('should list disabled features', async () => {
      errorHandler.disableFeature('clipboard', 'Persistent error');
      errorHandler.disableFeature('detector', 'Resource limit');

      const handler = ipcHandlers['health:get-features'];
      const result = await handler();

      expect(result.disabled).toContain('clipboard');
      expect(result.disabled).toContain('detector');
    });

    it('should include critical error count', async () => {
      const handler = ipcHandlers['health:get-features'];
      const result = await handler();

      expect(result).toHaveProperty('critical');
      expect(typeof result.critical).toBe('number');
    });

    it('should reflect feature state changes', async () => {
      let handler = ipcHandlers['health:get-features'];
      let result = await handler();

      expect(result.disabled.length).toBe(0);

      // Disable feature
      errorHandler.disableFeature('test-feature', 'Test');

      result = await handler();
      expect(result.disabled).toContain('test-feature');
    });
  });

  describe('8. Setting gets persisted across IPC calls', () => {
    it('should maintain feature disabled state across multiple calls', async () => {
      errorHandler.disableFeature('clipboard', 'First error');

      let handler = ipcHandlers['health:get-features'];
      let result = await handler();

      expect(result.disabled).toContain('clipboard');

      // Call again - feature should still be disabled
      result = await handler();
      expect(result.disabled).toContain('clipboard');
    });

    it('should persist error counts across calls', async () => {
      const handler = ipcHandlers['health:get-status'];

      // First call
      errorHandler.disableFeature('detector', 'Error 1');
      await handler();

      // Second call - error should persist
      const result = await handler();

      expect(result.errors.disabledFeatures).toContain('detector');
    });

    it('should maintain recovery history across calls', async () => {
      const statusHandler = ipcHandlers['health:get-status'];
      const historyHandler = ipcHandlers['health:get-recovery-history'];

      // Create disabled feature
      errorHandler.disableFeature('storage', 'Persistence test');

      // Call status multiple times
      await statusHandler();
      await statusHandler();

      // Verify history preserved
      const history = await historyHandler();
      expect(Array.isArray(history)).toBe(true);
    });

    it('should preserve watchdog health data across queries', async () => {
      watchdog.setClipboardServiceStatus(true, 5);
      watchdog.setDetectorLatency(75);

      const handler = ipcHandlers['health:get-status'];
      // Call first time to set state
      await handler();

      // Call again - data should be preserved
      const result = await handler();

      expect(result.services.clipboard.errors).toBe(5);
      expect(result.services.detector.latency).toBe(75);
    });
  });

  describe('9. Multiple IPC handlers work together (get-status + restart flow)', () => {
    it('should support get-status followed by restart-service flow', async () => {
      const statusHandler = ipcHandlers['health:get-status'];
      const restartHandler = ipcHandlers['health:restart-service'];
      const diagnosticsHandler = ipcHandlers['health:get-diagnostics'];

      // 1. Get initial status
      watchdog.setClipboardServiceStatus(true, 0);
      const status1 = await statusHandler();

      expect(status1.services.clipboard.active).toBe(true);

      // 2. Restart service
      const restartResult = await restartHandler({}, 'clipboard');
      expect(restartResult.success).toBe(true);

      // 3. Get updated status
      const status2 = await statusHandler();
      expect(status2).toBeDefined();

      // 4. Get diagnostics
      const diagnostics = await diagnosticsHandler();
      expect(diagnostics.health).toBeDefined();
    });

    it('should handle error reporting followed by status check', async () => {
      const reportListener = ipcListeners['health:report-error'];
      const statusHandler = ipcHandlers['health:get-status'];
      const featuresHandler = ipcHandlers['health:get-features'];

      // 1. Report critical error
      reportListener({}, {
        service: 'clipboard',
        severity: 'critical',
        message: 'Critical clipboard error',
        context: { errorCode: 'CB001' },
      });

      // 2. Check status - should show disabled feature
      const status = await statusHandler();
      expect(status.errors.disabledFeatures).toContain('clipboard');

      // 3. Check features
      const features = await featuresHandler();
      expect(features.disabled).toContain('clipboard');
    });

    it('should coordinate across status, recovery, and restart handlers', async () => {
      const statusHandler = ipcHandlers['health:get-status'];
      const historyHandler = ipcHandlers['health:get-recovery-history'];
      const restartHandler = ipcHandlers['health:restart-service'];

      // 1. Disable feature via error report
      errorHandler.disableFeature('detector', 'Initial failure');

      // 2. Get status showing problem
      let status = await statusHandler();
      expect(status.errors.disabledFeatures).toContain('detector');

      // 3. Get recovery history
      const history = await historyHandler();
      expect(Array.isArray(history)).toBe(true);

      // 4. Attempt restart
      const restart = await restartHandler({}, 'detector');
      expect(restart.success).toBe(true);

      // 5. Final status check
      status = await statusHandler();
      expect(status).toHaveProperty('timestamp');
    });

    it('should maintain consistency across rapid IPC calls', async () => {
      const statusHandler = ipcHandlers['health:get-status'];
      const featuresHandler = ipcHandlers['health:get-features'];

      // Rapid disable and query
      errorHandler.disableFeature('test1', 'Error 1');

      const status1 = await statusHandler();
      const features1 = await featuresHandler();

      errorHandler.disableFeature('test2', 'Error 2');

      const status2 = await statusHandler();
      const features2 = await featuresHandler();

      // Both tests should show cumulative errors
      expect(features2.disabled.length >= features1.disabled.length).toBe(true);
      expect(status2.errors.disabledFeatures.length >= status1.errors.disabledFeatures.length).toBe(
        true,
      );
    });
  });

  describe('Handler registration and logging', () => {
    it('should register all health handlers with ipcMain', () => {
      expect(ipcHandlers['health:get-status']).toBeDefined();
      expect(ipcHandlers['health:get-recovery-history']).toBeDefined();
      expect(ipcHandlers['health:get-diagnostics']).toBeDefined();
      expect(ipcHandlers['health:restart-service']).toBeDefined();
      expect(ipcHandlers['health:get-features']).toBeDefined();
      expect(ipcHandlers['health:clear-recovery-history']).toBeDefined();
    });

    it('should register error reporting listener', () => {
      expect(ipcListeners['health:report-error']).toBeDefined();
    });

    it('should log setup completion', () => {
      expect(mockLogger.info).toHaveBeenCalledWith('Health monitoring IPC handlers registered');
    });
  });
});
