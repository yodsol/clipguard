import { LoggerService } from '../services/logger-service';

export class MacOSPermissions {
  constructor(private logger: LoggerService) {}

  async requestAccessibility(): Promise<boolean> {
    try {
      // Note: Clipboard access in Electron doesn't require Accessibility permission
      // This method is kept for compatibility but returns true since clipboard API works without it
      this.logger.info('Clipboard monitoring enabled (no Accessibility permission required on modern macOS)');
      return true;
    } catch (error) {
      this.logger.error('Error in accessibility check', error instanceof Error ? error : new Error(String(error)));
      return true;
    }
  }

  async requestScreenRecording(): Promise<boolean> {
    try {
      // Clipboard monitoring doesn't require Screen Recording permission
      // Screen Recording is only needed if capturing screen content, which ClipGuard doesn't do
      this.logger.info('Screen Recording not required for clipboard monitoring');
      return true;
    } catch (error) {
      this.logger.error('Error in screen recording check', error instanceof Error ? error : new Error(String(error)));
      return true;
    }
  }
}
