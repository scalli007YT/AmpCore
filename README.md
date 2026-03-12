# CVR AMP Controller Web

Desktop-first control and monitoring app for CVR amplifier devices.

This project combines:

- Next.js App Router for the UI and local API routes
- Electron for desktop packaging and runtime
- Zustand stores for project/device state
- UDP-based device communication through server-side libs in `lib/`

## Features

- Project-based amplifier assignment
- Device discovery/scanning
- Live monitoring and amp control
- Matrix/Limiter view
- Preset recall/store workflow
- Electron packaging for Windows (NSIS)

## Requirements

- Node.js 20+
- pnpm

## Install

```bash
pnpm install
```

## Development

Run the web app only:

```bash
pnpm dev
```

Run Next.js + Electron together (desktop dev mode):

```bash
pnpm electron:dev
```

## Build

Build the Next.js app:

```bash
pnpm build
```

Create a Windows Electron installer:

```bash
pnpm electron:build
```

## Lint

```bash
pnpm lint
```

## Key Routes

- `/monitor` - project monitor and amp control UI
- `/scanner` - network scanner for amp discovery
- `/api/*` - internal API routes for scan/runtime/actions/presets/projects

## Storage

- Project data is stored under `storage/projects/`
- In Electron production, user-data paths are resolved by the Electron process

## Tech Stack

- Next.js 16, React 19, TypeScript
- Tailwind CSS 4
- shadcn/ui primitives
- Electron + electron-builder

## License

MIT (see `LICENSE`)
