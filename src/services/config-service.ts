import Store from 'electron-store';
import path from 'path';
import fs from 'fs';
import { PlatformDetector } from '../permissions/platform-detector';

export interface Config {
  clipboard_poll_interval: number;
  auto_clear_delay: number;
  max_history: number;
  detection_timeout: number;
  health_check_interval: number;
  enable_sentry: boolean;
  [key: string]: any;
}

export interface FeatureToggleState {
  feature: string;
  enabled: boolean;
  disabled: boolean;
  disabledAt?: number;
  reason?: string;
}

export type ConfigValue = string | number | boolean | Record<string, any>;

export class ConfigService {
  private defaults: Config;
  private platformConfig: Partial<Config> = {};
  private userStore: any;
  private disabledFeatures: Map<string, FeatureToggleState> = new Map();

  constructor() {
    this.defaults = this.loadDefaults();
    this.platformConfig = this.loadPlatformConfig();
    this.userStore = new Store({ name: 'clipguard-config' });
    this.loadDisabledFeatures();
  }

  private loadDefaults(): Config {
    try {
      const configPath = path.join(__dirname, '../config/defaults.json');
      const data = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.warn('Failed to load default config:', error);
      return {
        clipboard_poll_interval: 1000,
        auto_clear_delay: 1500,
        max_history: 100,
        detection_timeout: 5000,
        health_check_interval: 5000,
        enable_sentry: false,
      };
    }
  }

  private loadPlatformConfig(): Partial<Config> {
    const platform = PlatformDetector.getPlatform();
    const configFile = platform === 'darwin' ? 'macos.json' : platform === 'win32' ? 'windows.json' : 'linux.json';

    try {
      const configPath = path.join(__dirname, `../config/${configFile}`);
      if (fs.existsSync(configPath)) {
        const data = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.warn(`Failed to load platform config (${configFile}):`, error);
    }

    return {};
  }

  private loadDisabledFeatures(): void {
    const stored = this.userStore.get('disabled_features', {});
    for (const [feature, state] of Object.entries(stored)) {
      this.disabledFeatures.set(feature, state as FeatureToggleState);
    }
  }

  getConfig(key: string): ConfigValue | undefined {
    const parts = key.split('.');

    // Try to find value in priority order: user > platform > defaults
    let value: any;

    // For single-part keys, check top-level
    if (parts.length === 1) {
      value = this.platformConfig[key] ?? this.defaults[key];
      return value;
    }

    // For nested keys, traverse the dot path
    const searchOrder = [this.platformConfig, this.defaults];
    for (const source of searchOrder) {
      let current: any = source;
      for (const part of parts) {
        if (typeof current === 'object' && current !== null && part in current) {
          current = current[part];
        } else {
          current = undefined;
          break;
        }
      }
      if (current !== undefined) {
        return current;
      }
    }

    return undefined;
  }

  setConfig(key: string, value: ConfigValue): void {
    const userConfig = this.userStore.get('user_config', {});
    userConfig[key] = value;
    this.userStore.set('user_config', userConfig);
  }

  getAllConfig(): Config {
    const userOverrides = (this.userStore.get('user_config', {}) as Record<string, ConfigValue>) || {};
    return {
      ...this.defaults,
      ...this.platformConfig,
      ...userOverrides,
    } as Config;
  }

  getFeatureEnabled(feature: string): boolean {
    const state = this.disabledFeatures.get(feature);
    return !state || !state.disabled;
  }

  disableFeature(feature: string, reason?: string): void {
    const state: FeatureToggleState = {
      feature,
      enabled: false,
      disabled: true,
      disabledAt: Date.now(),
      reason,
    };
    this.disabledFeatures.set(feature, state);
    this.persistDisabledFeatures();
  }

  enableFeature(feature: string): void {
    const state = this.disabledFeatures.get(feature);
    if (state) {
      state.disabled = false;
      state.enabled = true;
      this.disabledFeatures.set(feature, state);
      this.persistDisabledFeatures();
    }
  }

  getDisabledFeatures(): FeatureToggleState[] {
    return Array.from(this.disabledFeatures.values()).filter(s => s.disabled);
  }

  getDisabledFeatureInfo(feature: string): FeatureToggleState | undefined {
    return this.disabledFeatures.get(feature);
  }

  private persistDisabledFeatures(): void {
    const disabled: Record<string, FeatureToggleState> = {};
    for (const [key, value] of this.disabledFeatures) {
      if (value.disabled) {
        disabled[key] = value;
      }
    }
    this.userStore.set('disabled_features', disabled);
  }

  resetToDefaults(): void {
    this.userStore.clear();
    this.disabledFeatures.clear();
  }

  reload(): void {
    this.defaults = this.loadDefaults();
    this.platformConfig = this.loadPlatformConfig();
    this.loadDisabledFeatures();
  }
}
