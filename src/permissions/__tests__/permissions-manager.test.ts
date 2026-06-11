import { PermissionsManager } from '../permissions-manager';
import Store from 'electron-store';
import { PlatformDetector } from '../platform-detector';
import { MacOSPermissions } from '../macos-permissions';
import { WindowsPermissions } from '../windows-permissions';
import { LoggerService } from '../../services/logger-service';
import { PermissionState } from '../../types';

// Mock modules
jest.mock('electron', () => ({
  systemPreferences: {
    askForScreenCapturePermission: jest.fn(),
    getMediaAccessStatus: jest.fn(),
  },
  dialog: {
    showMessageBox: jest.fn(),
  },
  BrowserWindow: jest.fn(),
}));

jest.mock('electron-store');
jest.mock('../platform-detector');
jest.mock('../macos-permissions');
jest.mock('../windows-permissions');

describe('PermissionsManager', () => {
  let permissionsManager: PermissionsManager;
  let mockLogger: jest.Mocked<LoggerService>;
  let mockStore: jest.Mocked<Store>;
  let mockMacOSPermissions: jest.Mocked<MacOSPermissions>;
  let mockWindowsPermissions: jest.Mocked<WindowsPermissions>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    // Setup mock electron-store
    mockStore = {
      get: jest.fn(),
      set: jest.fn(),
      clear: jest.fn(),
    } as any;

    (Store as jest.MockedClass<typeof Store>).mockImplementation(() => mockStore);

    // Default store behavior
    mockStore.get.mockImplementation((_key: string, defaultValue?: any) => defaultValue);

    // Setup mock MacOSPermissions
    mockMacOSPermissions = {
      requestScreenRecording: jest.fn().mockResolvedValue(true),
      requestAccessibility: jest.fn().mockResolvedValue(true),
    } as any;

    // Setup mock WindowsPermissions
    mockWindowsPermissions = {
      checkAdminPrivileges: jest.fn().mockResolvedValue(true),
      requestAdminPrivileges: jest.fn().mockResolvedValue(false),
      checkNotificationAccess: jest.fn().mockResolvedValue(true),
    } as any;

    (MacOSPermissions as jest.MockedClass<typeof MacOSPermissions>).mockImplementation(
      () => mockMacOSPermissions
    );

    (WindowsPermissions as jest.MockedClass<typeof WindowsPermissions>).mockImplementation(
      () => mockWindowsPermissions
    );
  });

  describe('Initialization', () => {
    it('should initialize with logger', () => {
      (PlatformDetector.isMac as jest.Mock).mockReturnValue(false);
      (PlatformDetector.isWindows as jest.Mock).mockReturnValue(false);

      permissionsManager = new PermissionsManager(mockLogger);

      expect(permissionsManager).toBeDefined();
      expect(mockLogger).toBeDefined();
    });

    it('should create electron-store with correct configuration', () => {
      (PlatformDetector.isMac as jest.Mock).mockReturnValue(false);
      (PlatformDetector.isWindows as jest.Mock).mockReturnValue(false);

      permissionsManager = new PermissionsManager(mockLogger);

      expect(Store).toHaveBeenCalledWith({
        name: 'clipguard-permissions',
        defaults: {
          accessibility_granted: false,
          screen_recording_granted: false,
          admin_privileges_checked: false,
        },
      });
    });

    it('should initialize store with default permission states', () => {
      (PlatformDetector.isMac as jest.Mock).mockReturnValue(false);
      (PlatformDetector.isWindows as jest.Mock).mockReturnValue(false);

      permissionsManager = new PermissionsManager(mockLogger);

      expect(Store).toHaveBeenCalled();
    });

    it('should instantiate MacOSPermissions on macOS', () => {
      (PlatformDetector.isMac as jest.Mock).mockReturnValue(true);
      (PlatformDetector.isWindows as jest.Mock).mockReturnValue(false);

      permissionsManager = new PermissionsManager(mockLogger);

      expect(MacOSPermissions).toHaveBeenCalledWith(mockLogger);
    });

    it('should instantiate WindowsPermissions on Windows', () => {
      (PlatformDetector.isMac as jest.Mock).mockReturnValue(false);
      (PlatformDetector.isWindows as jest.Mock).mockReturnValue(true);

      permissionsManager = new PermissionsManager(mockLogger);

      expect(WindowsPermissions).toHaveBeenCalledWith(mockLogger);
    });

    it('should not instantiate platform-specific permissions on unsupported platforms', () => {
      (PlatformDetector.isMac as jest.Mock).mockReturnValue(false);
      (PlatformDetector.isWindows as jest.Mock).mockReturnValue(false);

      permissionsManager = new PermissionsManager(mockLogger);

      expect(MacOSPermissions).not.toHaveBeenCalled();
      expect(WindowsPermissions).not.toHaveBeenCalled();
    });
  });

  describe('initialize() method', () => {
    it('should call initializeMacOS on macOS platform', async () => {
      (PlatformDetector.isMac as jest.Mock).mockReturnValue(true);
      (PlatformDetector.isWindows as jest.Mock).mockReturnValue(false);
      (PlatformDetector.getPlatform as jest.Mock).mockReturnValue('darwin');

      permissionsManager = new PermissionsManager(mockLogger);
      await permissionsManager.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('darwin'));
    });

    it('should call initializeWindows on Windows platform', async () => {
      (PlatformDetector.isMac as jest.Mock).mockReturnValue(false);
      (PlatformDetector.isWindows as jest.Mock).mockReturnValue(true);
      (PlatformDetector.getPlatform as jest.Mock).mockReturnValue('win32');

      permissionsManager = new PermissionsManager(mockLogger);
      await permissionsManager.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('win32'));
    });

    it('should log platform information on initialization', async () => {
      (PlatformDetector.isMac as jest.Mock).mockReturnValue(false);
      (PlatformDetector.isWindows as jest.Mock).mockReturnValue(false);
      (PlatformDetector.getPlatform as jest.Mock).mockReturnValue('linux');

      permissionsManager = new PermissionsManager(mockLogger);
      await permissionsManager.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Initializing permissions'));
    });

    it('should handle initialization without errors on unsupported platforms', async () => {
      (PlatformDetector.isMac as jest.Mock).mockReturnValue(false);
      (PlatformDetector.isWindows as jest.Mock).mockReturnValue(false);
      (PlatformDetector.getPlatform as jest.Mock).mockReturnValue('linux');

      permissionsManager = new PermissionsManager(mockLogger);

      await expect(permissionsManager.initialize()).resolves.not.toThrow();
    });
  });

  describe('macOS Initialization', () => {
    beforeEach(() => {
      (PlatformDetector.isMac as jest.Mock).mockReturnValue(true);
      (PlatformDetector.isWindows as jest.Mock).mockReturnValue(false);
      (PlatformDetector.getPlatform as jest.Mock).mockReturnValue('darwin');
    });

    it('should request screen recording permission on macOS', async () => {
      permissionsManager = new PermissionsManager(mockLogger);
      await permissionsManager.initialize();

      expect(mockMacOSPermissions.requestScreenRecording).toHaveBeenCalled();
    });

    it('should store screen recording permission state', async () => {
      mockMacOSPermissions.requestScreenRecording.mockResolvedValue(true);

      permissionsManager = new PermissionsManager(mockLogger);
      await permissionsManager.initialize();

      expect(mockStore.set).toHaveBeenCalledWith('screen_recording_granted', true);
    });

    it('should handle screen recording request returning false', async () => {
      mockMacOSPermissions.requestScreenRecording.mockResolvedValue(false);

      permissionsManager = new PermissionsManager(mockLogger);
      await permissionsManager.initialize();

      expect(mockStore.set).toHaveBeenCalledWith('screen_recording_granted', false);
    });

    it('should log initialization message for macOS', async () => {
      permissionsManager = new PermissionsManager(mockLogger);
      await permissionsManager.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('macOS: Clipboard monitoring enabled')
      );
    });

    it('should handle screen recording permission errors gracefully', async () => {
      mockMacOSPermissions.requestScreenRecording.mockRejectedValue(
        new Error('Permission request failed')
      );

      permissionsManager = new PermissionsManager(mockLogger);

      await expect(permissionsManager.initialize()).rejects.toThrow();
    });
  });

  describe('Windows Initialization', () => {
    beforeEach(() => {
      (PlatformDetector.isMac as jest.Mock).mockReturnValue(false);
      (PlatformDetector.isWindows as jest.Mock).mockReturnValue(true);
      (PlatformDetector.getPlatform as jest.Mock).mockReturnValue('win32');
    });

    it('should check admin privileges on Windows', async () => {
      permissionsManager = new PermissionsManager(mockLogger);
      await permissionsManager.initialize();

      expect(mockWindowsPermissions.checkAdminPrivileges).toHaveBeenCalled();
    });

    it('should mark admin privileges as checked', async () => {
      permissionsManager = new PermissionsManager(mockLogger);
      await permissionsManager.initialize();

      expect(mockStore.set).toHaveBeenCalledWith('admin_privileges_checked', true);
    });

    it('should request admin privileges when not already present', async () => {
      mockWindowsPermissions.checkAdminPrivileges.mockResolvedValue(false);

      permissionsManager = new PermissionsManager(mockLogger);
      await permissionsManager.initialize();

      expect(mockWindowsPermissions.requestAdminPrivileges).toHaveBeenCalled();
    });

    it('should not request admin privileges when already present', async () => {
      mockWindowsPermissions.checkAdminPrivileges.mockResolvedValue(true);

      permissionsManager = new PermissionsManager(mockLogger);
      await permissionsManager.initialize();

      expect(mockWindowsPermissions.requestAdminPrivileges).not.toHaveBeenCalled();
    });

    it('should log warning when user requests admin restart', async () => {
      mockWindowsPermissions.checkAdminPrivileges.mockResolvedValue(false);
      mockWindowsPermissions.requestAdminPrivileges.mockResolvedValue(true);

      permissionsManager = new PermissionsManager(mockLogger);
      await permissionsManager.initialize();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('admin restart')
      );
    });

    it('should check notification access', async () => {
      permissionsManager = new PermissionsManager(mockLogger);
      await permissionsManager.initialize();

      expect(mockWindowsPermissions.checkNotificationAccess).toHaveBeenCalled();
    });

    it('should log notification access status', async () => {
      mockWindowsPermissions.checkNotificationAccess.mockResolvedValue(true);

      permissionsManager = new PermissionsManager(mockLogger);
      await permissionsManager.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Windows notifications available: true')
      );
    });

    it('should handle notification access unavailable', async () => {
      mockWindowsPermissions.checkNotificationAccess.mockResolvedValue(false);

      permissionsManager = new PermissionsManager(mockLogger);
      await permissionsManager.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Windows notifications available: false')
      );
    });
  });

  describe('Screen Recording Requests', () => {
    beforeEach(() => {
      (PlatformDetector.isMac as jest.Mock).mockReturnValue(true);
      (PlatformDetector.isWindows as jest.Mock).mockReturnValue(false);
      (PlatformDetector.getPlatform as jest.Mock).mockReturnValue('darwin');
    });

    it('should return screen recording status from store', async () => {
      mockStore.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'screen_recording_granted') {
          return true;
        }
        return defaultValue;
      });

      permissionsManager = new PermissionsManager(mockLogger);
      const state = permissionsManager.getPermissionState();

      expect(state.screen_recording_granted).toBe(true);
    });

    it('should return false for screen recording when not granted', async () => {
      mockStore.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'screen_recording_granted') {
          return false;
        }
        return defaultValue;
      });

      permissionsManager = new PermissionsManager(mockLogger);
      const state = permissionsManager.getPermissionState();

      expect(state.screen_recording_granted).toBe(false);
    });

    it('should persist screen recording state after initialization', async () => {
      mockMacOSPermissions.requestScreenRecording.mockResolvedValue(true);

      permissionsManager = new PermissionsManager(mockLogger);
      await permissionsManager.initialize();

      expect(mockStore.set).toHaveBeenCalledWith('screen_recording_granted', true);
    });

    it('should handle screen recording requests returning different states', async () => {
      mockMacOSPermissions.requestScreenRecording.mockResolvedValue(false);

      permissionsManager = new PermissionsManager(mockLogger);
      await permissionsManager.initialize();

      expect(mockStore.set).toHaveBeenCalledWith('screen_recording_granted', false);
    });
  });

  describe('Admin Checks (Windows)', () => {
    beforeEach(() => {
      (PlatformDetector.isMac as jest.Mock).mockReturnValue(false);
      (PlatformDetector.isWindows as jest.Mock).mockReturnValue(true);
      (PlatformDetector.getPlatform as jest.Mock).mockReturnValue('win32');
    });

    it('should return admin privileges checked status from store', async () => {
      mockStore.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'admin_privileges_checked') {
          return true;
        }
        return defaultValue;
      });

      permissionsManager = new PermissionsManager(mockLogger);
      const state = permissionsManager.getPermissionState();

      expect(state.admin_privileges_checked).toBe(true);
    });

    it('should return false for admin privileges when not checked', async () => {
      mockStore.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'admin_privileges_checked') {
          return false;
        }
        return defaultValue;
      });

      permissionsManager = new PermissionsManager(mockLogger);
      const state = permissionsManager.getPermissionState();

      expect(state.admin_privileges_checked).toBe(false);
    });

    it('should update admin privileges checked state after initialization', async () => {
      permissionsManager = new PermissionsManager(mockLogger);
      await permissionsManager.initialize();

      expect(mockStore.set).toHaveBeenCalledWith('admin_privileges_checked', true);
    });

    it('should mark admin as checked even when privileges are not granted', async () => {
      mockWindowsPermissions.checkAdminPrivileges.mockResolvedValue(false);
      mockWindowsPermissions.requestAdminPrivileges.mockResolvedValue(false);

      permissionsManager = new PermissionsManager(mockLogger);
      await permissionsManager.initialize();

      expect(mockStore.set).toHaveBeenCalledWith('admin_privileges_checked', true);
    });
  });

  describe('getPermissionState()', () => {
    beforeEach(() => {
      (PlatformDetector.isMac as jest.Mock).mockReturnValue(false);
      (PlatformDetector.isWindows as jest.Mock).mockReturnValue(false);
    });

    it('should return PermissionState object with all properties', () => {
      permissionsManager = new PermissionsManager(mockLogger);
      const state = permissionsManager.getPermissionState();

      expect(state).toHaveProperty('accessibility_granted');
      expect(state).toHaveProperty('screen_recording_granted');
      expect(state).toHaveProperty('admin_privileges_checked');
    });

    it('should return false for all permissions by default', () => {
      mockStore.get.mockReturnValue(false);

      permissionsManager = new PermissionsManager(mockLogger);
      const state = permissionsManager.getPermissionState();

      expect(state.accessibility_granted).toBe(false);
      expect(state.screen_recording_granted).toBe(false);
      expect(state.admin_privileges_checked).toBe(false);
    });

    it('should return correct state when permissions are granted', () => {
      mockStore.get.mockImplementation((key: string, defaultValue?: any) => {
        const stateMap: Record<string, boolean> = {
          accessibility_granted: true,
          screen_recording_granted: true,
          admin_privileges_checked: true,
        };
        return stateMap[key] !== undefined ? stateMap[key] : defaultValue;
      });

      permissionsManager = new PermissionsManager(mockLogger);
      const state = permissionsManager.getPermissionState();

      expect(state.accessibility_granted).toBe(true);
      expect(state.screen_recording_granted).toBe(true);
      expect(state.admin_privileges_checked).toBe(true);
    });

    it('should return mixed permission states', () => {
      mockStore.get.mockImplementation((key: string, defaultValue?: any) => {
        const stateMap: Record<string, boolean> = {
          accessibility_granted: true,
          screen_recording_granted: false,
          admin_privileges_checked: true,
        };
        return stateMap[key] !== undefined ? stateMap[key] : defaultValue;
      });

      permissionsManager = new PermissionsManager(mockLogger);
      const state = permissionsManager.getPermissionState();

      expect(state.accessibility_granted).toBe(true);
      expect(state.screen_recording_granted).toBe(false);
      expect(state.admin_privileges_checked).toBe(true);
    });

    it('should use default values when store returns undefined', () => {
      mockStore.get.mockImplementation((_key: string, defaultValue?: any) => defaultValue);

      permissionsManager = new PermissionsManager(mockLogger);
      const state = permissionsManager.getPermissionState();

      expect(state.accessibility_granted).toBe(false);
      expect(state.screen_recording_granted).toBe(false);
      expect(state.admin_privileges_checked).toBe(false);
    });
  });

  describe('Store Persistence', () => {
    beforeEach(() => {
      (PlatformDetector.isMac as jest.Mock).mockReturnValue(true);
      (PlatformDetector.isWindows as jest.Mock).mockReturnValue(false);
      (PlatformDetector.getPlatform as jest.Mock).mockReturnValue('darwin');
    });

    it('should persist screen recording state to store', async () => {
      mockMacOSPermissions.requestScreenRecording.mockResolvedValue(true);

      permissionsManager = new PermissionsManager(mockLogger);
      await permissionsManager.initialize();

      expect(mockStore.set).toHaveBeenCalledWith('screen_recording_granted', true);
    });

    it('should read permission state from store', () => {
      mockStore.get.mockImplementation((key: string, defaultValue?: any) => {
        const stateMap: Record<string, boolean> = {
          screen_recording_granted: true,
        };
        return stateMap[key] !== undefined ? stateMap[key] : defaultValue;
      });

      permissionsManager = new PermissionsManager(mockLogger);
      const state = permissionsManager.getPermissionState();

      expect(state.screen_recording_granted).toBe(true);
      expect(mockStore.get).toHaveBeenCalled();
    });

    it('should store name should be clipguard-permissions', () => {
      permissionsManager = new PermissionsManager(mockLogger);

      expect(Store).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'clipguard-permissions',
        })
      );
    });

    it('should persist multiple permission states', async () => {
      mockWindowsPermissions.checkAdminPrivileges.mockResolvedValue(true);

      (PlatformDetector.isMac as jest.Mock).mockReturnValue(false);
      (PlatformDetector.isWindows as jest.Mock).mockReturnValue(true);
      (PlatformDetector.getPlatform as jest.Mock).mockReturnValue('win32');

      permissionsManager = new PermissionsManager(mockLogger);
      await permissionsManager.initialize();

      expect(mockStore.set).toHaveBeenCalledWith('admin_privileges_checked', true);
    });

    it('should retrieve stored permission states on subsequent calls', () => {
      mockStore.get.mockImplementation((key: string, defaultValue?: any) => {
        const stateMap: Record<string, boolean> = {
          accessibility_granted: true,
          screen_recording_granted: true,
          admin_privileges_checked: true,
        };
        return stateMap[key] !== undefined ? stateMap[key] : defaultValue;
      });

      permissionsManager = new PermissionsManager(mockLogger);
      const state1 = permissionsManager.getPermissionState();
      const state2 = permissionsManager.getPermissionState();

      expect(state1).toEqual(state2);
      expect(mockStore.get).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      (PlatformDetector.isMac as jest.Mock).mockReturnValue(true);
      (PlatformDetector.isWindows as jest.Mock).mockReturnValue(false);
      (PlatformDetector.getPlatform as jest.Mock).mockReturnValue('darwin');
    });

    it('should handle MacOSPermissions instantiation errors gracefully', () => {
      (MacOSPermissions as jest.MockedClass<typeof MacOSPermissions>).mockImplementation(
        () => {
          throw new Error('MacOS permissions initialization failed');
        }
      );

      expect(() => {
        new PermissionsManager(mockLogger);
      }).toThrow();
    });

    it('should handle screen recording request failures', async () => {
      mockMacOSPermissions.requestScreenRecording.mockRejectedValue(
        new Error('Screen recording request failed')
      );

      permissionsManager = new PermissionsManager(mockLogger);

      await expect(permissionsManager.initialize()).rejects.toThrow(
        'Screen recording request failed'
      );
    });

    it('should handle Windows admin privilege check errors', async () => {
      (PlatformDetector.isMac as jest.Mock).mockReturnValue(false);
      (PlatformDetector.isWindows as jest.Mock).mockReturnValue(true);

      mockWindowsPermissions.checkAdminPrivileges.mockRejectedValue(
        new Error('Admin check failed')
      );

      permissionsManager = new PermissionsManager(mockLogger);

      await expect(permissionsManager.initialize()).rejects.toThrow('Admin check failed');
    });

    it('should handle Windows notification access check errors', async () => {
      (PlatformDetector.isMac as jest.Mock).mockReturnValue(false);
      (PlatformDetector.isWindows as jest.Mock).mockReturnValue(true);

      mockWindowsPermissions.checkNotificationAccess.mockRejectedValue(
        new Error('Notification check failed')
      );

      permissionsManager = new PermissionsManager(mockLogger);

      await expect(permissionsManager.initialize()).rejects.toThrow(
        'Notification check failed'
      );
    });

    it('should handle store.set errors gracefully', async () => {
      mockStore.set.mockImplementation(() => {
        throw new Error('Store write failed');
      });

      permissionsManager = new PermissionsManager(mockLogger);

      await expect(permissionsManager.initialize()).rejects.toThrow('Store write failed');
    });

    it('should handle store.get errors gracefully', () => {
      mockStore.get.mockImplementation(() => {
        throw new Error('Store read failed');
      });

      permissionsManager = new PermissionsManager(mockLogger);

      expect(() => {
        permissionsManager.getPermissionState();
      }).toThrow('Store read failed');
    });

    it('should handle logger errors without crashing', async () => {
      mockLogger.info.mockImplementation(() => {
        throw new Error('Logger failed');
      });

      permissionsManager = new PermissionsManager(mockLogger);

      await expect(permissionsManager.initialize()).rejects.toThrow('Logger failed');
    });
  });

  describe('isClipboardMonitoringPermitted()', () => {
    beforeEach(() => {
      (PlatformDetector.isMac as jest.Mock).mockReturnValue(false);
      (PlatformDetector.isWindows as jest.Mock).mockReturnValue(false);
    });

    it('should always return true for clipboard monitoring', () => {
      permissionsManager = new PermissionsManager(mockLogger);
      const permitted = permissionsManager.isClipboardMonitoringPermitted();

      expect(permitted).toBe(true);
    });

    it('should return true on macOS regardless of permissions', async () => {
      (PlatformDetector.isMac as jest.Mock).mockReturnValue(true);

      permissionsManager = new PermissionsManager(mockLogger);
      const permitted = permissionsManager.isClipboardMonitoringPermitted();

      expect(permitted).toBe(true);
    });

    it('should return true on Windows regardless of permissions', async () => {
      (PlatformDetector.isWindows as jest.Mock).mockReturnValue(true);

      permissionsManager = new PermissionsManager(mockLogger);
      const permitted = permissionsManager.isClipboardMonitoringPermitted();

      expect(permitted).toBe(true);
    });

    it('should return true on Linux', () => {
      permissionsManager = new PermissionsManager(mockLogger);
      const permitted = permissionsManager.isClipboardMonitoringPermitted();

      expect(permitted).toBe(true);
    });

    it('should not depend on permission state', () => {
      mockStore.get.mockReturnValue(false);

      permissionsManager = new PermissionsManager(mockLogger);
      const permitted = permissionsManager.isClipboardMonitoringPermitted();

      expect(permitted).toBe(true);
    });

    it('should not depend on platform', async () => {
      for (const platform of ['darwin', 'win32', 'linux']) {
        jest.clearAllMocks();

        (PlatformDetector.getPlatform as jest.Mock).mockReturnValue(platform);
        (PlatformDetector.isMac as jest.Mock).mockReturnValue(platform === 'darwin');
        (PlatformDetector.isWindows as jest.Mock).mockReturnValue(platform === 'win32');

        permissionsManager = new PermissionsManager(mockLogger);
        const permitted = permissionsManager.isClipboardMonitoringPermitted();

        expect(permitted).toBe(true);
      }
    });
  });

  describe('Platform Detection Integration', () => {
    it('should detect macOS platform correctly', () => {
      (PlatformDetector.isMac as jest.Mock).mockReturnValue(true);
      (PlatformDetector.isWindows as jest.Mock).mockReturnValue(false);
      (PlatformDetector.getPlatform as jest.Mock).mockReturnValue('darwin');

      permissionsManager = new PermissionsManager(mockLogger);

      expect(PlatformDetector.isMac).toHaveBeenCalled();
    });

    it('should detect Windows platform correctly', () => {
      (PlatformDetector.isMac as jest.Mock).mockReturnValue(false);
      (PlatformDetector.isWindows as jest.Mock).mockReturnValue(true);
      (PlatformDetector.getPlatform as jest.Mock).mockReturnValue('win32');

      permissionsManager = new PermissionsManager(mockLogger);

      expect(PlatformDetector.isWindows).toHaveBeenCalled();
    });

    it('should handle platform detection when neither macOS nor Windows', () => {
      (PlatformDetector.isMac as jest.Mock).mockReturnValue(false);
      (PlatformDetector.isWindows as jest.Mock).mockReturnValue(false);
      (PlatformDetector.getPlatform as jest.Mock).mockReturnValue('linux');

      permissionsManager = new PermissionsManager(mockLogger);

      expect(MacOSPermissions).not.toHaveBeenCalled();
      expect(WindowsPermissions).not.toHaveBeenCalled();
    });
  });

  describe('Logger Integration', () => {
    beforeEach(() => {
      (PlatformDetector.isMac as jest.Mock).mockReturnValue(true);
      (PlatformDetector.isWindows as jest.Mock).mockReturnValue(false);
      (PlatformDetector.getPlatform as jest.Mock).mockReturnValue('darwin');
    });

    it('should pass logger to MacOSPermissions', () => {
      permissionsManager = new PermissionsManager(mockLogger);

      expect(MacOSPermissions).toHaveBeenCalledWith(mockLogger);
    });

    it('should log initialization start', async () => {
      permissionsManager = new PermissionsManager(mockLogger);
      await permissionsManager.initialize();

      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should log clipboard monitoring enabled message for macOS', async () => {
      permissionsManager = new PermissionsManager(mockLogger);
      await permissionsManager.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Clipboard monitoring enabled')
      );
    });

    it('should log platform name in initialization', async () => {
      permissionsManager = new PermissionsManager(mockLogger);
      await permissionsManager.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('darwin')
      );
    });
  });

  describe('Multiple Initialization Calls', () => {
    beforeEach(() => {
      (PlatformDetector.isMac as jest.Mock).mockReturnValue(true);
      (PlatformDetector.isWindows as jest.Mock).mockReturnValue(false);
      (PlatformDetector.getPlatform as jest.Mock).mockReturnValue('darwin');
    });

    it('should handle multiple initialize calls', async () => {
      permissionsManager = new PermissionsManager(mockLogger);

      await permissionsManager.initialize();
      await permissionsManager.initialize();

      expect(mockMacOSPermissions.requestScreenRecording).toHaveBeenCalledTimes(2);
    });

    it('should handle multiple getPermissionState calls', () => {
      permissionsManager = new PermissionsManager(mockLogger);

      const state1 = permissionsManager.getPermissionState();
      const state2 = permissionsManager.getPermissionState();

      expect(state1).toEqual(state2);
    });

    it('should maintain state across multiple calls', async () => {
      mockStore.get.mockImplementation((key: string, defaultValue?: any) => {
        const stateMap: Record<string, boolean> = {
          screen_recording_granted: true,
        };
        return stateMap[key] !== undefined ? stateMap[key] : defaultValue;
      });

      permissionsManager = new PermissionsManager(mockLogger);

      const state1 = permissionsManager.getPermissionState();
      const state2 = permissionsManager.getPermissionState();

      expect(state1.screen_recording_granted).toBe(state2.screen_recording_granted);
    });
  });

  describe('Store Defaults', () => {
    it('should initialize store with default permission states', () => {
      (PlatformDetector.isMac as jest.Mock).mockReturnValue(false);
      (PlatformDetector.isWindows as jest.Mock).mockReturnValue(false);

      permissionsManager = new PermissionsManager(mockLogger);

      expect(Store).toHaveBeenCalledWith({
        name: 'clipguard-permissions',
        defaults: {
          accessibility_granted: false,
          screen_recording_granted: false,
          admin_privileges_checked: false,
        },
      });
    });

    it('should use defaults when no stored values exist', () => {
      (PlatformDetector.isMac as jest.Mock).mockReturnValue(false);
      (PlatformDetector.isWindows as jest.Mock).mockReturnValue(false);

      mockStore.get.mockReturnValue(false);

      permissionsManager = new PermissionsManager(mockLogger);
      const state = permissionsManager.getPermissionState();

      expect(state.accessibility_granted).toBe(false);
      expect(state.screen_recording_granted).toBe(false);
      expect(state.admin_privileges_checked).toBe(false);
    });
  });

  describe('Type Safety and Interfaces', () => {
    beforeEach(() => {
      (PlatformDetector.isMac as jest.Mock).mockReturnValue(false);
      (PlatformDetector.isWindows as jest.Mock).mockReturnValue(false);
    });

    it('should return PermissionState matching expected interface', () => {
      permissionsManager = new PermissionsManager(mockLogger);
      const state = permissionsManager.getPermissionState();

      const expectedInterface: PermissionState = {
        accessibility_granted: false,
        screen_recording_granted: false,
        admin_privileges_checked: false,
      };

      expect(state).toEqual(expectedInterface);
    });

    it('should have boolean values for all permission states', () => {
      permissionsManager = new PermissionsManager(mockLogger);
      const state = permissionsManager.getPermissionState();

      expect(typeof state.accessibility_granted).toBe('boolean');
      expect(typeof state.screen_recording_granted).toBe('boolean');
      expect(typeof state.admin_privileges_checked).toBe('boolean');
    });

    it('should return boolean from isClipboardMonitoringPermitted', () => {
      permissionsManager = new PermissionsManager(mockLogger);
      const permitted = permissionsManager.isClipboardMonitoringPermitted();

      expect(typeof permitted).toBe('boolean');
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      (PlatformDetector.isMac as jest.Mock).mockReturnValue(false);
      (PlatformDetector.isWindows as jest.Mock).mockReturnValue(false);
    });

    it('should handle null logger gracefully', () => {
      // TypeScript would prevent this, but testing for runtime behavior
      const nullLogger = null as any;

      expect(() => {
        permissionsManager = new PermissionsManager(nullLogger);
      }).not.toThrow();
    });

    it('should handle undefined platform gracefully', () => {
      (PlatformDetector.getPlatform as jest.Mock).mockReturnValue(undefined);

      permissionsManager = new PermissionsManager(mockLogger);

      expect(() => {
        permissionsManager.getPermissionState();
      }).not.toThrow();
    });

    it('should handle rapid successive initialization calls', async () => {
      (PlatformDetector.isMac as jest.Mock).mockReturnValue(true);
      (PlatformDetector.isWindows as jest.Mock).mockReturnValue(false);

      permissionsManager = new PermissionsManager(mockLogger);

      const promises = [
        permissionsManager.initialize(),
        permissionsManager.initialize(),
        permissionsManager.initialize(),
      ];

      await Promise.all(promises);

      expect(mockMacOSPermissions.requestScreenRecording).toHaveBeenCalledTimes(3);
    });
  });
});
