# Services Documentation

This directory contains core service classes that handle logging, detection, clipboard monitoring, and persistent storage for the AIClipboard application.

## Service Architecture

Services are modular, singleton-based components that encapsulate specific functionality:

- **LoggerService**: Centralized logging with file persistence and rotation
- **DetectorService**: Pattern matching for sensitive data detection
- **ClipboardService**: Monitors clipboard changes and coordinates detection/storage
- **StorageService**: Persistent user settings and detection history

---

## LoggerService

Handles all application logging with support for multiple log levels, file persistence, and automatic log rotation.

### Exports

```typescript
export class LoggerService { ... }
export const logger: LoggerService // singleton instance
```

### Methods

#### `info(message: string, context?: Record<string, any>): void`
Logs informational messages. Use for normal application flow events.

**Parameters:**
- `message` — The log message
- `context` (optional) — Contextual metadata object

**Example:**
```typescript
logger.info('User toggled monitoring', { monitoring_enabled: true });
```

#### `warn(message: string, context?: Record<string, any>): void`
Logs warning messages for potentially problematic conditions. Used when sensitive data is detected.

**Parameters:**
- `message` — The warning message
- `context` (optional) — Contextual metadata object

**Example:**
```typescript
logger.warn('Sensitive data detected', { types: ['API Key', 'Bearer Token'] });
```

#### `error(message: string, error?: Error, context?: Record<string, any>): void`
Logs error messages with optional Error stack traces. Used for unexpected failures.

**Parameters:**
- `message` — The error message
- `error` (optional) — Error object (stack trace is automatically extracted)
- `context` (optional) — Additional contextual metadata object

**Example:**
```typescript
try {
  readClipboard();
} catch (err) {
  logger.error('Failed to read clipboard', err instanceof Error ? err : new Error(String(err)));
}
```

#### `debug(message: string, context?: Record<string, any>): void`
Logs debug messages for development/diagnostic purposes. Only emitted to console in development mode.

**Parameters:**
- `message` — The debug message
- `context` (optional) — Contextual metadata object

**Example:**
```typescript
logger.debug('Analyzing clipboard content', { contentLength: text.length });
```

### Additional Methods

#### `getLogFile(): string`
Returns the absolute path to the current application log file.

#### `clearLogs(): void`
Clears all log entries from the current log file.

### Implementation Details

- **Log Format**: `[ISO8601-timestamp] [LEVEL] message contextJSON`
- **Log Rotation**: Automatic rotation when log file exceeds 10MB; keeps last 5 rotated logs
- **Log Directory** (platform-specific):
  - macOS: `~/Library/Logs/ClipGuard/`
  - Windows: `%APPDATA%\ClipGuard\logs\`
  - Linux: `~/.local/share/ClipGuard/logs/`
- **Console Output**: In development mode, all logs are also printed to console

---

## DetectorService

Pattern-based detection for sensitive data including API keys, credentials, and PII. Returns structured detection results with severity classification.

### Exports

```typescript
export class DetectorService { ... }
export const detector: DetectorService // singleton instance
```

### Methods

#### `detect(text: string): DetectionResult`
Scans text for sensitive data patterns across multiple categories. Returns detailed detection information.

**Parameters:**
- `text` — The text to analyze

**Returns:** `DetectionResult` object with:
```typescript
{
  found: boolean,           // True if any sensitive data detected
  types: DetectionFinding[],  // Array of detected data types with counts
  count: number,            // Total number of matches
  severity: 'safe' | 'medium' | 'high' | 'critical'
}
```

**DetectionFinding** structure:
```typescript
{
  type: string,     // Human-readable type name (e.g., "API Key")
  category: string, // Internal category (e.g., "api_keys")
  count: number     // Number of matches found
}
```

**Severity Levels:**
- `safe` — No sensitive data detected
- `medium` — Medium-risk data (email addresses, etc.)
- `high` — High-risk data (database credentials, SSN, credit cards)
- `critical` — Highest-risk data (API keys, AWS credentials, private keys, bearer tokens)

**Example:**
```typescript
const result = detector.detect('github_pat_abc123def456xyz789');
// {
//   found: true,
//   types: [{ type: 'API Key', category: 'api_keys', count: 1 }],
//   count: 1,
//   severity: 'critical'
// }
```

### Supported Detection Categories

1. **API Keys** — Stripe, GitHub, Shopify, and generic API tokens
2. **AWS Credentials** — AWS access keys and secret keys
3. **Private Keys** — RSA, OpenSSH, PGP, EC private keys
4. **Database Credentials** — MongoDB, PostgreSQL, MySQL connection strings
5. **Email Addresses** — Standard email format
6. **Credit Card Numbers** — Various credit card formats
7. **Social Security Numbers** — US SSN format
8. **Bearer Tokens** — OAuth/Bearer authentication tokens
9. **Generic Secrets** — Key-value patterns (secret=, password=, token=, api_key=)

### Implementation Details

- Patterns are stored as compiled RegExp objects for efficiency
- Matches are case-insensitive where appropriate (e.g., database URLs, key patterns)
- Severity is calculated based on finding types, with critical types overriding others
- Invalid or non-string input returns safe result

---

## ClipboardService

Monitors clipboard changes and coordinates detection, user notifications, and history storage.

### Exports

```typescript
export class ClipboardService { ... }
```

### Constructor

```typescript
constructor(
  detector: DetectorService,
  storage: StorageService,
  logger: LoggerService
)
```

Accepts dependencies via constructor injection.

### Methods

#### `start(window: BrowserWindow): void`
Starts clipboard monitoring with a 1-second poll interval. Updates persist across app lifecycle.

**Parameters:**
- `window` — The Electron BrowserWindow for displaying warnings

**Side Effects:**
- Begins polling clipboard every 1 second
- Logs "Clipboard monitoring started"
- Returns early if already monitoring (idempotent)

**Example:**
```typescript
clipboardService.start(mainWindow);
```

#### `stop(): void`
Stops clipboard monitoring and clears the polling interval.

**Side Effects:**
- Clears the polling interval
- Logs "Clipboard monitoring stopped"
- Safe to call if not currently monitoring (idempotent)

**Example:**
```typescript
clipboardService.stop();
```

#### `isMonitoring(): boolean`
Returns whether clipboard monitoring is currently active.

**Returns:**
- `true` if monitoring is running, `false` otherwise

**Example:**
```typescript
if (clipboardService.isMonitoring()) {
  console.log('Monitoring is active');
}
```

### IPC Handlers

The service registers Electron IPC handlers via `setupIpcHandlers()`:

| Handler | Purpose |
|---------|---------|
| `clipboard:get-detection-history` | Retrieve all stored detection history entries |
| `clipboard:clear-history` | Clear detection history and reset to empty array |
| `clipboard:get-settings` | Fetch current application settings |
| `clipboard:update-settings` | Update settings (auto-starts/stops monitoring as needed) |

### Implementation Details

- **Poll Interval**: 1000ms (clipboard checked every second)
- **Change Detection**: Only analyzes text if clipboard content changed and is non-empty
- **Auto-Clear Delay**: Sensitive data cleared 1500ms after detection if enabled
- **Dialog Display**: Shows warnings if settings enable `show_warnings`
- **History Logging**: Every detection is added to history regardless of user action
- **Setting Synchronization**: Stopping/starting monitoring via settings is automatic

---

## StorageService

Persists application settings and detection history using Electron Store. Defaults are applied on first run.

### Exports

```typescript
export class StorageService { ... }
export const storage: StorageService // singleton instance
```

### Methods

#### `getSettings(): AppSettings`
Retrieves the current application settings.

**Returns:**
```typescript
{
  monitoring_enabled: boolean,    // Whether clipboard monitoring is active
  auto_clear_clipboard: boolean,  // Whether to auto-clear sensitive clipboard content
  show_warnings: boolean,         // Whether to show warning dialogs
  detection_history: DetectionHistoryEntry[]  // Full detection history
}
```

**Example:**
```typescript
const settings = storage.getSettings();
console.log(`Monitoring enabled: ${settings.monitoring_enabled}`);
```

#### `updateSettings(settings: Partial<AppSettings>): void`
Updates one or more settings. Only provided keys are updated (partial updates allowed).

**Parameters:**
- `settings` — Object containing one or more settings to update

**Side Effects:**
- Updates persistent store
- Logs the update action
- Does NOT handle monitoring start/stop (ClipboardService handles that)

**Example:**
```typescript
storage.updateSettings({
  monitoring_enabled: false,
  auto_clear_clipboard: true
});
```

#### `getDetectionHistory(): DetectionHistoryEntry[]`
Retrieves all stored detection history entries (max 100 most recent).

**Returns:** Array of `DetectionHistoryEntry` objects

**DetectionHistoryEntry** structure:
```typescript
{
  timestamp: string,        // ISO8601 timestamp of detection
  severity: string,         // Severity level ('safe' | 'medium' | 'high' | 'critical')
  types: string[],          // Array of detected type names
  count: number            // Total number of matches
}
```

**Example:**
```typescript
const history = storage.getDetectionHistory();
history.forEach(entry => {
  console.log(`${entry.timestamp}: ${entry.severity} - ${entry.types.join(', ')}`);
});
```

#### `addDetectionHistory(entry: DetectionHistoryEntry): void`
Adds a detection entry to history. Automatically maintains max 100 entries (oldest entries removed first).

**Parameters:**
- `entry` — Detection history entry to add

**Side Effects:**
- Appends entry to history
- Removes oldest entry if history exceeds 100 items
- Persists to store

**Example:**
```typescript
storage.addDetectionHistory({
  timestamp: new Date().toISOString(),
  severity: 'critical',
  types: ['API Key'],
  count: 1
});
```

#### `clearDetectionHistory(): void`
Clears all detection history entries.

**Side Effects:**
- Sets detection_history to empty array
- Logs the clear action
- Persists to store

**Example:**
```typescript
storage.clearDetectionHistory();
```

### Default Settings

On first application run, these defaults are applied:

```typescript
{
  monitoring_enabled: true,
  auto_clear_clipboard: false,
  show_warnings: true,
  detection_history: []
}
```

### Implementation Details

- **Storage Backend**: Electron Store (platform-specific encrypted JSON)
- **Error Handling**: All get/set operations catch and log errors; getters return defaults on failure
- **Max History**: Detection history limited to 100 most recent entries
- **Persistence**: All changes written to persistent store immediately (synchronous)

---

## Service Integration

Services are typically initialized in the main Electron process:

```typescript
import { LoggerService } from './services/logger-service';
import { DetectorService } from './services/detector-service';
import { StorageService } from './services/storage-service';
import { ClipboardService } from './services/clipboard-service';

const logger = new LoggerService();
const detector = new DetectorService();
const storage = new StorageService();
const clipboard = new ClipboardService(detector, storage, logger);

// Start monitoring when app is ready
app.on('ready', () => {
  clipboard.start(mainWindow);
  clipboard.setupIpcHandlers();
});
```

## Error Handling

All services include defensive error handling:

- **LoggerService**: Errors writing logs are printed to console; app continues
- **DetectorService**: Invalid input returns safe result; no exceptions thrown
- **ClipboardService**: Clipboard read errors are logged; monitoring continues
- **StorageService**: Get operations return defaults on error; set operations log failures

This design ensures service failures do not crash the application.
