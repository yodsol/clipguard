import { LoggerService } from './logger-service';

export interface SentryConfig {
  enabled: boolean;
  dsn?: string;
  environment: 'development' | 'production';
  tracesSampleRate?: number;
  releaseVersion?: string;
  maxBreadcrumbs?: number;
}

export interface SentryUser {
  id: string;
  username?: string;
  email?: string;
  ipAddress?: string;
}

export interface SentryBreadcrumb {
  message: string;
  level: 'debug' | 'info' | 'warning' | 'error' | 'fatal';
  timestamp: number;
  category?: string;
  data?: Record<string, any>;
}

export class SentryIntegration {
  private config: SentryConfig;
  private logger: LoggerService;
  private initialized = false;
  private tags: Map<string, string> = new Map();
  private user: SentryUser | null = null;
  private breadcrumbs: SentryBreadcrumb[] = [];
  private contexts: Map<string, Record<string, any>> = new Map();

  constructor(config: SentryConfig, logger: LoggerService) {
    this.config = config;
    this.logger = logger;
  }

  async initialize(): Promise<void> {
    if (!this.config.enabled || !this.config.dsn) {
      this.logger.debug('Sentry disabled or no DSN provided');
      return;
    }

    try {
      this.logger.info('Initializing Sentry integration', {
        environment: this.config.environment,
        dsn: this.config.dsn?.substring(0, 20) + '...',
      });

      this.initialized = true;
      this.logger.info('Sentry initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Sentry', error instanceof Error ? error : new Error(String(error)));
    }
  }

  async close(_timeoutMs: number = 2000): Promise<void> {
    if (!this.initialized) return;

    try {
      this.logger.info('Closing Sentry connection');
      this.initialized = false;
    } catch (error) {
      this.logger.warn('Error closing Sentry', error instanceof Error ? error : new Error(String(error)));
    }
  }

  captureException(error: Error, context: Record<string, any> = {}): void {
    if (!this.config.enabled) return;

    this.logger.error('Capturing exception', error, {
      ...context,
      tags: Object.fromEntries(this.tags),
      user: this.user,
    });
  }

  captureMessage(message: string, level: 'debug' | 'info' | 'warning' | 'error' | 'fatal' = 'info'): void {
    if (!this.config.enabled) return;

    this.logger.info(`Sentry: ${level.toUpperCase()} - ${message}`);
  }

  setUser(id: string, userInfo?: Partial<SentryUser>): void {
    this.user = {
      id,
      ...userInfo,
    };

    this.logger.debug('Sentry user set', { userId: id });
  }

  clearUser(): void {
    this.user = null;
    this.logger.debug('Sentry user cleared');
  }

  setTag(key: string, value: string): void {
    this.tags.set(key, value);
  }

  setTags(tags: Record<string, string>): void {
    for (const [key, value] of Object.entries(tags)) {
      this.tags.set(key, value);
    }
    this.logger.debug('Sentry tags updated', { tagCount: this.tags.size });
  }

  removeTag(key: string): void {
    this.tags.delete(key);
  }

  addBreadcrumb(message: string, level: 'debug' | 'info' | 'warning' | 'error' | 'fatal' = 'info', data?: Record<string, any>): void {
    const breadcrumb: SentryBreadcrumb = {
      message,
      level,
      timestamp: Date.now(),
      data,
    };

    this.breadcrumbs.push(breadcrumb);

    if (this.breadcrumbs.length > (this.config.maxBreadcrumbs || 100)) {
      this.breadcrumbs.shift();
    }
  }

  clearBreadcrumbs(): void {
    this.breadcrumbs = [];
  }

  setContext(name: string, context: Record<string, any>): void {
    this.contexts.set(name, context);
    this.logger.debug(`Sentry context set: ${name}`);
  }

  getConfig(): SentryConfig {
    return { ...this.config };
  }

  getTags(): Record<string, string> {
    return Object.fromEntries(this.tags);
  }

  getUser(): SentryUser | null {
    return this.user;
  }

  getBreadcrumbs(): SentryBreadcrumb[] {
    return this.breadcrumbs.map(b => ({ ...b }));
  }

  isActive(): boolean {
    return this.initialized && this.config.enabled;
  }

  startTransaction(name: string, _op: string = 'http.server'): { finish: () => void } {
    if (!this.config.enabled) {
      return { finish: () => {} };
    }

    this.logger.debug(`Sentry transaction started: ${name}`);

    return {
      finish: () => {
        this.logger.debug(`Sentry transaction finished: ${name}`);
      },
    };
  }
}
