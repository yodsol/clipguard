import Store from 'electron-store';
import { PlatformDetector } from './platform-detector';
import { MacOSPermissions } from './macos-permissions';
import { WindowsPermissions } from './windows-permissions';
import { PermissionState } from '../types';
import { LoggerService } from '../services/logger-service';

export class PermissionsManager {
  private store: any;
  private macPermissions: MacOSPermissions | null = null;
  private winPermissions: WindowsPermissions | null = null;
  private logger: LoggerService;

  constructor(logger: LoggerService) {
    this.logger = logger;
    this.store = new Store({
      name: 'clipguard-permissions',
      defaults: {
        accessibility_granted: false,
        screen_recording_granted: false,
        admin_privileges_checked: false,
      },
    });

    if (PlatformDetector.isMac()) {
      this.macPermissions = new MacOSPermissions(logger);
    } else if (PlatformDetector.isWindows()) {
      this.winPermissions = new WindowsPermissions(logger);
    }
  }

  async initialize(): Promise<void> {
    this.logger.info(`Initializing permissions for ${PlatformDetector.getPlatform()}`);

    if (PlatformDetector.isMac()) {
      await this.initializeMacOS();
    } else if (PlatformDetector.isWindows()) {
      await this.initializeWindows();
    }
  }

  private async initializeMacOS(): Promise<void> {
    if (!this.macPermissions) return;

    // macOS clipboard doesn't require Accessibility permission (it's automatic)
    this.logger.info('macOS: Clipboard monitoring enabled (no special permissions needed)');

    // Check Screen Recording if needed
    const hasScreenRecording = await this.macPermissions.requestScreenRecording();
    this.store.set('screen_recording_granted', hasScreenRecording);
  }

  private async initializeWindows(): Promise<void> {
    if (!this.winPermissions) return;

    const hasAdmin = await this.winPermissions.checkAdminPrivileges();
    this.store.set('admin_privileges_checked', true);

    if (!hasAdmin) {
      const shouldRestart = await this.winPermissions.requestAdminPrivileges();
      if (shouldRestart) {
        // Handle admin restart (would require shell execution)
        this.logger.warn('User requested admin restart, implementation pending');
      }
    }

    const hasNotifications = await this.winPermissions.checkNotificationAccess();
    this.logger.info(`Windows notifications available: ${hasNotifications}`);
  }

  getPermissionState(): PermissionState {
    return {
      accessibility_granted: this.store.get('accessibility_granted', false),
      screen_recording_granted: this.store.get('screen_recording_granted', false),
      admin_privileges_checked: this.store.get('admin_privileges_checked', false),
    };
  }

  isClipboardMonitoringPermitted(): boolean {
    // macOS: always permitted (no special permission needed)
    // Windows: always permitted
    // Linux: always permitted
    return true;
  }
}
