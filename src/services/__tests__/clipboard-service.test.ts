import { DetectionHistoryEntry } from '../../types';

jest.mock('../detector-service');
jest.mock('../storage-service');
jest.mock('../logger-service');

jest.mock('electron', () => ({
  clipboard: {
    readText: jest.fn(),
    writeText: jest.fn(),
  },
  dialog: {
    showMessageBox: jest.fn(),
  },
  ipcMain: {
    handle: jest.fn(),
  },
  BrowserWindow: jest.fn(),
}));

import { ClipboardService } from '../clipboard-service';
import { DetectorService } from '../detector-service';
import { StorageService } from '../storage-service';
import { LoggerService } from '../logger-service';
import { clipboard, dialog, ipcMain } from 'electron';

// Cast mocks for TypeScript
const clipboardMock = clipboard as jest.Mocked<typeof clipboard>;
const dialogMock = dialog as jest.Mocked<typeof dialog>;
const ipcMainMock = ipcMain as jest.Mocked<typeof ipcMain>;

describe('ClipboardService', () => {
  let clipboardService: ClipboardService;
  let mockDetector: jest.Mocked<DetectorService>;
  let mockStorage: jest.Mocked<StorageService>;
  let mockLogger: jest.Mocked<LoggerService>;
  let mockWindow: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Setup dialog mock to return a resolved promise
    (dialogMock.showMessageBox as jest.Mock).mockResolvedValue({ response: 0, checkboxChecked: false });

    // Setup window mock
    mockWindow = {
      webContents: {
        send: jest.fn(),
      },
    };

    // Mock DetectorService
    mockDetector = {
      detect: jest.fn(),
    } as any;

    // Mock StorageService
    mockStorage = {
      getSettings: jest.fn(),
      updateSettings: jest.fn(),
      getDetectionHistory: jest.fn(),
      addDetectionHistory: jest.fn(),
      clearDetectionHistory: jest.fn(),
    } as any;

    // Mock LoggerService
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as any;

    // Default settings
    mockStorage.getSettings.mockReturnValue({
      monitoring_enabled: true,
      auto_clear_clipboard: false,
      show_warnings: true,
      detection_history: [],
    });

    clipboardService = new ClipboardService(mockDetector, mockStorage, mockLogger);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('start(window) begins monitoring', () => {
    it('should start monitoring and log message', () => {
      clipboardService.start(mockWindow);

      expect(clipboardService.isMonitoring()).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Clipboard monitoring started');
    });

    it('should not start if already monitoring', () => {
      clipboardService.start(mockWindow);
      const callCount = mockLogger.info.mock.calls.length;

      clipboardService.start(mockWindow);

      // Should not add another log entry
      expect(mockLogger.info.mock.calls.length).toBe(callCount);
    });

    it('should store reference to mainWindow', () => {
      mockDetector.detect.mockReturnValue({
        found: true,
        types: [{ type: 'API Key', category: 'api_keys', count: 1 }],
        count: 1,
        severity: 'critical',
      });
      clipboardMock.readText.mockReturnValue('sk_live_test123456789012345');

      clipboardService.start(mockWindow);
      jest.advanceTimersByTime(1000);

      expect(mockWindow.webContents.send).toHaveBeenCalled();
    });
  });

  describe('stop() clears monitoring interval', () => {
    it('should stop monitoring', () => {
      clipboardService.start(mockWindow);
      expect(clipboardService.isMonitoring()).toBe(true);

      clipboardService.stop();

      expect(clipboardService.isMonitoring()).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith('Clipboard monitoring stopped');
    });

    it('should not error when stopping if not started', () => {
      expect(() => {
        clipboardService.stop();
      }).not.toThrow();
    });

    it('should allow restarting after stopping', () => {
      clipboardService.start(mockWindow);
      clipboardService.stop();
      clipboardService.start(mockWindow);

      expect(clipboardService.isMonitoring()).toBe(true);
    });
  });

  describe('isMonitoring() returns correct state', () => {
    it('should return false when not started', () => {
      expect(clipboardService.isMonitoring()).toBe(false);
    });

    it('should return true when started', () => {
      clipboardService.start(mockWindow);

      expect(clipboardService.isMonitoring()).toBe(true);
    });

    it('should return false after stopped', () => {
      clipboardService.start(mockWindow);
      clipboardService.stop();

      expect(clipboardService.isMonitoring()).toBe(false);
    });
  });

  describe('Poll interval from config (default 1000ms)', () => {
    it('should poll on each interval tick', () => {
      clipboardMock.readText.mockReturnValue('test content');
      mockDetector.detect.mockReturnValue({
        found: false,
        types: [],
        count: 0,
        severity: 'safe',
      });

      clipboardService.start(mockWindow);

      // First tick
      jest.advanceTimersByTime(1000);
      expect(clipboardMock.readText).toHaveBeenCalledTimes(1);

      // Second tick
      jest.advanceTimersByTime(1000);
      expect(clipboardMock.readText).toHaveBeenCalledTimes(2);
    });
  });

  describe('Deduplicates same clipboard content', () => {
    it('should not analyze same content twice', () => {
      const content = 'sk_live_test123456789012345';
      clipboardMock.readText.mockReturnValue(content);
      mockDetector.detect.mockReturnValue({
        found: true,
        types: [{ type: 'API Key', category: 'api_keys', count: 1 }],
        count: 1,
        severity: 'critical',
      });

      clipboardService.start(mockWindow);

      // First tick
      jest.advanceTimersByTime(1000);
      expect(mockDetector.detect).toHaveBeenCalledTimes(1);

      // Second tick with same content
      jest.advanceTimersByTime(1000);
      expect(mockDetector.detect).toHaveBeenCalledTimes(1);
    });

    it('should analyze new content after change', () => {
      clipboardMock.readText
        .mockReturnValueOnce('content 1')
        .mockReturnValueOnce('content 2');
      mockDetector.detect.mockReturnValue({
        found: false,
        types: [],
        count: 0,
        severity: 'safe',
      });

      clipboardService.start(mockWindow);

      // First tick
      jest.advanceTimersByTime(1000);
      expect(mockDetector.detect).toHaveBeenCalledTimes(1);

      // Second tick with different content
      jest.advanceTimersByTime(1000);
      expect(mockDetector.detect).toHaveBeenCalledTimes(2);
    });

    it('should ignore empty or whitespace-only content', () => {
      clipboardMock.readText.mockReturnValue('   ');
      mockDetector.detect.mockReturnValue({
        found: false,
        types: [],
        count: 0,
        severity: 'safe',
      });

      clipboardService.start(mockWindow);
      jest.advanceTimersByTime(1000);

      expect(mockDetector.detect).not.toHaveBeenCalled();
    });
  });

  describe('Calls detectSensitiveData on content change', () => {
    it('should call detector.detect when clipboard changes', () => {
      const sensitiveContent = 'sk_live_test123456789012345';
      clipboardMock.readText.mockReturnValue(sensitiveContent);
      mockDetector.detect.mockReturnValue({
        found: true,
        types: [{ type: 'API Key', category: 'api_keys', count: 1 }],
        count: 1,
        severity: 'critical',
      });

      clipboardService.start(mockWindow);
      jest.advanceTimersByTime(1000);

      expect(mockDetector.detect).toHaveBeenCalledWith(sensitiveContent);
    });

    it('should pass full clipboard content to detector', () => {
      const multiLineContent = 'Line 1\nLine 2\nsk_live_key123456789012';
      clipboardMock.readText.mockReturnValue(multiLineContent);
      mockDetector.detect.mockReturnValue({
        found: true,
        types: [],
        count: 0,
        severity: 'critical',
      });

      clipboardService.start(mockWindow);
      jest.advanceTimersByTime(1000);

      expect(mockDetector.detect).toHaveBeenCalledWith(multiLineContent);
    });
  });

  describe('Shows warning dialog on detection', () => {
    it('should show dialog when sensitive data detected', () => {
      const content = 'sk_live_test123456789012345';
      clipboardMock.readText.mockReturnValue(content);
      mockDetector.detect.mockReturnValue({
        found: true,
        types: [{ type: 'API Key', category: 'api_keys', count: 1 }],
        count: 1,
        severity: 'critical',
      });

      clipboardService.start(mockWindow);
      jest.advanceTimersByTime(1000);

      expect(dialogMock.showMessageBox).toHaveBeenCalled();
    });

    it('should not show dialog when show_warnings disabled', () => {
      clipboardMock.readText.mockReturnValue('sk_live_test123456789012345');
      mockDetector.detect.mockReturnValue({
        found: true,
        types: [{ type: 'API Key', category: 'api_keys', count: 1 }],
        count: 1,
        severity: 'critical',
      });
      mockStorage.getSettings.mockReturnValue({
        monitoring_enabled: true,
        auto_clear_clipboard: false,
        show_warnings: false,
        detection_history: [],
      });

      clipboardService.start(mockWindow);
      jest.advanceTimersByTime(1000);

      expect(dialogMock.showMessageBox).not.toHaveBeenCalled();
    });

    it('should include severity and types in dialog', () => {
      clipboardMock.readText.mockReturnValue('AKIA1234567890ABCDEF');
      mockDetector.detect.mockReturnValue({
        found: true,
        types: [{ type: 'AWS Credentials', category: 'aws_keys', count: 1 }],
        count: 1,
        severity: 'high',
      });

      clipboardService.start(mockWindow);
      jest.advanceTimersByTime(1000);

      const calls = (dialogMock.showMessageBox as jest.Mock).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const dialogCall = calls[0][0];
      expect((dialogCall as any).title).toContain('Sensitive Data Detected');
      expect((dialogCall as any).detail).toContain('AWS Credentials');
    });

    it('should use appropriate emoji for severity level', () => {
      clipboardMock.readText.mockReturnValue('sk_live_test123456789012345');
      mockDetector.detect.mockReturnValue({
        found: true,
        types: [{ type: 'API Key', category: 'api_keys', count: 1 }],
        count: 1,
        severity: 'critical',
      });

      clipboardService.start(mockWindow);
      jest.advanceTimersByTime(1000);

      const calls = (dialogMock.showMessageBox as jest.Mock).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const dialogCall = calls[0][0];
      expect((dialogCall as any).title).toContain('🚨');
    });
  });

  describe('Logs to detection history via StorageService', () => {
    it('should add entry to detection history on detection', () => {
      clipboardMock.readText.mockReturnValue('sk_live_test123456789012345');
      mockDetector.detect.mockReturnValue({
        found: true,
        types: [{ type: 'API Key', category: 'api_keys', count: 1 }],
        count: 1,
        severity: 'critical',
      });

      clipboardService.start(mockWindow);
      jest.advanceTimersByTime(1000);

      expect(mockStorage.addDetectionHistory).toHaveBeenCalled();
    });

    it('should record correct history entry structure', () => {
      clipboardMock.readText.mockReturnValue('sk_live_test123456789012345');
      mockDetector.detect.mockReturnValue({
        found: true,
        types: [
          { type: 'API Key', category: 'api_keys', count: 1 },
          { type: 'Bearer Token', category: 'bearer_token', count: 1 },
        ],
        count: 2,
        severity: 'high',
      });

      clipboardService.start(mockWindow);
      jest.advanceTimersByTime(1000);

      const entry = mockStorage.addDetectionHistory.mock.calls[0][0];
      expect(entry.severity).toBe('high');
      expect(entry.types).toEqual(['API Key', 'Bearer Token']);
      expect(entry.count).toBe(2);
      expect(entry.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T/);
    });

    it('should not add history entry if no detection', () => {
      clipboardMock.readText.mockReturnValue('normal text');
      mockDetector.detect.mockReturnValue({
        found: false,
        types: [],
        count: 0,
        severity: 'safe',
      });

      clipboardService.start(mockWindow);
      jest.advanceTimersByTime(1000);

      expect(mockStorage.addDetectionHistory).not.toHaveBeenCalled();
    });
  });

  describe('Auto-clears clipboard after delay if enabled', () => {
    it('should auto-clear clipboard when enabled', () => {
      clipboardMock.readText.mockReturnValue('sk_live_test123456789012345');
      mockDetector.detect.mockReturnValue({
        found: true,
        types: [{ type: 'API Key', category: 'api_keys', count: 1 }],
        count: 1,
        severity: 'critical',
      });
      mockStorage.getSettings.mockReturnValue({
        monitoring_enabled: true,
        auto_clear_clipboard: true,
        show_warnings: true,
        detection_history: [],
      });

      clipboardService.start(mockWindow);
      jest.advanceTimersByTime(1000);
      jest.advanceTimersByTime(1500);

      expect(clipboardMock.writeText).toHaveBeenCalledWith(
        '[ClipGuard: Sensitive data cleared for safety]'
      );
    });

    it('should not auto-clear if disabled', () => {
      clipboardMock.readText.mockReturnValue('sk_live_test123456789012345');
      mockDetector.detect.mockReturnValue({
        found: true,
        types: [{ type: 'API Key', category: 'api_keys', count: 1 }],
        count: 1,
        severity: 'critical',
      });
      mockStorage.getSettings.mockReturnValue({
        monitoring_enabled: true,
        auto_clear_clipboard: false,
        show_warnings: true,
        detection_history: [],
      });

      clipboardService.start(mockWindow);
      jest.advanceTimersByTime(1000);

      expect(clipboardMock.writeText).not.toHaveBeenCalled();
    });
  });

  describe('IPC handlers registered', () => {
    it('should register clipboard:get-detection-history handler', () => {
      clipboardService.setupIpcHandlers();

      expect(ipcMainMock.handle).toHaveBeenCalledWith(
        'clipboard:get-detection-history',
        expect.any(Function)
      );
    });

    it('should register clipboard:clear-history handler', () => {
      clipboardService.setupIpcHandlers();

      expect(ipcMainMock.handle).toHaveBeenCalledWith(
        'clipboard:clear-history',
        expect.any(Function)
      );
    });

    it('should register clipboard:get-settings handler', () => {
      clipboardService.setupIpcHandlers();

      expect(ipcMainMock.handle).toHaveBeenCalledWith(
        'clipboard:get-settings',
        expect.any(Function)
      );
    });

    it('should register clipboard:update-settings handler', () => {
      clipboardService.setupIpcHandlers();

      expect(ipcMainMock.handle).toHaveBeenCalledWith(
        'clipboard:update-settings',
        expect.any(Function)
      );
    });
  });

  describe('clipboard:get-detection-history IPC handler', () => {
    it('should return detection history', () => {
      const mockHistory: DetectionHistoryEntry[] = [
        {
          timestamp: '2024-01-01T00:00:00Z',
          severity: 'critical',
          types: ['API Key'],
          count: 1,
        },
      ];
      mockStorage.getDetectionHistory.mockReturnValue(mockHistory);

      clipboardService.setupIpcHandlers();

      const handler = ipcMainMock.handle.mock.calls[0][1] as any;
      const result = handler({});

      expect(result).toEqual(mockHistory);
    });
  });

  describe('clipboard:clear-history IPC handler', () => {
    it('should clear detection history and return success', () => {
      clipboardService.setupIpcHandlers();

      const handler = ipcMainMock.handle.mock.calls[1][1] as any;
      const result = handler({});

      expect(mockStorage.clearDetectionHistory).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });
  });

  describe('clipboard:get-settings IPC handler', () => {
    it('should return current settings', () => {
      const mockSettings = {
        monitoring_enabled: true,
        auto_clear_clipboard: true,
        show_warnings: false,
        detection_history: [],
      };
      mockStorage.getSettings.mockReturnValue(mockSettings);

      clipboardService.setupIpcHandlers();

      const handler = ipcMainMock.handle.mock.calls[2][1] as any;
      const result = handler({});

      expect(result).toEqual(mockSettings);
    });
  });

  describe('clipboard:update-settings IPC handler', () => {
    it('should update settings in storage', () => {
      clipboardService.setupIpcHandlers();

      const handler = ipcMainMock.handle.mock.calls[3][1] as any;
      const newSettings = { auto_clear_clipboard: true };
      const result = handler({}, newSettings);

      expect(mockStorage.updateSettings).toHaveBeenCalledWith(newSettings);
      expect(result).toEqual({ success: true });
    });

    it('should stop monitoring if disabled', () => {
      clipboardService.start(mockWindow);
      clipboardService.setupIpcHandlers();

      const handler = ipcMainMock.handle.mock.calls[3][1] as any;
      handler({}, { monitoring_enabled: false });

      expect(clipboardService.isMonitoring()).toBe(false);
    });
  });

  describe('Emits IPC event to renderer on detection', () => {
    it('should emit clipboard:sensitive-data-detected event', () => {
      clipboardMock.readText.mockReturnValue('sk_live_test123456789012345');
      mockDetector.detect.mockReturnValue({
        found: true,
        types: [{ type: 'API Key', category: 'api_keys', count: 1 }],
        count: 1,
        severity: 'critical',
      });

      clipboardService.start(mockWindow);
      jest.advanceTimersByTime(1000);

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'clipboard:sensitive-data-detected',
        expect.objectContaining({
          severity: 'critical',
          count: 1,
        })
      );
    });

    it('should include detection types in IPC event', () => {
      clipboardMock.readText.mockReturnValue('test@example.com 1234-56-7890');
      mockDetector.detect.mockReturnValue({
        found: true,
        types: [
          { type: 'Email Address', category: 'email', count: 1 },
          { type: 'Social Security Number', category: 'ssn', count: 1 },
        ],
        count: 2,
        severity: 'high',
      });

      clipboardService.start(mockWindow);
      jest.advanceTimersByTime(1000);

      const emitCall = mockWindow.webContents.send.mock.calls[0];
      expect(emitCall[1].types).toHaveLength(2);
    });
  });

  describe('Error handling for clipboard read failures', () => {
    it('should handle clipboard read errors gracefully', () => {
      clipboardMock.readText.mockImplementation(() => {
        throw new Error('Clipboard read failed');
      });

      clipboardService.start(mockWindow);
      jest.advanceTimersByTime(1000);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error reading clipboard',
        expect.any(Error)
      );
    });

    it('should continue monitoring after read error', () => {
      clipboardMock.readText
        .mockImplementationOnce(() => {
          throw new Error('Clipboard read failed');
        })
        .mockReturnValueOnce('normal text');
      mockDetector.detect.mockReturnValue({
        found: false,
        types: [],
        count: 0,
        severity: 'safe',
      });

      clipboardService.start(mockWindow);
      jest.advanceTimersByTime(1000);
      jest.advanceTimersByTime(1000);

      expect(clipboardService.isMonitoring()).toBe(true);
      expect(clipboardMock.readText).toHaveBeenCalledTimes(2);
    });

    it('should log error with proper context', () => {
      const error = new Error('Access denied');
      clipboardMock.readText.mockImplementation(() => {
        throw error;
      });

      clipboardService.start(mockWindow);
      jest.advanceTimersByTime(1000);

      expect(mockLogger.error).toHaveBeenCalledWith('Error reading clipboard', error);
    });

    it('should not show dialog on read error', () => {
      clipboardMock.readText.mockImplementation(() => {
        throw new Error('Clipboard read failed');
      });

      clipboardService.start(mockWindow);
      jest.advanceTimersByTime(1000);

      expect(dialogMock.showMessageBox).not.toHaveBeenCalled();
    });
  });

  describe('Integration with StorageService', () => {
    it('should call storage.addDetectionHistory with correct entry', () => {
      clipboardMock.readText.mockReturnValue('AKIA1234567890ABCDEF');
      mockDetector.detect.mockReturnValue({
        found: true,
        types: [{ type: 'AWS Credentials', category: 'aws_keys', count: 1 }],
        count: 1,
        severity: 'high',
      });

      clipboardService.start(mockWindow);
      jest.advanceTimersByTime(1000);

      expect(mockStorage.addDetectionHistory).toHaveBeenCalled();
      const entry = mockStorage.addDetectionHistory.mock.calls[0][0];
      expect(entry.types).toContain('AWS Credentials');
    });

    it('should get settings from storage for warning display', () => {
      clipboardMock.readText.mockReturnValue('sensitive data');
      mockDetector.detect.mockReturnValue({
        found: true,
        types: [{ type: 'API Key', category: 'api_keys', count: 1 }],
        count: 1,
        severity: 'critical',
      });

      clipboardService.start(mockWindow);
      jest.advanceTimersByTime(1000);

      expect(mockStorage.getSettings).toHaveBeenCalled();
    });
  });

  describe('Integration with DetectorService', () => {
    it('should call detector.detect with clipboard content', () => {
      clipboardMock.readText.mockReturnValue('secret_key_12345');
      mockDetector.detect.mockReturnValue({
        found: false,
        types: [],
        count: 0,
        severity: 'safe',
      });

      clipboardService.start(mockWindow);
      jest.advanceTimersByTime(1000);

      expect(mockDetector.detect).toHaveBeenCalledWith('secret_key_12345');
    });

    it('should handle detector returning multiple findings', () => {
      clipboardMock.readText.mockReturnValue('multiple detections');
      mockDetector.detect.mockReturnValue({
        found: true,
        types: [
          { type: 'API Key', category: 'api_keys', count: 1 },
          { type: 'Bearer Token', category: 'bearer_token', count: 1 },
          { type: 'Email Address', category: 'email', count: 2 },
        ],
        count: 4,
        severity: 'high',
      });

      clipboardService.start(mockWindow);
      jest.advanceTimersByTime(1000);

      const entry = mockStorage.addDetectionHistory.mock.calls[0][0];
      expect(entry.types).toHaveLength(3);
      expect(entry.count).toBe(4);
    });

    it('should not process if detector returns no findings', () => {
      clipboardMock.readText.mockReturnValue('normal content');
      mockDetector.detect.mockReturnValue({
        found: false,
        types: [],
        count: 0,
        severity: 'safe',
      });

      clipboardService.start(mockWindow);
      jest.advanceTimersByTime(1000);

      expect(mockStorage.addDetectionHistory).not.toHaveBeenCalled();
      expect(mockWindow.webContents.send).not.toHaveBeenCalled();
    });
  });

  describe('Edge cases and cleanup', () => {
    it('should handle very long clipboard content', () => {
      const longContent = 'a'.repeat(10000) + 'sk_live_test123456789012345';
      clipboardMock.readText.mockReturnValue(longContent);
      mockDetector.detect.mockReturnValue({
        found: true,
        types: [{ type: 'API Key', category: 'api_keys', count: 1 }],
        count: 1,
        severity: 'critical',
      });

      clipboardService.start(mockWindow);
      jest.advanceTimersByTime(1000);

      expect(mockDetector.detect).toHaveBeenCalledWith(longContent);
      expect(mockStorage.addDetectionHistory).toHaveBeenCalled();
    });

    it('should stop monitoring cleanly', () => {
      clipboardService.start(mockWindow);
      expect(clipboardService.isMonitoring()).toBe(true);

      clipboardService.stop();

      expect(clipboardService.isMonitoring()).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith('Clipboard monitoring stopped');
    });
  });
});
