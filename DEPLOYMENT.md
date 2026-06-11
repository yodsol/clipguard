# ClipGuard v1.0.0 - Deployment Package

## **Installation Instructions**

### macOS

#### Option 1: Using DMG Installer (Recommended)
1. Download `ClipGuard-1.0.0-arm64.dmg`
2. Double-click to mount the image
3. Drag "ClipGuard" to the "Applications" folder
4. Open Applications → ClipGuard
5. Grant required permissions when prompted

#### Option 2: Using ZIP (Portable)
1. Download `ClipGuard-1.0.0-arm64-mac.zip`
2. Extract to any location
3. Double-click `ClipGuard.app` to run
4. Grant required permissions when prompted

---

## **Features**

✅ **Clipboard Monitoring**
- Detects sensitive data (API keys, passwords, credit cards, SSNs, etc.)
- Real-time scanning with 1000ms polling interval
- Works silently in system tray

✅ **Protection Options**
- Auto-clear sensitive clipboard data (configurable delay)
- Warning dialogs for detected sensitive data
- Detection history (last 100 items)

✅ **System Tray Integration**
- Quick toggle monitoring on/off
- View detection history
- Test detection with mock data
- Auto-start on login

---

## **System Requirements**

- **macOS 10.12+** (Sierra or later)
- **Intel or Apple Silicon** (arm64/x86_64)
- **~150 MB disk space**
- **No additional dependencies required**

---

## **Permissions**

**ClipGuard requires NO special system permissions on modern macOS.**

Previous versions requested Accessibility or Screen Recording permissions, but Electron's clipboard API works without these. The app runs entirely in the background.

---

## **Security**

✅ **CRITICAL fixes applied:**
- Command injection vulnerability patched (permissions.js)
- IPC input validation added (clipboard-service.ts)
- Regex state bugs fixed (detector logic)
- Null pointer crash protection added

✅ **Test coverage:** 535/535 tests passing (100%)

---

## **Uninstall**

Simply drag `ClipGuard.app` to Trash from Applications folder.

Configuration and history are stored in: `~/Library/Application Support/clipguard/`

---

## **Troubleshooting**

### App won't start
- Ensure macOS is 10.12 or newer
- Check System Preferences → Security & Privacy → allow app to run

### Clipboard monitoring not working
- Toggle monitoring off/off from tray menu
- Check tray icon for status indicator

### Permission denied errors
- No permissions needed—verify app is running from Applications folder

---

## **Support**

Built with Electron 42.3.2 | Node.js compatible | TypeScript + Jest test suite

For issues: Check the app logs in `~/Library/Application Support/clipguard/`

---

**Version:** 1.0.0  
**Build Date:** June 8, 2026  
**Architecture:** arm64 (Apple Silicon)
