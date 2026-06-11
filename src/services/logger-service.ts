import fs from 'fs';
import path from 'path';
import os from 'os';
import { LogEntry } from '../types';

export class LoggerService {
  private logDir: string;
  private logFile: string;
  private isDev: boolean;

  constructor() {
    this.isDev = process.env.NODE_ENV === 'development';
    this.logDir = this.initializeLogDirectory();
    this.logFile = path.join(this.logDir, 'app.log');
  }

  private initializeLogDirectory(): string {
    const platform = process.platform;
    let logDir: string;

    if (platform === 'darwin') {
      logDir = path.join(os.homedir(), 'Library', 'Logs', 'ClipGuard');
    } else if (platform === 'win32') {
      logDir = path.join(process.env.APPDATA || '', 'ClipGuard', 'logs');
    } else {
      logDir = path.join(os.homedir(), '.local', 'share', 'ClipGuard', 'logs');
    }

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    return logDir;
  }

  private formatLog(level: string, message: string, context?: Record<string, any>): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
  }

  private writeLog(entry: LogEntry): void {
    try {
      const line = this.formatLog(entry.level, entry.message, entry.context);

      if (this.isDev) {
        console.log(line);
      }

      fs.appendFileSync(this.logFile, line + '\n', 'utf-8');

      // Rotate logs if > 10MB
      this.rotateIfNeeded();
    } catch (err) {
      console.error('Failed to write log:', err);
    }
  }

  private rotateIfNeeded(): void {
    try {
      const stats = fs.statSync(this.logFile);
      const maxSize = 10 * 1024 * 1024; // 10MB

      if (stats.size > maxSize) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(this.logDir, `app-${timestamp}.log`);
        fs.renameSync(this.logFile, backupFile);

        // Keep only last 5 rotated logs
        const files = fs.readdirSync(this.logDir)
          .filter(f => f.startsWith('app-') && f.endsWith('.log'))
          .sort()
          .reverse();

        for (let i = 5; i < files.length; i++) {
          fs.unlinkSync(path.join(this.logDir, files[i]));
        }
      }
    } catch (err) {
      console.error('Log rotation failed:', err);
    }
  }

  debug(message: string, context?: Record<string, any>): void {
    this.writeLog({ timestamp: new Date().toISOString(), level: 'debug', message, context });
  }

  info(message: string, context?: Record<string, any>): void {
    this.writeLog({ timestamp: new Date().toISOString(), level: 'info', message, context });
  }

  warn(message: string, context?: Record<string, any>): void {
    this.writeLog({ timestamp: new Date().toISOString(), level: 'warn', message, context });
  }

  error(message: string, error?: Error, context?: Record<string, any>): void {
    const fullContext = {
      ...context,
      stack: error?.stack,
    };
    this.writeLog({ timestamp: new Date().toISOString(), level: 'error', message, context: fullContext });
  }

  getLogFile(): string {
    return this.logFile;
  }

  clearLogs(): void {
    try {
      fs.writeFileSync(this.logFile, '', 'utf-8');
      this.info('Logs cleared');
    } catch (err) {
      this.error('Failed to clear logs', err instanceof Error ? err : new Error(String(err)));
    }
  }
}

export const logger = new LoggerService();
