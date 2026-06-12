import { clipboard, dialog, BrowserWindow, ipcMain } from 'electron';
import { DetectorService } from './detector-service';
import { StorageService } from './storage-service';
import { LoggerService } from './logger-service';
import { DetectionHistoryEntry } from '../types';

interface ClipboardServiceOptions {
  pollInterval?: number;
  autoClearDelay?: number;
}

export class ClipboardService {
  private monitoringInterval: NodeJS.Timeout | null = null;
  private lastClipboardContent = '';
  private lastAnalyzedContent = '';
  private mainWindow: BrowserWindow | null = null;
  private pollInterval: number;
  private showingDialog = false;

  constructor(
    private detector: DetectorService,
    private storage: StorageService,
    private logger: LoggerService,
    options: ClipboardServiceOptions = {}
  ) {
    this.pollInterval = options.pollInterval || 1000;
  }

  start(window?: BrowserWindow | null): void {
    if (window) {
      this.mainWindow = window;
    }

    if (this.monitoringInterval) {
      return;
    }

    this.logger.info('Clipboard monitoring started');

    this.monitoringInterval = setInterval(() => {
      try {
        const currentContent = clipboard.readText();

        if (currentContent !== this.lastClipboardContent && currentContent.trim()) {
          this.lastClipboardContent = currentContent;
          this.lastAnalyzedContent = '';
          this.analyze(currentContent);
        }
      } catch (err) {
        this.logger.error('Error reading clipboard', err instanceof Error ? err : new Error(String(err)));
      }
    }, this.pollInterval);
  }

  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      this.logger.info('Clipboard monitoring stopped');
    }
  }

  private analyze(content: string): void {
    const detection = this.detector.detect(content);

    if (detection.found && content !== this.lastAnalyzedContent) {
      this.lastAnalyzedContent = content;
      this.handleDetection(detection);
    }
  }

  private handleDetection(detection: any): void {
    const settings = this.storage.getSettings();

    this.logger.info(`[DETECTION] Found: ${detection.types.map((t: any) => t.type).join(',')} | showingDialog=${this.showingDialog}`);

    // Show warning dialog only once at a time (prevents stacking)
    if (settings.show_warnings && !this.showingDialog) {
      this.logger.info('[DIALOG] Showing warning dialog');
      this.showingDialog = true;
      this.showWarningDialog(detection, settings.auto_clear_clipboard).finally(() => {
        this.logger.info('[DIALOG] Dialog closed');
        this.showingDialog = false;
      });
    } else {
      this.logger.info(`[DIALOG] SKIPPED - show_warnings=${settings.show_warnings}, showingDialog=${this.showingDialog}`);
    }

    // Send IPC event if window exists
    if (this.mainWindow) {
      this.mainWindow.webContents.send('clipboard:sensitive-data-detected', {
        severity: detection.severity,
        types: detection.types,
        count: detection.count,
      });
    }

    // Log to history
    const entry: DetectionHistoryEntry = {
      timestamp: new Date().toISOString(),
      severity: detection.severity,
      types: detection.types.map((t: any) => t.type),
      count: detection.count,
    };

    this.storage.addDetectionHistory(entry);
    this.logger.warn(`Sensitive data detected: ${detection.severity}`, { types: detection.types });

    // Auto-clear if enabled
    if (settings.auto_clear_clipboard) {
      setTimeout(() => {
        clipboard.writeText('[ClipGuard: Sensitive data cleared for safety]');
      }, 1500);
    }
  }

  private async showWarningDialog(detection: any, autoClear: boolean): Promise<void> {
    const typesList = detection.types.map((t: any) => `• ${t.type}`).join('\n');
    const severityEmoji =
      detection.severity === 'critical' ? '🚨' : detection.severity === 'high' ? '⚠️' : '⚡';

    const buttons = autoClear ? ['OK', 'Copy Anyway', '🔒 Convert to Mock'] : ['Clear Clipboard', '🔒 Convert to Mock', 'Copy Anyway', 'Cancel'];

    try {
      // Show dialog - works with or without mainWindow (menu bar only apps)
      const result = await dialog.showMessageBox({
        type: detection.severity === 'critical' ? 'error' : 'warning',
        title: `${severityEmoji} Sensitive Data Detected!`,
        message: `${detection.severity.toUpperCase()} RISK: You just copied sensitive information!`,
        detail: `Detected data types:\n${typesList}\n\nRecommended action: Clear your clipboard to prevent accidental sharing with AI tools.`,
        buttons,
        defaultId: autoClear ? 0 : 0,
        noLink: true,
      });

      if (autoClear) {
        if (result.response === 1) {
          // User chose "Copy Anyway"
        } else if (result.response === 2) {
          // User chose "Convert to Mock"
          this.convertCurrentToMock();
        }
      } else {
        if (result.response === 0) {
          // User chose "Clear Clipboard"
          clipboard.writeText('[ClipGuard: Cleared for safety]');
        } else if (result.response === 1) {
          // User chose "Convert to Mock"
          this.convertCurrentToMock();
        } else if (result.response === 2) {
          // User chose "Copy Anyway"
        } else {
          // User clicked close/cancel - clear for safety
          clipboard.writeText('[ClipGuard: Cleared for safety]');
        }
      }
    } catch (error) {
      this.logger.error('Error showing warning dialog', error instanceof Error ? error : new Error(String(error)));
    }
  }

  private convertCurrentToMock(): void {
    try {
      const currentData = clipboard.readText();
      let mockData = currentData;
      let detectedType = '';

      // Detect pattern and convert to mock
      if (/^ghp_[A-Za-z0-9_]{36}/.test(currentData)) {
        mockData = 'ghp_MOCK_TESTKEY_1234567890abcdefghijklmnop';
        detectedType = 'GitHub Token';
      } else if (/^sk_live_[A-Za-z0-9]{24,}/.test(currentData)) {
        mockData = 'sk_live_MOCK_TESTKEY_1234567890abcdefgh';
        detectedType = 'Stripe Live Key';
      } else if (/^sk_test_[A-Za-z0-9]{24,}/.test(currentData)) {
        mockData = 'sk_test_MOCK_TESTKEY_1234567890abcdefgh';
        detectedType = 'Stripe Test Key';
      } else if (/^AKIA[0-9A-Z]{16}/.test(currentData)) {
        mockData = 'AKIAMOCK1234567890ABCDEF';
        detectedType = 'AWS Access Key';
      } else {
        mockData = `MOCK_TESTKEY_${currentData.substring(0, 15)}`;
        detectedType = 'API Key';
      }

      clipboard.writeText(mockData);
      this.logger.info(`Converted ${detectedType} to mock data`);
    } catch (error) {
      this.logger.error('Error converting to mock data', error instanceof Error ? error : new Error(String(error)));
    }
  }

  setupIpcHandlers(): void {
    ipcMain.handle('clipboard:get-detection-history', () => {
      return this.storage.getDetectionHistory();
    });

    ipcMain.handle('clipboard:clear-history', () => {
      this.storage.clearDetectionHistory();
      return { success: true };
    });

    ipcMain.handle('clipboard:get-settings', () => {
      return this.storage.getSettings();
    });

    ipcMain.handle('clipboard:update-settings', (_event, settings) => {
      // Validate input: check for expected keys and correct types
      const expectedKeys = new Set(['monitoring_enabled', 'auto_clear_clipboard', 'show_warnings']);
      const validationErrors: string[] = [];

      // Check for unexpected keys
      if (typeof settings === 'object' && settings !== null) {
        const settingsKeys = Object.keys(settings);
        const unexpectedKeys = settingsKeys.filter(key => !expectedKeys.has(key));

        if (unexpectedKeys.length > 0) {
          validationErrors.push(`Unexpected keys: ${unexpectedKeys.join(', ')}`);
        }

        // Validate types for known keys
        if ('monitoring_enabled' in settings && typeof settings.monitoring_enabled !== 'boolean') {
          validationErrors.push('monitoring_enabled must be a boolean');
        }
        if ('auto_clear_clipboard' in settings && typeof settings.auto_clear_clipboard !== 'boolean') {
          validationErrors.push('auto_clear_clipboard must be a boolean');
        }
        if ('show_warnings' in settings && typeof settings.show_warnings !== 'boolean') {
          validationErrors.push('show_warnings must be a boolean');
        }
      } else {
        validationErrors.push('Settings must be an object');
      }

      // Return error response if validation fails
      if (validationErrors.length > 0) {
        this.logger.warn('Settings validation failed', { errors: validationErrors });
        return { success: false, error: validationErrors.join('; ') };
      }

      this.storage.updateSettings(settings);

      if (settings.monitoring_enabled !== undefined) {
        if (settings.monitoring_enabled && !this.monitoringInterval) {
          this.start(this.mainWindow!);
        } else if (!settings.monitoring_enabled) {
          this.stop();
        }
      }

      return { success: true };
    });
  }

  isMonitoring(): boolean {
    return this.monitoringInterval !== null;
  }
}
