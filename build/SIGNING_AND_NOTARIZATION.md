# macOS Code Signing & Notarization Setup

## Prerequisites

1. **Apple Developer Account** with valid certificates
2. **Team ID** from your Apple Developer account
3. **App-specific password** for notarization

## Certificate Setup

### 1. Create Code Signing Certificate
- Log in to [Apple Developer](https://developer.apple.com)
- Create "Developer ID Application" certificate
- Download and install in Keychain
- Note the certificate identity (Common Name)

### 2. Export Certificate for CI/CD
```bash
# Export from Keychain (requires manual steps in Keychain app)
# Or use certificate file in CSC_LINK environment variable
```

## Environment Variables

Configure these before building:

```bash
export APPLEID="your-apple-id@example.com"
export APPLEIDPASS="xxxx-xxxx-xxxx-xxxx"  # App-specific password from Apple ID settings
export APPLETEAMID="XXXXXXXXXX"            # Your Team ID (10-char code)
export CSC_LINK="path/to/certificate.p12"  # OR certificate content (base64 encoded)
export CSC_KEY_PASSWORD="your-cert-password"
export CSC_IDENTITY_AUTO_DISCOVERY="false" # Optional: disable auto-discovery
```

## Notarization Configuration

The `electron-builder.macos.yml` includes notarization hooks. Update:

```yaml
mac:
  notarize:
    teamId: XXXXXXXXXX  # Your Team ID
```

Electron-builder will automatically:
1. Submit app for notarization after signing
2. Wait for Apple's processing
3. Staple notarization ticket to app

## Build Command

```bash
npm run electron-builder
# or
electron-builder -c electron-builder.macos.yml
```

For local builds without notarization:
```bash
CSC_KEY_PASSWORD="" electron-builder --mac --publish never
```

## Troubleshooting

### Certificate not found
- Verify certificate is in Keychain (Keychain Access app)
- Check identity format: `Developer ID Application: [Name] ([Team ID])`

### Notarization timeout
- Check Apple's notarization status: https://developer.apple.com/account/resources/notarize/
- Re-run build; electron-builder will retry

### "Code is invalid" error
- Verify app is signed correctly: `codesign -v --deep dist/AIClipboard.app`
- Check entitlements: `codesign -d --entitlements :- dist/AIClipboard.app`

### Gatekeeper warnings
- Ensure `notarize` section is configured
- Wait for notarization to complete before distribution

## Distribution

Once notarized:
1. DMG file can be distributed directly
2. App will pass Gatekeeper without warnings
3. Users won't see "unidentified developer" message

## References

- [Electron Builder - macOS](https://www.electron.build/configuration/mac)
- [Apple Code Signing](https://developer.apple.com/support/code-signing/)
- [Notarizing macOS Software](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
