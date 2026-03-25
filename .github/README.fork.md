# Teams for Linux

Unofficial Microsoft Teams desktop client for Linux.

This repository tracks upstream while providing fork-specific changes such as stock icons, ad removal, and custom packaging/distribution.

## Installation

Use the package repository instructions:

- Debian/Ubuntu (APT): https://apt.lukastesar.cz/README.txt
- Fedora/RHEL (RPM): https://rpm.lukastesar.cz/README.txt

## Quick Start

1. Install `teams-for-linux` from one of the repositories above.
2. Launch the app:

```bash
teams-for-linux
```

## Development

```bash
npm install
npm run pack
```

`npm run pack` is preferred for local development in this fork because it uses configuration from your home directory.

## Temporary clean Teams data (tmpfs)

If you want to temporarily run with a clean Teams profile, you can mount the config directory to tmpfs:

```bash
sudo mount -t tmpfs tmpfs ~username/.config/teams-for-linux
```

## Documentation

- Configuration: [docs-site/docs/configuration.md](docs-site/docs/configuration.md)
- Troubleshooting: [docs-site/docs/troubleshooting.md](docs-site/docs/troubleshooting.md)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)

## History

See [HISTORY.md](HISTORY.md).

## License

GPL-3.0 — see [LICENSE.md](LICENSE.md).
