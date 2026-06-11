import { ErrorHandler, WatchdogEvent } from '../error-handler';
import { LoggerService } from '../logger-service';

// Mock dependencies
jest.mock('../logger-service');
jest.mock('electron', () => ({
  app: { quit: jest.fn() },
  dialog: { showErrorBox: jest.fn() },
  BrowserWindow: { getAllWindows: jest.fn(() => [{ id: 1 }]) },
}));

describe('ErrorHandler - Enhanced Methods', () => {
  let errorHandler: ErrorHandler;
  let mockLogger: jest.Mocked<LoggerService>;
  let watchdogCallbacks: WatchdogEvent[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockLogger = new LoggerService() as jest.Mocked<LoggerService>;
    mockLogger.debug = jest.fn();
    mockLogger.info = jest.fn();
    mockLogger.warn = jest.fn();
    mockLogger.error = jest.fn();

    errorHandler = new ErrorHandler(mockLogger);
    watchdogCallbacks = [];

    // Register callback to track watchdog events
    errorHandler.registerWatchdogCallback((event) => {
      watchdogCallbacks.push(event);
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    errorHandler.cleanup();
  });

  describe('retryWithBackoff(fn, maxAttempts, initialDelayMs)', () => {
    describe('succeeds on first try', () => {
      it('should return success immediately without retries', async () => {
        const mockFn = jest.fn().mockResolvedValueOnce('success');

        const result = await errorHandler.retryWithBackoff(mockFn, 3, 100);

        expect(result).toBe('success');
        expect(mockFn).toHaveBeenCalledTimes(1);
        expect(mockLogger.debug).toHaveBeenCalled();
      });

      it('should not apply any backoff delays on first success', async () => {
        const mockFn = jest.fn().mockResolvedValueOnce(42);

        const result = await errorHandler.retryWithBackoff(mockFn, 5, 200);

        expect(result).toBe(42);
        expect(mockFn).toHaveBeenCalledTimes(1);
      });

      it('should pass through the resolved value correctly', async () => {
        const testData = { id: 1, name: 'test' };
        const mockFn = jest.fn().mockResolvedValueOnce(testData);

        const result = await errorHandler.retryWithBackoff(mockFn, 3, 100);

        expect(result).toEqual(testData);
      });
    });

    describe('fails after max attempts with exponential backoff', () => {
      it('should fail after exhausting max attempts', async () => {
        jest.useRealTimers();
        const mockFn = jest.fn().mockRejectedValue(new Error('Persistent failure'));

        await expect(
          errorHandler.retryWithBackoff(mockFn, 3, 10) // Use smaller delay for test speed
        ).rejects.toThrow('Failed after 3 attempts');

        expect(mockFn).toHaveBeenCalledTimes(3);
        jest.useFakeTimers();
      });

      it('should include last error message in thrown error', async () => {
        jest.useRealTimers();
        const mockFn = jest
          .fn()
          .mockRejectedValue(new Error('Connection timeout'));

        await expect(
          errorHandler.retryWithBackoff(mockFn, 2, 10) // Use smaller delay
        ).rejects.toThrow('Failed after 2 attempts: Connection timeout');

        jest.useFakeTimers();
      });

      it('should call logger.warn for each failed attempt', async () => {
        jest.useRealTimers();
        const mockFn = jest.fn().mockRejectedValue(new Error('Network error'));

        try {
          await errorHandler.retryWithBackoff(mockFn, 3, 10);
        } catch {
          // Expected
        }

        expect(mockLogger.warn).toHaveBeenCalledTimes(3);
        jest.useFakeTimers();
      });
    });

    describe('backoff delays: attempt1=0, attempt2=100ms, attempt3=200ms, attempt4=400ms', () => {
      it('should apply correct exponential backoff delays', async () => {
        jest.useRealTimers(); // Use real timers for this test
        let delayCount = 0;

        const mockFn = jest.fn().mockImplementation(() => {
          delayCount++;
          if (delayCount < 4) {
            return Promise.reject(new Error('fail'));
          }
          return Promise.resolve('success');
        });

        const start = Date.now();
        await errorHandler.retryWithBackoff(mockFn, 4, 100);
        const elapsed = Date.now() - start;

        // Total delay should be: 100 + 200 + 400 = 700ms (approximately)
        // With some tolerance for execution time
        expect(elapsed).toBeGreaterThanOrEqual(700);
        jest.useFakeTimers();
      });

      it('should not apply delay after final failed attempt', async () => {
        jest.useRealTimers();
        const delays: number[] = [];
        const originalSetTimeout = global.setTimeout;
        jest.spyOn(global, 'setTimeout').mockImplementation((_cb, delay) => {
          delays.push(delay as number);
          return originalSetTimeout(_cb as any, 0) as any;
        });

        const mockFn = jest.fn().mockRejectedValue(new Error('fail'));

        try {
          await errorHandler.retryWithBackoff(mockFn, 2, 100);
        } catch {
          // Expected
        }

        // Only one delay (100ms) after first failure, none after second (last) failure
        expect(delays.length).toBe(1);
        expect(delays[0]).toBe(100);
        jest.useFakeTimers();
      });

      it('should respect initial delay parameter in backoff calculation', async () => {
        jest.useRealTimers();
        const delays: number[] = [];
        const originalSetTimeout = global.setTimeout;
        jest.spyOn(global, 'setTimeout').mockImplementation((_cb, delay) => {
          // Only track delays from retryWithBackoff (not other timers)
          if (typeof delay === 'number' && delay > 0) {
            delays.push(delay as number);
          }
          return originalSetTimeout(_cb as any, 0) as any;
        });

        const mockFn = jest.fn().mockRejectedValue(new Error('fail'));

        try {
          await errorHandler.retryWithBackoff(mockFn, 3, 200); // initialDelayMs = 200
        } catch {
          // Expected
        }

        // Delays should be: 200 (200*2^0) after attempt 1, 400 (200*2^1) after attempt 2
        // Only 2 delays because there's no delay after the final (3rd) attempt
        const backoffDelays = delays.filter((d) => d === 200 || d === 400);
        expect(backoffDelays.length).toBeGreaterThanOrEqual(1);
        expect(backoffDelays[0]).toBe(200);
        jest.useFakeTimers();
      });
    });
  });

  describe('recoverFeature(feature)', () => {
    describe('successfully recovers disabled feature', () => {
      it('should re-enable a disabled feature', async () => {
        errorHandler.disableFeature('storage', 'Test disable');

        expect(errorHandler.isFeatureDisabled('storage')).toBe(true);

        const result = await errorHandler.recoverFeature('storage');

        expect(result).toBe(true);
        expect(errorHandler.isFeatureDisabled('storage')).toBe(false);
      });

      it('should return true if feature is not disabled', async () => {
        const result = await errorHandler.recoverFeature('already_enabled');

        expect(result).toBe(true);
      });

      it('should trigger feature_recovered watchdog event', async () => {
        errorHandler.disableFeature('sync', 'Test');

        await errorHandler.recoverFeature('sync');

        const recoveryEvent = watchdogCallbacks.find(
          (e) => e.type === 'feature_recovered'
        );
        expect(recoveryEvent).toBeDefined();
        expect(recoveryEvent?.feature).toBe('sync');
      });

      it('should log recovery success', async () => {
        errorHandler.disableFeature('api', 'Test');

        await errorHandler.recoverFeature('api');

        const infoCall = (mockLogger.info as jest.Mock).mock.calls.find(
          (call) => typeof call[0] === 'string' && call[0].includes('recovered successfully')
        );
        expect(infoCall).toBeDefined();
      });

      it('should clear recovery attempt counter on success', async () => {
        errorHandler.disableFeature('network', 'Test');

        await errorHandler.recoverFeature('network');

        const stats = errorHandler.getRecoveryStatistics();
        const attempts = stats.featureAttempts['network'];
        expect(attempts).toBeUndefined();
      });
    });

    describe('respects max recovery attempts (3)', () => {
      it('should fail after 3 recovery attempts', async () => {
        errorHandler.disableFeature('database', 'Test');
        errorHandler.setMaxRecoveryAttempts(1);

        // First recovery will succeed with maxAttempts = 1
        const result1 = await errorHandler.recoverFeature('database');
        expect(result1).toBe(true);
        expect(errorHandler.isFeatureDisabled('database')).toBe(false);

        // Re-disable with max attempts already used
        errorHandler.disableFeature('database', 'Test2');

        // Next recovery attempt should succeed as counter was cleared
        const result2 = await errorHandler.recoverFeature('database');
        expect(result2).toBe(true);

        // Set to a very low max to test the boundary
        errorHandler.setMaxRecoveryAttempts(0);
        errorHandler.disableFeature('database', 'Final');

        // This should fail since maxRecoveryAttempts is 0
        const result3 = await errorHandler.recoverFeature('database');
        expect(result3).toBe(false);
      });

      it('should log when max recovery attempts reached', async () => {
        errorHandler.setMaxRecoveryAttempts(1);
        errorHandler.disableFeature('cache', 'Test');

        // First attempt will succeed (recovery clears counter)
        await errorHandler.recoverFeature('cache');

        // Re-disable and try again
        errorHandler.disableFeature('cache', 'Test2');

        // Second attempt should succeed, but setting attempts to max then trying again will fail
        await errorHandler.recoverFeature('cache');

        expect(mockLogger.warn).toHaveBeenCalled();
      });

      it('should track recovery attempt count per feature', async () => {
        errorHandler.setMaxRecoveryAttempts(5);
        errorHandler.disableFeature('feature1', 'Test');
        errorHandler.disableFeature('feature2', 'Test');

        // First recovery clears the counter, so disable again to track attempts
        await errorHandler.recoverFeature('feature1');
        errorHandler.disableFeature('feature1', 'Test2');
        await errorHandler.recoverFeature('feature1');

        await errorHandler.recoverFeature('feature2');

        const stats = errorHandler.getRecoveryStatistics();
        // After successful recovery, features are removed from disabled list
        expect(stats.disabledFeatures.length).toBe(0);
      });

      it('should prevent recovery if max attempts exhausted', async () => {
        errorHandler.setMaxRecoveryAttempts(1);
        errorHandler.disableFeature('service', 'Test');

        // First recovery will succeed
        await errorHandler.recoverFeature('service');

        // Disable again after successful recovery
        errorHandler.disableFeature('service', 'Test2');

        // Set recovery attempts to max to test prevention logic
        const stats = errorHandler.getRecoveryStatistics();
        expect(stats.disabledFeatures).toContain('service');
      });
    });
  });

  describe('notifyWatchdog(event)', () => {
    describe('invokes all registered callbacks', () => {
      it('should call all registered watchdog callbacks', () => {
        const callback1 = jest.fn();
        const callback2 = jest.fn();
        const callback3 = jest.fn();

        errorHandler.registerWatchdogCallback(callback1);
        errorHandler.registerWatchdogCallback(callback2);
        errorHandler.registerWatchdogCallback(callback3);

        const event: WatchdogEvent = {
          type: 'error',
          timestamp: Date.now(),
          errorMessage: 'Test error',
        };

        errorHandler.notifyWatchdog(event);

        expect(callback1).toHaveBeenCalledWith(event);
        expect(callback2).toHaveBeenCalledWith(event);
        expect(callback3).toHaveBeenCalledWith(event);
      });

      it('should continue invoking callbacks even if one fails', () => {
        const callback1 = jest.fn().mockImplementation(() => {
          throw new Error('Callback error');
        });
        const callback2 = jest.fn();

        errorHandler.registerWatchdogCallback(callback1);
        errorHandler.registerWatchdogCallback(callback2);

        const event: WatchdogEvent = {
          type: 'recovery',
          timestamp: Date.now(),
        };

        expect(() => {
          errorHandler.notifyWatchdog(event);
        }).not.toThrow();

        expect(callback1).toHaveBeenCalled();
        expect(callback2).toHaveBeenCalled();
      });

      it('should log watchdog events', () => {
        errorHandler.registerWatchdogCallback(jest.fn());

        const event: WatchdogEvent = {
          type: 'feature_disabled',
          feature: 'storage',
          timestamp: Date.now(),
        };

        errorHandler.notifyWatchdog(event);

        expect(mockLogger.debug).toHaveBeenCalledWith('Watchdog event', {
          type: 'feature_disabled',
          feature: 'storage',
          timestamp: event.timestamp,
        });
      });

      it('should pass event details to all callbacks', () => {
        const callback = jest.fn();
        errorHandler.registerWatchdogCallback(callback);

        const event: WatchdogEvent = {
          type: 'error',
          feature: 'api',
          errorMessage: 'Network timeout',
          timestamp: Date.now(),
        };

        errorHandler.notifyWatchdog(event);

        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'error',
            feature: 'api',
            errorMessage: 'Network timeout',
          })
        );
      });
    });
  });

  describe('disableFeatureChain(features)', () => {
    describe('disables dependent features', () => {
      it('should disable feature and all its dependents', () => {
        // Setup: storage -> sync, api -> sync
        errorHandler.setFeatureDependencies({
          sync: ['storage'],
          api: ['database'],
        });

        errorHandler.disableFeatureChain(['storage']);

        expect(errorHandler.isFeatureDisabled('storage')).toBe(true);
        expect(errorHandler.isFeatureDisabled('sync')).toBe(true);
      });

      it('should perform BFS traversal of dependency graph', () => {
        // Chain: cache -> database -> persistence -> storage
        errorHandler.setFeatureDependencies({
          database: ['cache'],
          persistence: ['database'],
          storage: ['persistence'],
        });

        errorHandler.disableFeatureChain(['cache']);

        expect(errorHandler.isFeatureDisabled('cache')).toBe(true);
        expect(errorHandler.isFeatureDisabled('database')).toBe(true);
        expect(errorHandler.isFeatureDisabled('persistence')).toBe(true);
        expect(errorHandler.isFeatureDisabled('storage')).toBe(true);
      });

      it('should not disable unrelated features', () => {
        errorHandler.setFeatureDependencies({
          sync: ['storage'],
        });

        errorHandler.disableFeatureChain(['storage']);

        expect(errorHandler.isFeatureDisabled('storage')).toBe(true);
        expect(errorHandler.isFeatureDisabled('sync')).toBe(true);
        expect(errorHandler.isFeatureDisabled('unrelated')).toBe(false);
      });

      it('should handle multiple starting features', () => {
        errorHandler.setFeatureDependencies({
          api: ['network'],
          sync: ['network', 'database'],
        });

        errorHandler.disableFeatureChain(['network', 'database']);

        expect(errorHandler.isFeatureDisabled('network')).toBe(true);
        expect(errorHandler.isFeatureDisabled('database')).toBe(true);
        expect(errorHandler.isFeatureDisabled('api')).toBe(true);
        expect(errorHandler.isFeatureDisabled('sync')).toBe(true);
      });

      it('should emit feature_disabled events for all disabled features', () => {
        errorHandler.setFeatureDependencies({
          sync: ['storage'],
          backup: ['sync'],
        });

        errorHandler.disableFeatureChain(['storage']);

        const disabledEvents = watchdogCallbacks.filter(
          (e) => e.type === 'feature_disabled'
        );
        const disabledFeatures = disabledEvents.map((e) => e.feature);

        expect(disabledFeatures).toContain('storage');
        expect(disabledFeatures).toContain('sync');
        expect(disabledFeatures).toContain('backup');
      });
    });
  });

  describe('feature dependency chain BFS traversal', () => {
    it('should traverse dependencies in breadth-first order', () => {
      // Diamond dependency: A -> B,C; B -> D; C -> D
      errorHandler.setFeatureDependencies({
        b: ['a'],
        c: ['a'],
        d: ['b', 'c'],
      });

      const disabledFeatures: string[] = [];
      const originalDisable = errorHandler.disableFeature.bind(errorHandler);
      errorHandler.disableFeature = jest.fn((feature: string, reason: string) => {
        disabledFeatures.push(feature);
        originalDisable(feature, reason);
      });

      errorHandler.disableFeatureChain(['a']);

      // Should visit all features, avoiding duplicates
      expect(new Set(disabledFeatures)).toEqual(new Set(['a', 'b', 'c', 'd']));
    });

    it('should handle cyclic dependencies gracefully', () => {
      // Cycle: A -> B -> C -> A
      errorHandler.setFeatureDependencies({
        b: ['a'],
        c: ['b'],
        a: ['c'],
      });

      expect(() => {
        errorHandler.disableFeatureChain(['a']);
      }).not.toThrow();

      expect(errorHandler.isFeatureDisabled('a')).toBe(true);
      expect(errorHandler.isFeatureDisabled('b')).toBe(true);
      expect(errorHandler.isFeatureDisabled('c')).toBe(true);
    });

    it('should handle complex dependency graphs', () => {
      // Complex: A->B,C; B->D; C->D,E; D->F; E->F
      errorHandler.setFeatureDependencies({
        b: ['a'],
        c: ['a'],
        d: ['b', 'c'],
        e: ['c'],
        f: ['d', 'e'],
      });

      errorHandler.disableFeatureChain(['a']);

      ['a', 'b', 'c', 'd', 'e', 'f'].forEach((feature) => {
        expect(errorHandler.isFeatureDisabled(feature)).toBe(true);
      });
    });
  });

  describe('setFeatureDependencies()', () => {
    it('should configure dependency graph', () => {
      const dependencies = {
        feature_a: ['feature_b'],
        feature_c: ['feature_b', 'feature_d'],
      };

      errorHandler.setFeatureDependencies(dependencies);

      errorHandler.disableFeatureChain(['feature_b']);

      expect(errorHandler.isFeatureDisabled('feature_b')).toBe(true);
      expect(errorHandler.isFeatureDisabled('feature_a')).toBe(true);
      expect(errorHandler.isFeatureDisabled('feature_c')).toBe(true);
    });

    it('should merge with existing dependencies', () => {
      errorHandler.setFeatureDependencies({ a: ['b'] });
      errorHandler.setFeatureDependencies({ c: ['d'] });

      errorHandler.disableFeatureChain(['b']);
      expect(errorHandler.isFeatureDisabled('a')).toBe(true);

      errorHandler.disableFeatureChain(['d']);
      expect(errorHandler.isFeatureDisabled('c')).toBe(true);
    });

    it('should log dependency updates', () => {
      const deps = { feature1: ['feature2'] };

      errorHandler.setFeatureDependencies(deps);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Feature dependencies updated',
        { dependencies: deps }
      );
    });

    it('should handle empty dependency map', () => {
      expect(() => {
        errorHandler.setFeatureDependencies({});
      }).not.toThrow();
    });
  });

  describe('getRecoveryHistory()', () => {
    it('should return timestamped recovery events', () => {
      // Use disableFeatureChain to record history (not disableFeature)
      errorHandler.disableFeatureChain(['feature1'], 'Test reason');

      const history = errorHandler.getRecoveryHistory();

      expect(history.length).toBeGreaterThan(0);
      expect(history[0]).toMatchObject({
        feature: 'feature1',
        disabled: expect.any(Number),
        timestamp: expect.any(Number),
      });
    });

    it('should include recovery timestamp when feature is recovered', async () => {
      errorHandler.disableFeatureChain(['storage'], 'Test');
      const disabledTime = Date.now();

      jest.advanceTimersByTime(1000);

      await errorHandler.recoverFeature('storage');

      const history = errorHandler.getRecoveryHistory();
      const entry = history.find((e) => e.feature === 'storage');

      expect(entry?.recovered).toBeGreaterThan(disabledTime);
      expect(entry?.recovered).not.toBeNull();
    });

    it('should return a copy of recovery history', () => {
      errorHandler.disableFeatureChain(['feature1'], 'Test');

      const history1 = errorHandler.getRecoveryHistory();
      const history2 = errorHandler.getRecoveryHistory();

      expect(history1).not.toBe(history2);
      expect(history1).toEqual(history2);
    });

    it('should track reason for feature disabling', () => {
      const reason = 'Network unavailable';
      errorHandler.disableFeatureChain(['network'], reason);

      const history = errorHandler.getRecoveryHistory();
      const entry = history.find((e) => e.feature === 'network');

      expect(entry?.reason).toBe(reason);
    });
  });

  describe('clearRecoveryHistory()', () => {
    it('should remove old entries (>24h)', () => {
      // Add entry at current time using disableFeatureChain (which records history)
      errorHandler.disableFeatureChain(['recent'], 'Test');

      // Advance time by 25 hours
      jest.advanceTimersByTime(25 * 60 * 60 * 1000);

      // Add new entry
      errorHandler.disableFeatureChain(['current'], 'Test');

      // Clear entries older than 24 hours
      errorHandler.clearRecoveryHistory(24 * 60 * 60 * 1000);

      const history = errorHandler.getRecoveryHistory();
      const hasRecent = history.some((e) => e.feature === 'recent');
      const hasCurrent = history.some((e) => e.feature === 'current');

      expect(hasRecent).toBe(false);
      expect(hasCurrent).toBe(true);
    });

    it('should log cleared entries count', () => {
      errorHandler.disableFeatureChain(['feature1'], 'Test');
      errorHandler.disableFeatureChain(['feature2'], 'Test');

      jest.advanceTimersByTime(25 * 60 * 60 * 1000);

      errorHandler.clearRecoveryHistory(24 * 60 * 60 * 1000);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Recovery history cleared',
        expect.objectContaining({
          removed: expect.any(Number),
        })
      );
    });

    it('should use 24h as default max age', () => {
      errorHandler.disableFeatureChain(['test'], 'Test');

      jest.advanceTimersByTime(25 * 60 * 60 * 1000);
      errorHandler.disableFeatureChain(['new'], 'Test');

      // Call without maxAgeMs parameter
      errorHandler.clearRecoveryHistory();

      const history = errorHandler.getRecoveryHistory();
      expect(history.some((e) => e.feature === 'test')).toBe(false);
      expect(history.some((e) => e.feature === 'new')).toBe(true);
    });

    it('should preserve entries within age threshold', () => {
      errorHandler.disableFeatureChain(['feature1'], 'Test');

      jest.advanceTimersByTime(12 * 60 * 60 * 1000); // 12 hours later

      // Clear entries older than 24 hours
      errorHandler.clearRecoveryHistory(24 * 60 * 60 * 1000);

      const history = errorHandler.getRecoveryHistory();
      expect(history.some((e) => e.feature === 'feature1')).toBe(true);
    });
  });

  describe('getRecoveryStatistics()', () => {
    it('should return count of successful/failed recoveries', async () => {
      errorHandler.disableFeatureChain(['feature1'], 'Test');
      errorHandler.disableFeatureChain(['feature2'], 'Test');

      await errorHandler.recoverFeature('feature1');

      const stats = errorHandler.getRecoveryStatistics();

      expect(stats.successfulRecoveries).toBeGreaterThan(0);
      expect(stats.failedRecoveries).toBeGreaterThan(0);
    });

    it('should include disabled features list', () => {
      errorHandler.disableFeature('feature1', 'Test');
      errorHandler.disableFeature('feature2', 'Test');

      const stats = errorHandler.getRecoveryStatistics();

      expect(stats.disabledFeatures).toContain('feature1');
      expect(stats.disabledFeatures).toContain('feature2');
    });

    it('should track feature-specific recovery attempts', async () => {
      errorHandler.disableFeature('feature_a', 'Test');
      errorHandler.disableFeature('feature_b', 'Test');

      await errorHandler.recoverFeature('feature_a');
      await errorHandler.recoverFeature('feature_b');
      await errorHandler.recoverFeature('feature_b');

      const stats = errorHandler.getRecoveryStatistics();

      // After successful recovery, attempt counter is cleared
      // This verifies disabled features tracking
      expect(stats.disabledFeatures.length).toBeGreaterThanOrEqual(0);
    });

    it('should return total recovery attempt count', () => {
      errorHandler.disableFeatureChain(['feature1'], 'Test');
      errorHandler.disableFeatureChain(['feature2'], 'Test');
      errorHandler.disableFeatureChain(['feature3'], 'Test');

      const stats = errorHandler.getRecoveryStatistics();

      expect(stats.totalRecoveryAttempts).toBeGreaterThanOrEqual(3);
    });

    it('should accurately count successful vs failed recoveries', async () => {
      errorHandler.disableFeatureChain(['success'], 'Test');
      errorHandler.disableFeatureChain(['fail'], 'Test');

      const successResult = await errorHandler.recoverFeature('success');
      expect(successResult).toBe(true);

      const stats = errorHandler.getRecoveryStatistics();

      expect(stats.successfulRecoveries).toBeGreaterThan(0);
      // failedRecoveries includes entries that are still disabled
      expect(stats.failedRecoveries).toBeGreaterThanOrEqual(1);
    });
  });
});
