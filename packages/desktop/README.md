# Nano Agent Desktop

A modern Electron desktop application for Nano-Agent.

## Tech Stack

- **Core**: Electron 28 + React 18 + TypeScript 5.3
- **Build Tool**: electron-vite 2.0
- **UI**: Tailwind CSS 3.4
- **State Management**: Zustand 4.5
- **Markdown**: react-markdown 10 + remark-gfm + rehype-highlight

## Prerequisites

- Node.js 18+
- npm or yarn

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Type check
npm run typecheck

# Build for production
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
desktop/
├── src/
│   ├── main/           # Electron main process
│   ├── preload/        # Preload scripts
│   └── renderer/       # React renderer process
│       ├── components/ # React components
│       ├── stores/     # Zustand stores
│       ├── lib/        # Utilities and API
│       └── types/      # TypeScript types
├── out/                # Build output
├── resources/          # App resources
└── electron.vite.config.ts
```

## Features (Phase 0)

- ✅ Basic Electron app setup
- ✅ React + TypeScript configuration
- ✅ Tailwind CSS integration
- ✅ Connection to Nano-Agent server
- ✅ Real-time streaming chat (SSE)
- ✅ Message display (user/assistant/thinking/tooluse)
- ✅ Auto-scroll to latest messages
- ✅ Connection status indicator

## Connection

The app connects to the Nano-Agent server at `http://localhost:3847`.

## License

MIT
