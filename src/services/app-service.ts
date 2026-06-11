import { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, dialog, clipboard } from 'electron';
import { ClipboardService } from './clipboard-service';
import { DetectorService } from './detector-service';
import { StorageService } from './storage-service';
import { LoggerService } from './logger-service';
import { ErrorHandler } from './error-handler';
import { ConfigService } from './config-service';
import { SentryIntegration, SentryConfig } from './sentry-integration';
import { PermissionsManager } from '../permissions/permissions-manager';
import { PlatformDetector } from '../permissions/platform-detector';
import { setupHealthHandlers } from '../ipc/health-handlers';
import WatchdogService from './watchdog-service';

export class AppService {
  private mainWindow: BrowserWindow | null = null;
  private tray: Tray | null = null;
  private clipboardService: ClipboardService;
  private detector: DetectorService;
  private storage: StorageService;
  private logger: LoggerService;
  private errorHandler: ErrorHandler;
  private permissionsManager: PermissionsManager;
  private watchdog: WatchdogService;
  private config: ConfigService; // Phase 2: Config service for feature toggles & settings
  private sentry: SentryIntegration; // Phase 2: Sentry integration for error tracking
  private isMonitoring = true;
  private serviceErrors: Map<string, number> = new Map(); // Track errors per service for health reporting

  constructor() {
    this.logger = new LoggerService();
    this.storage = new StorageService();
    this.detector = new DetectorService();
    this.errorHandler = new ErrorHandler(this.logger);
    this.permissionsManager = new PermissionsManager(this.logger);

    // Phase 2 Integration Point 1: Create ConfigService
    // ConfigService loads defaults, platform overrides, and user settings
    this.config = new ConfigService();

    // Phase 2 Integration Point 2: Create ClipboardService with config parameters
    // Pass poll_interval and auto_clear_delay from config to ClipboardService
    const pollInterval = (this.config.getConfig('clipboard_poll_interval') as number) || 1000;
    const autoClearDelay = (this.config.getConfig('auto_clear_delay') as number) || 1500;
    this.clipboardService = new ClipboardService(
      this.detector,
      this.storage,
      this.logger,
      { pollInterval, autoClearDelay }
    );

    // Phase 2 Integration Point 3: Create WatchdogService
    this.watchdog = new WatchdogService();

    // Phase 2 Integration Point 4: Initialize Sentry from config
    // Will be fully initialized in initialize() method
    const sentryConfig: SentryConfig = {
      enabled: (this.config.getConfig('enable_sentry') as boolean) || false,
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      releaseVersion: '1.0.0',
      maxBreadcrumbs: 100,
    };
    this.sentry = new SentryIntegration(sentryConfig, this.logger);

    this.logger.info(`ClipGuard starting on ${PlatformDetector.getPlatform()}`);
  }

  async initialize(): Promise<void> {
    try {
      await this.permissionsManager.initialize();
      this.setupTray();
      this.setupIpcHandlers();
      this.clipboardService.setupIpcHandlers();

      // Phase 2 Integration Point 5: Initialize Sentry error tracking
      // Must be called before other services to capture any initialization errors
      await this.sentry.initialize();
      this.logger.info('Sentry error tracking initialized');

      // Phase 2 Integration Point 6: Configure watchdog thresholds from config
      // Apply configuration overrides to watchdog health check parameters
      const watchdogConfig = {
        healthCheckInterval: (this.config.getConfig('health_check_interval') as number) || 5000,
        hangDetectionThreshold: 10000,
        cpuErrorBound: 80,
        memoryErrorBound: 500,
        detectorLatencyThreshold: 100,
      };
      this.watchdog.configureThresholds(watchdogConfig);

      // Setup health monitoring handlers (passes watchdog + config to handlers)
      setupHealthHandlers(
        this.errorHandler,
        this.watchdog,
        this.logger,
        this.clipboardService,
        this.detector,
        this.storage
      );

      // Phase 2 Integration Point 7: Start watchdog service
      // Watchdog begins monitoring CPU, memory, responsiveness, and service health
      this.watchdog.start();
      this.logger.info('Watchdog service started for health monitoring');

      // Phase 2 Integration Point 8: Set initial watchdog tags for Sentry context
      // Add app-level context so all Sentry events include version/platform info
      this.sentry.setTags({
        platform: PlatformDetector.getPlatform(),
        version: '1.0.0',
      });

      // Start monitoring without creating a window (menu bar only app)
      this.clipboardService.start();
      this.isMonitoring = true;

      this.logger.info('ClipGuard initialized successfully');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to initialize ClipGuard', err);
      // Report initialization error to Sentry
      this.sentry.captureException(err, {
        context: 'app_initialization',
        phase: 'startup',
      });
      this.errorHandler.handleUncaughtException(err);
    }
  }

  private setupTray(): void {
    try {
      const platform = PlatformDetector.getPlatform();
      this.logger.info(`Setting up tray for ${platform}...`);

      if (platform === 'darwin') {
        this.setupMacOSTray();
      } else if (platform === 'win32') {
        this.setupWindowsTray();
      } else if (platform === 'linux') {
        this.setupLinuxTray();
      }

      this.updateTrayMenu();
      this.logger.info('System tray created successfully');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to create system tray', err);
    }
  }

  private setupMacOSTray(): void {
    const emptyIcon = nativeImage.createEmpty();
    this.tray = new Tray(emptyIcon);
    this.tray.setToolTip('ClipGuard - Clipboard Protection');
    this.tray.setTitle('🔒 CG');
    this.logger.info('macOS tray setup complete (menu bar)');
  }

  private setupWindowsTray(): void {
    // Windows system tray icon - create a simple icon
    const icon = nativeImage.createFromDataURL(
      'data:image/svg+xml;base64,' +
        Buffer.from(`
        <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
          <circle cx="8" cy="8" r="7" fill="black"/>
          <path d="M 6 8 L 7 9 L 10 6" stroke="white" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `).toString('base64')
    );

    this.tray = new Tray(icon);
    this.tray.setToolTip('ClipGuard - Clipboard Protection');
    this.logger.info('Windows tray setup complete (system tray)');
  }

  private setupLinuxTray(): void {
    // Linux system tray icon
    const icon = nativeImage.createFromDataURL(
      'data:image/svg+xml;base64,' +
        Buffer.from(`
        <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="6" width="14" height="14" rx="1" fill="black"/>
          <rect x="8" y="2" width="6" height="4" rx="0.5" fill="black"/>
          <path d="M 9 12 L 11 14 L 15 10" stroke="white" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `).toString('base64')
    );

    this.tray = new Tray(icon);
    this.tray.setToolTip('ClipGuard - Clipboard Protection');
    this.logger.info('Linux tray setup complete (system tray)');
  }

  private updateTrayMenu(): void {
    if (!this.tray) return;

    const contextMenu = Menu.buildFromTemplate([
      {
        label: this.isMonitoring ? '✓ Monitoring Active' : '○ Monitoring Inactive',
        enabled: true,
        click: () => this.toggleMonitoring(),
      },
      { type: 'separator' },
      {
        label: '⚙️ Auto-Clear Data',
        type: 'checkbox',
        checked: this.storage.getSettings().auto_clear_clipboard,
        click: () => {
          const settings = this.storage.getSettings();
          this.storage.updateSettings({
            auto_clear_clipboard: !settings.auto_clear_clipboard,
          });
          this.updateTrayMenu();
        },
      },
      {
        label: '🔔 Show Warnings',
        type: 'checkbox',
        checked: this.storage.getSettings().show_warnings,
        click: () => {
          const settings = this.storage.getSettings();
          this.storage.updateSettings({
            show_warnings: !settings.show_warnings,
          });
          this.updateTrayMenu();
        },
      },
      { type: 'separator' },
      {
        label: '🧪 Test Detection (Mock Data)',
        click: () => this.testDetection(),
      },
      {
        label: '🔒 Convert to Mock Data',
        click: () => this.convertToMockData(),
      },
      {
        label: '📊 View Detection History',
        click: () => this.showDetectionHistory(),
      },
      {
        label: '🗑️ Clear History',
        click: () => {
          this.storage.clearDetectionHistory();
          dialog.showMessageBox({
            type: 'info',
            title: 'ClipGuard',
            message: 'Detection history cleared',
            buttons: ['OK'],
          });
        },
      },
      { type: 'separator' },
      {
        label: 'ℹ️ About ClipGuard',
        click: () => {
          dialog.showMessageBox({
            type: 'info',
            title: 'About ClipGuard',
            message: 'ClipGuard v1.0.0',
            detail: 'Protect your clipboard from accidental data exposure when sharing with AI tools.',
            buttons: ['OK'],
          });
        },
      },
      {
        label: '❌ Quit',
        click: () => {
          app.quit();
        },
      },
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  private toggleMonitoring(): void {
    if (this.isMonitoring) {
      this.clipboardService.stop();
      this.isMonitoring = false;
      dialog.showMessageBox({
        type: 'info',
        title: 'ClipGuard',
        message: 'Clipboard monitoring stopped',
        buttons: ['OK'],
      });
    } else {
      if (this.mainWindow) {
        this.clipboardService.start(this.mainWindow);
      }
      this.isMonitoring = true;
      dialog.showMessageBox({
        type: 'info',
        title: 'ClipGuard',
        message: 'Clipboard monitoring started',
        buttons: ['OK'],
      });
    }
    this.updateTrayMenu();
  }

  private testDetection(): void {
    const mockData = [
      ''ghp_' + 'exampletoken1234567890testtoken1234567890'',
      ''sk_live_' + 'test1234567890abcdefghijkl'',
      'AKIAIOSFODNN7EXAMPLE',
      ''sk_test_' + 'example1234567890example'',
    ];

    const mockType = mockData[Math.floor(Math.random() * mockData.length)];
    clipboard.writeText(mockType);

    dialog.showMessageBox({
      type: 'info',
      title: 'ClipGuard Test',
      message: '🧪 Mock Data Copied to Clipboard',
      detail: `Data: ${mockType}\n\nCheck for warning dialog!`,
      buttons: ['OK'],
    });
  }

  private convertToMockData(): void {
    try {
      const currentData = clipboard.readText();

      if (!currentData.trim()) {
        dialog.showMessageBox({
          type: 'info',
          title: 'ClipGuard',
          message: 'Clipboard is empty',
          buttons: ['OK'],
        });
        return;
      }

      // Detect pattern and create mock equivalent
      let mockData = currentData;
      let detectedType = '';

      // GitHub token: ghp_*
      if (/^ghp_[A-Za-z0-9_]{36}/.test(currentData)) {
        mockData = 'ghp_MOCK_TESTKEY_1234567890abcdefghijklmnop';
        detectedType = 'GitHub Token';
      }
      // Stripe live key: sk_live_*
      else if (/^sk_live_[A-Za-z0-9]{24,}/.test(currentData)) {
        mockData = 'sk_live_MOCK_TESTKEY_1234567890abcdefgh';
        detectedType = 'Stripe Live Key';
      }
      // Stripe test key: sk_test_*
      else if (/^sk_test_[A-Za-z0-9]{24,}/.test(currentData)) {
        mockData = 'sk_test_MOCK_TESTKEY_1234567890abcdefgh';
        detectedType = 'Stripe Test Key';
      }
      // AWS Access Key: AKIA*
      else if (/^AKIA[0-9A-Z]{16}/.test(currentData)) {
        mockData = 'AKIAMOCK1234567890ABCDEF';
        detectedType = 'AWS Access Key';
      }
      // Generic API key pattern
      else if (currentData.length > 20 && /^[A-Za-z0-9_\-]{20,}$/.test(currentData)) {
        mockData = `MOCK_TESTKEY_${currentData.substring(0, 15)}`;
        detectedType = 'API Key';
      } else {
        dialog.showMessageBox({
          type: 'warning',
          title: 'ClipGuard',
          message: 'No sensitive data pattern detected',
          detail: 'Clipboard content does not appear to contain API keys, tokens, or credentials.',
          buttons: ['OK'],
        });
        return;
      }

      // Replace with mock data
      clipboard.writeText(mockData);

      dialog.showMessageBox({
        type: 'info',
        title: 'ClipGuard',
        message: '✅ Converted to Mock Data',
        detail: `Type: ${detectedType}\nMock: ${mockData}\n\nYour original data is safe!`,
        buttons: ['OK'],
      });
    } catch (error) {
      this.logger.error('Error converting to mock data', error instanceof Error ? error : new Error(String(error)));
      dialog.showMessageBox({
        type: 'error',
        title: 'ClipGuard',
        message: 'Error converting to mock data',
        buttons: ['OK'],
      });
    }
  }

  private showDetectionHistory(): void {
    const history = this.storage.getDetectionHistory();

    if (history.length === 0) {
      dialog.showMessageBox({
        type: 'info',
        title: 'Detection History',
        message: 'No detections yet',
        buttons: ['OK'],
      });
      return;
    }

    const recent = history.slice(-10).reverse();
    const detailText = recent
      .map(
        (item, idx) =>
          `${idx + 1}. [${item.severity.toUpperCase()}] ${item.types.join(', ')} - ${new Date(item.timestamp).toLocaleString()}`,
      )
      .join('\n');

    dialog.showMessageBox({
      type: 'info',
      title: 'Detection History (Last 10)',
      message: 'Recent Detections',
      detail: detailText,
      buttons: ['OK'],
    });
  }

  private setupIpcHandlers(): void {
    ipcMain.handle('app:get-platform', () => {
      return PlatformDetector.getPlatformInfo();
    });

    ipcMain.handle('app:get-version', () => {
      return {
        version: '1.0.0',
        platform: PlatformDetector.getPlatform(),
      };
    });

    ipcMain.handle('app:is-monitoring', () => {
      return this.isMonitoring;
    });

    ipcMain.handle('app:toggle-monitoring', () => {
      this.toggleMonitoring();
      return this.isMonitoring;
    });
  }

  isMonitoringActive(): boolean {
    return this.isMonitoring;
  }

  // Phase 2 Integration Point 9: AppService methods for health reporting
  /**
   * Get overall application health status
   * Combines watchdog metrics with service error tracking
   */
  public getAppHealth(): {
    status: 'healthy' | 'degraded' | 'critical';
    watchdog: ReturnType<WatchdogService['getHealthStatus']>;
    serviceErrorCount: number;
    lastCheck: Date;
  } {
    const watchdogStatus = this.watchdog.getHealthStatus();
    const totalErrors = Array.from(this.serviceErrors.values()).reduce((a, b) => a + b, 0);

    // Determine overall status based on watchdog metrics and error count
    let overallStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (!watchdogStatus.isResponsive || watchdogStatus.memory > 500) {
      overallStatus = 'critical';
    } else if (watchdogStatus.cpu > 80 || watchdogStatus.detectorLatency > 100 || totalErrors > 5) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      watchdog: watchdogStatus,
      serviceErrorCount: totalErrors,
      lastCheck: new Date(),
    };
  }

  /**
   * Report a service error for tracking and health monitoring
   * Increments error count for the service and logs to Sentry if enabled
   *
   * @param feature - Service/feature name (e.g., 'clipboard', 'detector', 'storage')
   * @param error - The error that occurred
   */
  public reportServiceError(feature: string, error: Error | string): void {
    const errorCount = (this.serviceErrors.get(feature) || 0) + 1;
    this.serviceErrors.set(feature, errorCount);

    const err = typeof error === 'string' ? new Error(error) : error;

    // Log locally
    this.logger.error(`Service error reported: ${feature}`, err);

    // Record in watchdog for health monitoring
    this.watchdog.recordServiceEvent({
      type: 'error',
      service: feature,
      message: err.message,
      timestamp: Date.now(),
      data: {
        errorCount,
        severity: errorCount > 5 ? 'critical' : 'warning',
      },
    });

    // Report to Sentry if enabled
    this.sentry.captureException(err, {
      feature,
      errorCount,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get configuration value (delegates to ConfigService)
   * Used by IPC handlers and other components to access app config
   */
  public getConfig(key: string): any {
    return this.config.getConfig(key);
  }

  /**
   * Set configuration value (delegates to ConfigService)
   * Persists changes to electron-store
   */
  public setConfig(key: string, value: any): void {
    this.config.setConfig(key, value);
  }

  /**
   * Get Sentry integration instance
   * Allows other services to log errors/breadcrumbs directly if needed
   */
  public getSentry(): SentryIntegration {
    return this.sentry;
  }

  /**
   * Get Watchdog service instance
   * Allows other services to update health metrics if needed
   */
  public getWatchdog(): WatchdogService {
    return this.watchdog;
  }

  // Phase 2 Integration Point 10: Shutdown with proper cleanup
  shutdown(): void {
    this.logger.info('ClipGuard shutting down');

    // Stop all services in reverse initialization order
    this.clipboardService.stop();
    this.isMonitoring = false;

    // Phase 2 Integration Point 11: Stop watchdog service
    this.watchdog.stop();

    // Phase 2 Integration Point 12: Close Sentry connection gracefully
    // Ensures any pending error reports are flushed before shutdown
    this.sentry.close(2000).catch((err) => {
      this.logger.error('Error closing Sentry connection', err instanceof Error ? err : new Error(String(err)));
    });

    this.logger.info('ClipGuard shutdown complete');
  }
}
