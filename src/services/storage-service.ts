import Store from 'electron-store';
import { AppSettings, DetectionHistoryEntry } from '../types';
import { logger } from './logger-service';

export class StorageService {
  private store: any;

  constructor() {
    this.store = new Store({
      name: 'clipguard-monitor',
      defaults: {
        monitoring_enabled: true,
        auto_clear_clipboard: false,
        show_warnings: true,
        detection_history: [],
      },
    });
  }

  getSettings(): AppSettings {
    return {
      monitoring_enabled: this.get('monitoring_enabled', true),
      auto_clear_clipboard: this.get('auto_clear_clipboard', false),
      show_warnings: this.get('show_warnings', true),
      detection_history: this.get('detection_history', []),
    };
  }

  updateSettings(settings: Partial<AppSettings>): void {
    if (settings.monitoring_enabled !== undefined) {
      this.set('monitoring_enabled', settings.monitoring_enabled);
    }
    if (settings.auto_clear_clipboard !== undefined) {
      this.set('auto_clear_clipboard', settings.auto_clear_clipboard);
    }
    if (settings.show_warnings !== undefined) {
      this.set('show_warnings', settings.show_warnings);
    }
    logger.info('Settings updated', { settings });
  }

  getDetectionHistory(): DetectionHistoryEntry[] {
    return this.get('detection_history', []);
  }

  addDetectionHistory(entry: DetectionHistoryEntry): void {
    const history = this.getDetectionHistory();
    history.push(entry);

    // Keep only last 100
    if (history.length > 100) {
      history.shift();
    }

    this.set('detection_history', history);
  }

  clearDetectionHistory(): void {
    this.set('detection_history', []);
    logger.info('Detection history cleared');
  }

  private get<T>(key: string, defaultValue: T): T {
    try {
      const value = this.store.get(key);
      return (value !== undefined ? value : defaultValue) as T;
    } catch (err) {
      logger.error('Failed to get setting', err instanceof Error ? err : new Error(String(err)), { key });
      return defaultValue;
    }
  }

  private set(key: string, value: any): void {
    try {
      this.store.set(key, value);
    } catch (err) {
      logger.error('Failed to set setting', err instanceof Error ? err : new Error(String(err)), { key, value });
    }
  }
}

export const storage = new StorageService();
