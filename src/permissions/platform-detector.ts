import os from 'os';
import { PlatformInfo } from '../types';

export class PlatformDetector {
  static getPlatform(): 'darwin' | 'win32' | 'linux' {
    return process.platform as 'darwin' | 'win32' | 'linux';
  }

  static isMac(): boolean {
    return process.platform === 'darwin';
  }

  static isWindows(): boolean {
    return process.platform === 'win32';
  }

  static isLinux(): boolean {
    return process.platform === 'linux';
  }

  static getArch(): string {
    return process.arch;
  }

  static getPlatformInfo(): PlatformInfo {
    return {
      platform: this.getPlatform(),
      arch: this.getArch(),
      version: os.release(),
    };
  }

  static getOSVersion(): string {
    if (this.isMac()) {
      const versionString = os.release();
      const majorVersion = parseInt(versionString.split('.')[0]);
      // macOS versions: 19 = Catalina, 20 = Big Sur, etc.
      return `macOS ${20 + majorVersion - 20}`;
    } else if (this.isWindows()) {
      return `Windows ${os.release()}`;
    } else {
      return `Linux ${os.release()}`;
    }
  }
}
