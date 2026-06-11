# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Windows support (in progress)
- Linux support (planned)
- Custom detection rules (planned)

## [1.0.0] - 2026-06-11

### Added
- Initial stable release
- Real-time clipboard monitoring every 1000ms
- Detection for 10+ sensitive data types:
  - API keys (Stripe, GitHub, AWS)
  - Database credentials (MongoDB, PostgreSQL)
  - Private keys (RSA, OpenSSH, PGP)
  - Credit cards & SSN
  - Bearer tokens & JWT
- Mock data conversion feature
- Detection history tracking
- Menu bar UI with toggle controls
- macOS Monterey+ support
- System permissions handling
- Low-footprint design (~100 MB RAM, <1% CPU)

### Technical
- Layered DI architecture with 7 services
- TypeScript strict mode
- Comprehensive test coverage
- ESLint & Prettier integration
- electron-builder for packaging
- Sentry integration for error tracking

---

## Release Process

### Versioning
- **Major** — Breaking changes, architectural shifts
- **Minor** — New features, non-breaking additions
- **Patch** — Bug fixes, minor improvements

### Creating a Release

1. Update version in `package.json`
2. Update `CHANGELOG.md` with changes
3. Commit: `git commit -m "Release v1.x.x"`
4. Tag: `git tag -a v1.x.x -m "Release v1.x.x"`
5. Push: `git push origin main --tags`
6. GitHub Actions automatically creates a release with built artifacts

### Distribution

- **macOS** — .dmg + .zip via GitHub Releases
- **Windows** — NSIS installer + portable .exe
- **Linux** — AppImage + .deb packages

All builds are code-signed and notarized where applicable.
