export interface DetectionResult {
  found: boolean;
  types: DetectionFinding[];
  count: number;
  severity: 'safe' | 'medium' | 'high' | 'critical';
}

export interface DetectionFinding {
  type: string;
  category: string;
  count: number;
}

export interface DetectionHistoryEntry {
  timestamp: string;
  severity: string;
  types: string[];
  count: number;
}

export interface AppSettings {
  monitoring_enabled: boolean;
  auto_clear_clipboard: boolean;
  show_warnings: boolean;
  detection_history: DetectionHistoryEntry[];
}

export interface PermissionState {
  accessibility_granted: boolean;
  screen_recording_granted: boolean;
  admin_privileges_checked: boolean;
}

export interface ClipboardEvent {
  severity: string;
  types: DetectionFinding[];
  count: number;
}

export interface PlatformInfo {
  platform: 'darwin' | 'win32' | 'linux';
  arch: string;
  version: string;
}

export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, any>;
}
