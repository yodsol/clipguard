import { app } from 'electron';
import { AppService } from './services/app-service';

let appService: AppService;

// Prevent multiple instances from running
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('[MAIN] Another instance is already running. Exiting.');
  app.quit();
} else {
  app.on('second-instance', () => {
    console.log('[MAIN] Another instance tried to start. Focusing existing window.');
    // Could show main window here if it exists
  });
}

app.on('ready', async () => {
  console.log('[MAIN] App ready event fired');

  // Hide from Dock - this is a menu bar only app
  if (process.platform === 'darwin' && app.dock) {
    console.log('[MAIN] Hiding dock');
    app.dock.hide();
  }

  console.log('[MAIN] Creating AppService');
  appService = new AppService();

  console.log('[MAIN] Initializing AppService');
  await appService.initialize();

  console.log('[MAIN] AppService initialized - app should now have tray visible');
});

// Also use whenReady() as a fallback
app.whenReady().then(() => {
  console.log('[MAIN] whenReady() fired - confirming setup is complete');
});

app.on('window-all-closed', () => {
  // Don't quit on window close - keep app running in tray
  // Only quit when explicitly requested via Quit menu
  // This applies to all platforms (macOS menu bar, Windows/Linux system tray)
  // app.quit() is only called via the Quit menu option
});

app.on('before-quit', () => {
  appService.shutdown();
});

// Handle any uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});
