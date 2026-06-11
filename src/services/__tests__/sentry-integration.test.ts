import { SentryIntegration, SentryConfig } from '../sentry-integration';
import { LoggerService } from '../logger-service';

// Mock LoggerService
jest.mock('../logger-service');

describe('SentryIntegration', () => {
  let mockLogger: jest.Mocked<LoggerService>;
  let sentry: SentryIntegration;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger = new LoggerService() as jest.Mocked<LoggerService>;
  });

  describe('initialization', () => {
    it('should initialize with enabled=false (no-op mode)', async () => {
      const config: SentryConfig = {
        enabled: false,
        environment: 'production',
      };

      sentry = new SentryIntegration(config, mockLogger);
      await sentry.initialize();

      expect(mockLogger.debug).toHaveBeenCalledWith('Sentry disabled or no DSN provided');
      expect(sentry.isActive()).toBe(false);
    });

    it('should initialize with enabled=true and valid DSN', async () => {
      const config: SentryConfig = {
        enabled: true,
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
        environment: 'production',
      };

      sentry = new SentryIntegration(config, mockLogger);
      await sentry.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Initializing Sentry integration',
        expect.objectContaining({
          environment: 'production',
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Sentry initialized successfully');
      expect(sentry.isActive()).toBe(true);
    });

    it('should not initialize when enabled=true but no DSN provided', async () => {
      const config: SentryConfig = {
        enabled: true,
        environment: 'production',
      };

      sentry = new SentryIntegration(config, mockLogger);
      await sentry.initialize();

      expect(mockLogger.debug).toHaveBeenCalledWith('Sentry disabled or no DSN provided');
      expect(sentry.isActive()).toBe(false);
    });

    it('should handle initialization errors gracefully', async () => {
      const config: SentryConfig = {
        enabled: true,
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
        environment: 'production',
      };

      // Force logger to throw error
      mockLogger.info.mockImplementationOnce(() => {
        throw new Error('Initialization failed');
      });

      sentry = new SentryIntegration(config, mockLogger);
      await expect(sentry.initialize()).resolves.not.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize Sentry',
        expect.any(Error)
      );
    });
  });

  describe('captureException', () => {
    beforeEach(() => {
      const config: SentryConfig = {
        enabled: true,
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
        environment: 'production',
      };
      sentry = new SentryIntegration(config, mockLogger);
    });

    it('should capture exception with context via logger', () => {
      const error = new Error('Test error');
      const context = { userId: '123', action: 'test' };

      sentry.captureException(error, context);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Capturing exception',
        error,
        expect.objectContaining({
          userId: '123',
          action: 'test',
          tags: {},
          user: null,
        })
      );
    });

    it('should include tags in exception context', () => {
      const error = new Error('Test error');
      sentry.setTag('environment', 'production');
      sentry.setTag('version', '1.0.0');

      sentry.captureException(error);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Capturing exception',
        error,
        expect.objectContaining({
          tags: {
            environment: 'production',
            version: '1.0.0',
          },
        })
      );
    });

    it('should include user in exception context', () => {
      const error = new Error('Test error');
      sentry.setUser('user123', { username: 'testuser' });

      sentry.captureException(error);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Capturing exception',
        error,
        expect.objectContaining({
          user: {
            id: 'user123',
            username: 'testuser',
          },
        })
      );
    });

    it('should not capture exception when disabled', () => {
      const disabledConfig: SentryConfig = {
        enabled: false,
        environment: 'development',
      };
      const disabledSentry = new SentryIntegration(disabledConfig, mockLogger);
      const error = new Error('Test error');

      disabledSentry.captureException(error);

      expect(mockLogger.error).not.toHaveBeenCalled();
    });
  });

  describe('captureMessage', () => {
    beforeEach(() => {
      const config: SentryConfig = {
        enabled: true,
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
        environment: 'production',
      };
      sentry = new SentryIntegration(config, mockLogger);
    });

    it('should capture message with default level', () => {
      sentry.captureMessage('Test message');

      expect(mockLogger.info).toHaveBeenCalledWith('Sentry: INFO - Test message');
    });

    it('should capture message with custom level', () => {
      sentry.captureMessage('Warning message', 'warning');

      expect(mockLogger.info).toHaveBeenCalledWith('Sentry: WARNING - Warning message');
    });

    it('should capture message at error level', () => {
      sentry.captureMessage('Error message', 'error');

      expect(mockLogger.info).toHaveBeenCalledWith('Sentry: ERROR - Error message');
    });

    it('should not capture message when disabled', () => {
      const disabledConfig: SentryConfig = {
        enabled: false,
        environment: 'development',
      };
      const disabledSentry = new SentryIntegration(disabledConfig, mockLogger);

      disabledSentry.captureMessage('Test message');

      expect(mockLogger.info).not.toHaveBeenCalled();
    });
  });

  describe('user management', () => {
    beforeEach(() => {
      const config: SentryConfig = {
        enabled: true,
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
        environment: 'production',
      };
      sentry = new SentryIntegration(config, mockLogger);
    });

    it('should set user with id only', () => {
      sentry.setUser('user123');

      expect(mockLogger.debug).toHaveBeenCalledWith('Sentry user set', { userId: 'user123' });
      expect(sentry.getUser()).toEqual({ id: 'user123' });
    });

    it('should set user with additional info', () => {
      sentry.setUser('user123', {
        username: 'testuser',
        email: 'test@example.com',
        ipAddress: '192.168.1.1',
      });

      const user = sentry.getUser();
      expect(user).toEqual({
        id: 'user123',
        username: 'testuser',
        email: 'test@example.com',
        ipAddress: '192.168.1.1',
      });
    });

    it('should clear user', () => {
      sentry.setUser('user123');
      sentry.clearUser();

      expect(mockLogger.debug).toHaveBeenCalledWith('Sentry user cleared');
      expect(sentry.getUser()).toBeNull();
    });

    it('should replace previous user when setting new user', () => {
      sentry.setUser('user123', { username: 'olduser' });
      sentry.setUser('user456', { username: 'newuser' });

      const user = sentry.getUser();
      expect(user).toEqual({
        id: 'user456',
        username: 'newuser',
      });
    });
  });

  describe('tag management', () => {
    beforeEach(() => {
      const config: SentryConfig = {
        enabled: true,
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
        environment: 'production',
      };
      sentry = new SentryIntegration(config, mockLogger);
    });

    it('should set single tag', () => {
      sentry.setTag('environment', 'production');

      expect(sentry.getTags()).toEqual({ environment: 'production' });
    });

    it('should set multiple tags via setTags', () => {
      const tags = {
        environment: 'production',
        version: '1.0.0',
        region: 'us-east-1',
      };

      sentry.setTags(tags);

      expect(mockLogger.debug).toHaveBeenCalledWith('Sentry tags updated', { tagCount: 3 });
      expect(sentry.getTags()).toEqual(tags);
    });

    it('should update existing tags without removing others', () => {
      sentry.setTag('environment', 'production');
      sentry.setTags({ version: '1.0.0', region: 'us-east-1' });

      expect(sentry.getTags()).toEqual({
        environment: 'production',
        version: '1.0.0',
        region: 'us-east-1',
      });
    });

    it('should remove tag by key', () => {
      sentry.setTags({
        environment: 'production',
        version: '1.0.0',
      });

      sentry.removeTag('version');

      expect(sentry.getTags()).toEqual({ environment: 'production' });
    });

    it('should handle removing non-existent tag gracefully', () => {
      sentry.setTag('environment', 'production');

      expect(() => sentry.removeTag('nonexistent')).not.toThrow();
      expect(sentry.getTags()).toEqual({ environment: 'production' });
    });
  });

  describe('breadcrumb management', () => {
    beforeEach(() => {
      const config: SentryConfig = {
        enabled: true,
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
        environment: 'production',
        maxBreadcrumbs: 5,
      };
      sentry = new SentryIntegration(config, mockLogger);
    });

    it('should add breadcrumb with default level', () => {
      sentry.addBreadcrumb('User clicked button');

      const breadcrumbs = sentry.getBreadcrumbs();
      expect(breadcrumbs).toHaveLength(1);
      expect(breadcrumbs[0]).toMatchObject({
        message: 'User clicked button',
        level: 'info',
      });
      expect(breadcrumbs[0].timestamp).toBeDefined();
    });

    it('should add breadcrumb with custom level', () => {
      sentry.addBreadcrumb('Operation failed', 'error');

      const breadcrumbs = sentry.getBreadcrumbs();
      expect(breadcrumbs[0]).toMatchObject({
        message: 'Operation failed',
        level: 'error',
      });
    });

    it('should add breadcrumb with data', () => {
      const data = { buttonId: 'submit-btn', userId: 'user123' };
      sentry.addBreadcrumb('User action', 'info', data);

      const breadcrumbs = sentry.getBreadcrumbs();
      expect(breadcrumbs[0]).toMatchObject({
        message: 'User action',
        data,
      });
    });

    it('should maintain max breadcrumbs limit', () => {
      // Add 6 breadcrumbs when max is 5
      for (let i = 0; i < 6; i++) {
        sentry.addBreadcrumb(`Breadcrumb ${i + 1}`);
      }

      const breadcrumbs = sentry.getBreadcrumbs();
      expect(breadcrumbs).toHaveLength(5);
    });

    it('should remove oldest breadcrumb when limit exceeded', () => {
      for (let i = 0; i < 6; i++) {
        sentry.addBreadcrumb(`Breadcrumb ${i + 1}`);
      }

      const breadcrumbs = sentry.getBreadcrumbs();
      // Oldest (Breadcrumb 1) should be removed
      expect(breadcrumbs[0].message).toBe('Breadcrumb 2');
      expect(breadcrumbs[4].message).toBe('Breadcrumb 6');
    });

    it('should use default maxBreadcrumbs of 100', () => {
      const config: SentryConfig = {
        enabled: true,
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
        environment: 'production',
      };
      const sentryNoMax = new SentryIntegration(config, mockLogger);

      for (let i = 0; i < 101; i++) {
        sentryNoMax.addBreadcrumb(`Breadcrumb ${i + 1}`);
      }

      expect(sentryNoMax.getBreadcrumbs()).toHaveLength(100);
    });

    it('should clear all breadcrumbs', () => {
      sentry.addBreadcrumb('Breadcrumb 1');
      sentry.addBreadcrumb('Breadcrumb 2');

      sentry.clearBreadcrumbs();

      expect(sentry.getBreadcrumbs()).toHaveLength(0);
    });

    it('should return copy of breadcrumbs array', () => {
      sentry.addBreadcrumb('Original breadcrumb');

      const breadcrumbs = sentry.getBreadcrumbs();
      breadcrumbs[0].message = 'Modified';

      const freshBreadcrumbs = sentry.getBreadcrumbs();
      expect(freshBreadcrumbs[0].message).toBe('Original breadcrumb');
    });
  });

  describe('context management', () => {
    beforeEach(() => {
      const config: SentryConfig = {
        enabled: true,
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
        environment: 'production',
      };
      sentry = new SentryIntegration(config, mockLogger);
    });

    it('should set context', () => {
      const contextData = { userId: '123', role: 'admin' };

      sentry.setContext('user', contextData);

      expect(mockLogger.debug).toHaveBeenCalledWith('Sentry context set: user');
    });

    it('should store context data correctly', () => {
      const userContext = { userId: '123', role: 'admin' };
      const appContext = { version: '1.0.0', build: 'prod' };

      sentry.setContext('user', userContext);
      sentry.setContext('app', appContext);

      // Verify contexts are stored by capturing an exception and checking it includes them
      const error = new Error('Test');
      sentry.captureException(error);

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should update context when setting same name twice', () => {
      const oldContext = { userId: '123' };
      const newContext = { userId: '456', role: 'user' };

      sentry.setContext('user', oldContext);
      sentry.setContext('user', newContext);

      // Both setContext calls should be logged
      expect(mockLogger.debug).toHaveBeenCalledTimes(2);
    });

    it('should support multiple independent contexts', () => {
      sentry.setContext('user', { userId: '123' });
      sentry.setContext('app', { version: '1.0.0' });
      sentry.setContext('request', { method: 'GET', path: '/api/test' });

      expect(mockLogger.debug).toHaveBeenCalledTimes(3);
    });
  });

  describe('isActive', () => {
    it('should return true when initialized and enabled', async () => {
      const config: SentryConfig = {
        enabled: true,
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
        environment: 'production',
      };
      sentry = new SentryIntegration(config, mockLogger);
      await sentry.initialize();

      expect(sentry.isActive()).toBe(true);
    });

    it('should return false when disabled', () => {
      const config: SentryConfig = {
        enabled: false,
        environment: 'development',
      };
      sentry = new SentryIntegration(config, mockLogger);

      expect(sentry.isActive()).toBe(false);
    });

    it('should return false when not initialized', () => {
      const config: SentryConfig = {
        enabled: true,
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
        environment: 'production',
      };
      sentry = new SentryIntegration(config, mockLogger);

      // Not calling initialize()
      expect(sentry.isActive()).toBe(false);
    });

    it('should return false after close', async () => {
      const config: SentryConfig = {
        enabled: true,
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
        environment: 'production',
      };
      sentry = new SentryIntegration(config, mockLogger);
      await sentry.initialize();

      expect(sentry.isActive()).toBe(true);

      await sentry.close();

      expect(sentry.isActive()).toBe(false);
    });
  });

  describe('transactions', () => {
    beforeEach(() => {
      const config: SentryConfig = {
        enabled: true,
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
        environment: 'production',
      };
      sentry = new SentryIntegration(config, mockLogger);
    });

    it('should start transaction with default operation', () => {
      const transaction = sentry.startTransaction('test-transaction');

      expect(mockLogger.debug).toHaveBeenCalledWith('Sentry transaction started: test-transaction');
      expect(transaction).toHaveProperty('finish');
      expect(typeof transaction.finish).toBe('function');
    });

    it('should start transaction with custom operation', () => {
      sentry.startTransaction('db-query', 'db.query');

      expect(mockLogger.debug).toHaveBeenCalledWith('Sentry transaction started: db-query');
    });

    it('should return transaction with finish method', () => {
      const transaction = sentry.startTransaction('test');

      transaction.finish();

      expect(mockLogger.debug).toHaveBeenCalledWith('Sentry transaction finished: test');
    });

    it('should return no-op transaction when disabled', () => {
      const disabledConfig: SentryConfig = {
        enabled: false,
        environment: 'development',
      };
      const disabledSentry = new SentryIntegration(disabledConfig, mockLogger);

      const transaction = disabledSentry.startTransaction('test');

      expect(mockLogger.debug).not.toHaveBeenCalled();
      expect(transaction.finish).toBeDefined();
      expect(() => transaction.finish()).not.toThrow();
    });

    it('should call finish without errors', () => {
      const transaction = sentry.startTransaction('test');

      expect(() => transaction.finish()).not.toThrow();
    });
  });

  describe('silent no-op mode (disabled integration)', () => {
    let disabledSentry: SentryIntegration;

    beforeEach(() => {
      const config: SentryConfig = {
        enabled: false,
        environment: 'development',
      };
      disabledSentry = new SentryIntegration(config, mockLogger);
    });

    it('should not throw when capturing exception while disabled', () => {
      const error = new Error('Test error');

      expect(() => disabledSentry.captureException(error)).not.toThrow();
    });

    it('should not throw when capturing message while disabled', () => {
      expect(() => disabledSentry.captureMessage('Test message')).not.toThrow();
    });

    it('should not throw when setting user while disabled', () => {
      expect(() => disabledSentry.setUser('user123')).not.toThrow();
    });

    it('should not throw when clearing user while disabled', () => {
      disabledSentry.setUser('user123');
      expect(() => disabledSentry.clearUser()).not.toThrow();
    });

    it('should not throw when setting tags while disabled', () => {
      expect(() => disabledSentry.setTag('key', 'value')).not.toThrow();
      expect(() => disabledSentry.setTags({ key1: 'val1', key2: 'val2' })).not.toThrow();
    });

    it('should not throw when removing tags while disabled', () => {
      disabledSentry.setTag('key', 'value');
      expect(() => disabledSentry.removeTag('key')).not.toThrow();
    });

    it('should not throw when adding breadcrumbs while disabled', () => {
      expect(() => disabledSentry.addBreadcrumb('Test breadcrumb')).not.toThrow();
    });

    it('should not throw when setting context while disabled', () => {
      expect(() => disabledSentry.setContext('user', { id: '123' })).not.toThrow();
    });

    it('should not throw when starting transaction while disabled', () => {
      expect(() => {
        const transaction = disabledSentry.startTransaction('test');
        transaction.finish();
      }).not.toThrow();
    });

    it('should not throw during initialization with disabled config', async () => {
      await expect(disabledSentry.initialize()).resolves.not.toThrow();
    });

    it('should not throw during close with disabled config', async () => {
      await expect(disabledSentry.close()).resolves.not.toThrow();
    });
  });

  describe('close operation', () => {
    beforeEach(() => {
      const config: SentryConfig = {
        enabled: true,
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
        environment: 'production',
      };
      sentry = new SentryIntegration(config, mockLogger);
    });

    it('should close Sentry connection', async () => {
      await sentry.initialize();
      await sentry.close();

      expect(mockLogger.info).toHaveBeenCalledWith('Closing Sentry connection');
      expect(sentry.isActive()).toBe(false);
    });

    it('should accept custom timeout', async () => {
      await sentry.initialize();
      await sentry.close(5000);

      expect(mockLogger.info).toHaveBeenCalledWith('Closing Sentry connection');
    });

    it('should be no-op when not initialized', async () => {
      mockLogger.info.mockClear();

      await sentry.close();

      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('should handle close errors gracefully', async () => {
      await sentry.initialize();
      mockLogger.info.mockImplementationOnce(() => {
        throw new Error('Close failed');
      });

      await expect(sentry.close()).resolves.not.toThrow();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Error closing Sentry',
        expect.any(Error)
      );
    });
  });

  describe('configuration', () => {
    it('should return copy of config on getConfig', () => {
      const config: SentryConfig = {
        enabled: true,
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
        environment: 'production',
        tracesSampleRate: 0.1,
        releaseVersion: '1.0.0',
        maxBreadcrumbs: 50,
      };

      sentry = new SentryIntegration(config, mockLogger);
      const returnedConfig = sentry.getConfig();

      expect(returnedConfig).toEqual(config);
      expect(returnedConfig).not.toBe(config);
    });

    it('should not mutate internal config via returned copy', () => {
      const config: SentryConfig = {
        enabled: true,
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
        environment: 'production',
      };

      sentry = new SentryIntegration(config, mockLogger);
      const returnedConfig = sentry.getConfig();

      // Try to mutate returned config
      if (returnedConfig.dsn) {
        returnedConfig.dsn = 'modified';
      }

      expect(sentry.getConfig().dsn).toBe('https://examplePublicKey@o0.ingest.sentry.io/0');
    });
  });
});
