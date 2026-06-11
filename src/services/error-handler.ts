import { app, dialog, BrowserWindow } from 'electron';
import { LoggerService } from './logger-service';

// Recovery history entry type
export interface RecoveryHistoryEntry {
  feature: string;
  disabled: number; // timestamp
  recovered: number | null;
  timestamp: number;
  reason?: string;
}

// Watchdog event type
export interface WatchdogEvent {
  type: 'error' | 'recovery' | 'feature_disabled' | 'feature_recovered';
  feature?: string;
  errorMessage?: string;
  timestamp: number;
}

// Feature dependency map for graceful degradation
type FeatureDependencies = Record<string, string[]>;

export class ErrorHandler {
  private criticalErrorCount = 0;
  private maxCriticalErrors = 5;
  private disabledFeatures = new Set<string>();
  private restartCount = 0;
  private lastCrashTime = 0;
  private recoveryHistory: RecoveryHistoryEntry[] = [];
  private watchdogCallbacks: ((event: WatchdogEvent) => void)[] = [];
  private featureDependencies: FeatureDependencies = {};
  private featureRecoveryAttempts: Map<string, number> = new Map();
  private maxRecoveryAttempts = 3;
  private uncaughtExceptionHandler?: (error: Error) => void;
  private unhandledRejectionHandler?: (reason: any, promise: Promise<any>) => void;

  constructor(private logger: LoggerService) {
    this.setupGlobalHandlers();
  }

  private setupGlobalHandlers(): void {
    this.uncaughtExceptionHandler = (error) => {
      this.handleUncaughtException(error);
    };
    this.unhandledRejectionHandler = (reason, promise) => {
      this.handleUnhandledRejection(reason, promise);
    };

    process.on('uncaughtException', this.uncaughtExceptionHandler);
    process.on('unhandledRejection', this.unhandledRejectionHandler);
  }

  // Clean up event listeners
  cleanup(): void {
    if (this.uncaughtExceptionHandler) {
      process.removeListener('uncaughtException', this.uncaughtExceptionHandler);
    }
    if (this.unhandledRejectionHandler) {
      process.removeListener('unhandledRejection', this.unhandledRejectionHandler);
    }
  }

  handleUncaughtException(error: Error): void {
    this.criticalErrorCount++;
    this.logger.error('Uncaught exception', error, { count: this.criticalErrorCount });

    this.showErrorNotification('Critical Error', 'An unexpected error occurred. Please restart ClipGuard.');

    if (this.criticalErrorCount >= this.maxCriticalErrors) {
      this.logger.error('Too many critical errors, exiting');
      app.quit();
    }
  }

  handleUnhandledRejection(reason: any, _promise: Promise<any>): void {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    this.logger.error('Unhandled rejection', error);
  }

  disableFeature(feature: string, reason: string): void {
    this.disabledFeatures.add(feature);
    this.logger.warn(`Feature disabled: ${feature}`, { reason });
  }

  isFeatureDisabled(feature: string): boolean {
    return this.disabledFeatures.has(feature);
  }

  canRestart(): boolean {
    const now = Date.now();
    const timeSinceLastCrash = now - this.lastCrashTime;

    if (this.restartCount >= 3 && timeSinceLastCrash < 180000) {
      // More than 3 restarts in 3 minutes = unrecoverable
      return false;
    }

    return true;
  }

  recordCrash(): void {
    this.lastCrashTime = Date.now();
    this.restartCount++;
    this.logger.warn('Crash recorded', { restartCount: this.restartCount });
  }

  resetCrashCounter(): void {
    this.restartCount = 0;
    this.criticalErrorCount = 0;
    this.logger.info('Crash counter reset');
  }

  private showErrorNotification(title: string, message: string): void {
    try {
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        dialog.showErrorBox(title, message);
      } else {
        this.logger.error(title, new Error(message));
      }
    } catch (err) {
      this.logger.error('Failed to show error notification', err instanceof Error ? err : new Error(String(err)));
    }
  }

  getErrorSummary(): Record<string, any> {
    return {
      criticalErrorCount: this.criticalErrorCount,
      disabledFeatures: Array.from(this.disabledFeatures),
      restartCount: this.restartCount,
      canRecover: this.canRestart(),
    };
  }

  // Retry logic with exponential backoff
  async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxAttempts: number = 3,
    initialDelayMs: number = 100
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.logger.debug(`Retry attempt ${attempt}/${maxAttempts}`, { initialDelayMs });
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(`Retry attempt ${attempt} failed`, {
          attempt,
          maxAttempts,
          error: lastError.message,
        });

        if (attempt < maxAttempts) {
          // Exponential backoff: initialDelayMs * 2^(attempt-1)
          const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    throw new Error(
      `Failed after ${maxAttempts} attempts: ${lastError?.message || 'Unknown error'}`
    );
  }

  // Feature recovery: attempt to re-enable a disabled feature
  async recoverFeature(feature: string): Promise<boolean> {
    if (!this.disabledFeatures.has(feature)) {
      this.logger.info(`Feature ${feature} is not disabled, skipping recovery`);
      return true;
    }

    if (!this.shouldAttemptRecovery(feature)) {
      this.logger.warn(`Recovery attempts exhausted for feature: ${feature}`);
      return false;
    }

    try {
      this.logger.info(`Attempting to recover feature: ${feature}`);

      // Simulate recovery attempt (can be overridden by calling code)
      await this.retryWithBackoff(
        async () => {
          // Placeholder for actual recovery logic
          // Calling code should inject feature-specific recovery handlers
          return true;
        },
        2,
        50
      );

      this.disabledFeatures.delete(feature);
      this.featureRecoveryAttempts.delete(feature);

      // Record recovery in history
      const historyEntry = this.recoveryHistory.find((e) => e.feature === feature && e.recovered === null);
      if (historyEntry) {
        historyEntry.recovered = Date.now();
      }

      this.logger.info(`Feature recovered successfully: ${feature}`);
      this.notifyWatchdog({
        type: 'feature_recovered',
        feature,
        timestamp: Date.now(),
      });

      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Recovery failed for feature: ${feature}`, err);

      // Increment recovery attempt counter
      const attempts = (this.featureRecoveryAttempts.get(feature) || 0) + 1;
      this.featureRecoveryAttempts.set(feature, attempts);

      return false;
    }
  }

  // Watchdog integration: notify health tracking systems
  notifyWatchdog(event: WatchdogEvent): void {
    this.logger.debug('Watchdog event', {
      type: event.type,
      feature: event.feature,
      timestamp: event.timestamp,
    });

    // Invoke all registered watchdog callbacks
    for (const callback of this.watchdogCallbacks) {
      try {
        callback(event);
      } catch (error) {
        this.logger.error('Watchdog callback failed', error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  // Register a watchdog callback for health monitoring
  registerWatchdogCallback(callback: (event: WatchdogEvent) => void): void {
    this.watchdogCallbacks.push(callback);
    this.logger.debug('Watchdog callback registered', { count: this.watchdogCallbacks.length });
  }

  // Sentry integration: log errors with context
  logToSentry(error: Error, context: Record<string, any> = {}): void {
    this.logger.error('Logging to Sentry', error, {
      ...context,
      timestamp: Date.now(),
      disabledFeatures: Array.from(this.disabledFeatures),
      criticalErrorCount: this.criticalErrorCount,
    });

    // In production, this would call Sentry.captureException()
    // Example: if (typeof window !== 'undefined' && (window as any).Sentry) {
    //   (window as any).Sentry.captureException(error, { contexts: { custom: context } });
    // }
  }

  // Graceful degradation: disable feature and all its dependents
  disableFeatureChain(features: string[], reason: string = 'Graceful degradation'): void {
    const toDisable = new Set<string>(features);
    const queue = [...features];

    // BFS to find all dependent features
    while (queue.length > 0) {
      const current = queue.shift()!;

      // Find all features that depend on current
      for (const [dependent, dependencies] of Object.entries(this.featureDependencies)) {
        if (dependencies.includes(current) && !toDisable.has(dependent)) {
          toDisable.add(dependent);
          queue.push(dependent);
        }
      }
    }

    // Disable all affected features
    for (const feature of toDisable) {
      this.disableFeature(feature, `${reason} (chain: ${Array.from(toDisable).join(', ')})`);
      this.notifyWatchdog({
        type: 'feature_disabled',
        feature,
        timestamp: Date.now(),
      });

      // Record in recovery history
      this.recoveryHistory.push({
        feature,
        disabled: Date.now(),
        recovered: null,
        timestamp: Date.now(),
        reason,
      });
    }

    this.logger.warn(`Disabled feature chain (${toDisable.size} features)`, {
      features: Array.from(toDisable),
      reason,
    });
  }

  // Set feature dependencies for cascading disables
  setFeatureDependencies(dependencies: FeatureDependencies): void {
    this.featureDependencies = { ...this.featureDependencies, ...dependencies };
    this.logger.debug('Feature dependencies updated', { dependencies });
  }

  // Get recovery history
  getRecoveryHistory(): RecoveryHistoryEntry[] {
    return [...this.recoveryHistory];
  }

  // Get recovery history filtered by feature
  getRecoveryHistoryForFeature(feature: string): RecoveryHistoryEntry[] {
    return this.recoveryHistory.filter((entry) => entry.feature === feature);
  }

  // Clear old recovery history (older than maxAgeMs)
  clearRecoveryHistory(maxAgeMs: number = 86400000): void {
    const cutoffTime = Date.now() - maxAgeMs;
    const before = this.recoveryHistory.length;

    this.recoveryHistory = this.recoveryHistory.filter((entry) => entry.timestamp > cutoffTime);

    this.logger.info('Recovery history cleared', {
      before,
      after: this.recoveryHistory.length,
      removed: before - this.recoveryHistory.length,
    });
  }

  // Determine if recovery should be attempted
  shouldAttemptRecovery(feature: string): boolean {
    const attempts = this.featureRecoveryAttempts.get(feature) || 0;

    // Don't attempt if max attempts reached
    if (attempts >= this.maxRecoveryAttempts) {
      this.logger.warn(`Max recovery attempts reached for ${feature}`, { attempts });
      return false;
    }

    // Check recovery history for repeated failures
    const history = this.getRecoveryHistoryForFeature(feature);
    const recentFailures = history.filter(
      (entry) => Date.now() - entry.timestamp < 300000 && entry.recovered === null
    );

    // If more than 2 recent failures, don't attempt
    if (recentFailures.length > 2) {
      this.logger.warn(`Too many recent failures for ${feature}`, {
        failures: recentFailures.length,
      });
      return false;
    }

    return true;
  }

  // Set max recovery attempts (default: 3)
  setMaxRecoveryAttempts(maxAttempts: number): void {
    this.maxRecoveryAttempts = maxAttempts;
    this.logger.debug('Max recovery attempts updated', { maxAttempts });
  }

  // Reset recovery state for a feature
  resetFeatureRecoveryState(feature: string): void {
    this.featureRecoveryAttempts.delete(feature);
    this.logger.info(`Recovery state reset for feature: ${feature}`);
  }

  // Get recovery statistics
  getRecoveryStatistics(): Record<string, any> {
    const stats: Record<string, any> = {
      totalRecoveryAttempts: this.recoveryHistory.length,
      successfulRecoveries: this.recoveryHistory.filter((e) => e.recovered !== null).length,
      failedRecoveries: this.recoveryHistory.filter((e) => e.recovered === null).length,
      featureAttempts: Object.fromEntries(this.featureRecoveryAttempts),
      disabledFeatures: Array.from(this.disabledFeatures),
    };

    return stats;
  }
}
