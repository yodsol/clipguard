# ClipGuard

A macOS menu bar application that monitors your clipboard and prevents accidental exposure of sensitive data (API keys, credentials, tokens, credit cards, SSNs) when sharing with AI tools.

## Features

- **Real-time Clipboard Monitoring** — Polls clipboard every 1000ms for sensitive data
- **Multi-type Detection** — Detects:
  - API keys (Stripe, GitHub, AWS, etc.)
  - Database credentials
  - Private keys (RSA, OpenSSH, PGP)
  - Credit card numbers
  - Social Security Numbers
  - Bearer tokens & JWT
- **Mock Data Conversion** — Convert real secrets to `MOCK_*` equivalents before sharing
- **Detection History** — Track detected secrets over time
- **Low Footprint** — ~100 MB RAM, <1% CPU
- **Single Instance** — Prevents multiple app instances

## Requirements

- macOS 10.13+
- Node.js 16+
- npm or yarn

## Installation

### From Source

```bash
git clone https://github.com/yodsol/clipguard.git
cd clipguard
npm install
npm start
```

### Development

```bash
npm run dev        # Run with dev tools
npm run lint       # ESLint check
npm run test       # Run tests
npm run type-check # TypeScript check
```

### Build

```bash
npm run build:mac       # macOS .dmg + .zip
npm run build:windows   # Windows installer + portable
npm run build:linux     # Linux AppImage + .deb
npm run build           # All platforms
```

Built packages go to `dist-packages/`

## Architecture

Layered dependency injection with 7 core services:

- **AppService** — Menu bar UI, monitoring controls, feature toggles
- **DetectorService** — Sensitive data pattern matching
- **ClipboardService** — System clipboard access
- **StorageService** — Persistent history & settings
- **ConfigService** — Application configuration
- **LoggerService** — Event logging
- **ErrorHandler** — Error tracking & reporting

## Configuration

User settings stored in `~/.config/ClipGuard/` (macOS) or `%APPDATA%\ClipGuard\` (Windows).

## Testing

```bash
npm test                    # All tests
npm test -- --coverage      # Coverage report
```

## Tech Stack

- **Electron** — Cross-platform desktop app
- **TypeScript** — Type-safe development
- **electron-builder** — Packaging & distribution
- **Jest** — Testing framework
- **ESLint** — Code linting
- **Prettier** — Code formatting

## License

MIT — See [LICENSE](LICENSE) for details

## Contributing

We welcome contributions! Please:

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## Roadmap

- [x] macOS support
- [ ] Windows support (in progress)
- [ ] Linux support
- [ ] Custom detection rules
- [ ] Browser extension
- [ ] Team management

## Support

For issues, questions, or feature requests: [GitHub Issues](https://github.com/yodsol/clipguard/issues)

---

Made with ❤️ by [Yodhin Solutions](https://yodhinsolutions.com)
