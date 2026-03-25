# AmpCore

Desktop-first control and monitoring app for networked amplifier devices.

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

### Demo Simulation Mode

When creating a project, choose `Demo Amps` as project mode.

Demo projects use simulated amps only, while real projects use real discovered amps only.

In demo projects, the app uses simulated amps for:

- `/api/scan` (discoverable demo devices)
- `/api/amp-events` (live discovery + heartbeat SSE)
- `/api/amp-channel-data` (synthetic FC=27 payload)
- `/api/amp-actions` (stateful simulated command handling)
- `/api/amp-runtime/[mac]` (synthetic runtime minutes)

Current default simulated models:

- DSP-1002 (2 analog in, 2 out)
- DSP-1004 (4 analog in, 4 out)
- DSP-1002D (2 analog in, 2 out, 2 dante in)
- DSP-1004D (4 analog in, 4 out, 4 dante in)

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
