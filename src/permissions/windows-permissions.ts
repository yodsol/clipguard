import { dialog, BrowserWindow } from 'electron';
import { exec } from 'child_process';
import { promisify } from 'util';
import { LoggerService } from '../services/logger-service';

const execAsync = promisify(exec);

export class WindowsPermissions {
  constructor(private logger: LoggerService) {}

  async checkAdminPrivileges(): Promise<boolean> {
    try {
      // Try to write to a protected location as a simple check
      const { stdout } = await execAsync('NET SESSION', {
        timeout: 5000,
        windowsHide: true,
      });

      const isAdmin = stdout.includes('Access is denied') === false;

      if (isAdmin) {
        this.logger.info('Running with admin privileges');
        return true;
      } else {
        this.logger.warn('Not running with admin privileges');
        return false;
      }
    } catch (error) {
      // No admin privileges
      this.logger.info('Not running with admin privileges');
      return false;
    }
  }

  async requestAdminPrivileges(): Promise<boolean> {
    const mainWindow = BrowserWindow.getAllWindows()[0];

    if (!mainWindow) return false;

    const result = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Admin Privileges Required',
      message: 'ClipGuard works best with administrator privileges.',
      detail: 'Some features (like auto-start and system integration) require running ClipGuard as administrator. Would you like to restart as administrator?',
      buttons: ['Yes, Restart as Admin', 'No, Continue'],
    });

    return result.response === 0;
  }

  async checkNotificationAccess(): Promise<boolean> {
    // Windows 10+ has built-in notification support, always available
    this.logger.info('Windows notification system available');
    return true;
  }

  getAutoStartPath(): string {
    // Windows auto-start uses registry or StartUp folder
    return 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  }
}
