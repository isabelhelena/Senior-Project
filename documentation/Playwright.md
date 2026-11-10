# 🎭 Playwright E2E Testing Guide

This project uses **Playwright** for automated End-to-End (E2E) testing. The configuration is optimized to work smoothly across both **Windows** and **Linux** (including WSL2) environments without package tool breakages or GPU dependencies.

---

## 🛠️ Initial Workspace Setup

Before running tests for the first time, install the project dependencies and download the Playwright browser binaries.

### 1. Install Node Dependencies
From the project root:
```bash
npm install
```

### 2. Install Browser Binaries and System Dependencies

#### 💻 Windows Users
Windows desktop environments generally have all required media and graphics runtime libraries pre-installed. Run:
```powershell
npm run test:e2e:install
```
> **Note:** If running in PowerShell with strict execution policies, ensure script execution is allowed for your session:
> ```powershell
> Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
> ```

#### 🐧 Linux Users (Ubuntu, Debian, WSL2)
Headless Linux environments require system-level graphics hooks and shared libraries (Mesa, SwiftShader, WebGL runtime hooks) to compile WebGL contexts. Run:
```bash
# Downloads browser binaries and system packages in one command
npx playwright install --with-deps
```
Alternatively, if you already ran `npm run test:e2e:install`:
```bash
sudo npx playwright install-deps
```

> **WSL2 Note:** If you want to use Playwright UI Mode (`npm run test:e2e:ui`) or headed mode (`--headed`) on Windows Subsystem for Linux, ensure WSLg (Windows 11 GUI support) is enabled, or run the tests in headless mode.

---

## 🚀 Running Tests

Use the following helper commands from your project root folder:

### Run All Tests (Headless Mode)
Runs tests concurrently across Chromium, Firefox, and WebKit:
```bash
npm run test:e2e
```

### Run Against a Specific Browser
```bash
# Chromium only (fastest for local dev)
npx playwright test --project=chromium

# Firefox only
npx playwright test --project=firefox

# WebKit (Safari) only
npx playwright test --project=webkit
```

### Run a Specific Test File
```bash
npx playwright test tests/map.spec.ts
```

### Interactive Test Dashboard (UI Mode)
Recommended for step-by-step debugging, time-travel inspection, and watching DOM state:
```bash
npm run test:e2e:ui
```

### Run in Headed Mode (Watch Browser Windows)
```bash
npx playwright test --headed
```

### View Test Reports
The test runner is configured with `{ open: 'never' }` so that automated runs do not block the terminal. To open the generated HTML report:
```bash
npx playwright show-report
```

---

## 🗺️ How MapLibre & WebGL Testing Works

The `/test-map` route utilizes **MapLibre GL JS**, which requires a WebGL context to parse vector tiles and trigger map events.

### 1. Headless WebGL Software Rendering
In `playwright.config.ts`, Chromium is launched with SwiftShader software rasterization flags:
```ts
launchOptions: {
  args: [
    "--enable-webgl",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--ignore-gpu-blocklist",
  ],
}
```
This enables MapLibre to acquire a WebGL context even in CI environments, virtual machines, or systems without a dedicated GPU.

### 2. Geolocation Mocking
Tests mock browser geolocation permissions and coordinates (defaulting to San Antonio, TX) via Playwright's `test.use()`:
```ts
test.use({
  geolocation: { latitude: 29.3388, longitude: -98.5362 },
  permissions: ["geolocation"],
});
```

### 3. Map Readiness State
The `CrisisMap` component exposes a `data-map-loaded` attribute on its container element. It initializes to `"false"` and updates to `"true"` inside MapLibre's `onLoad` callback:
```typescript
// 1. Ensure the canvas element is attached to DOM
await expect(page.locator(".maplibregl-canvas")).toBeAttached({ timeout: 20_000 });

// 2. Wait for MapLibre to complete tile loading and style rendering
await expect(page.locator("[data-map-loaded]")).toHaveAttribute("data-map-loaded", "true", {
  timeout: 30_000,
});
```

---

## 💡 Troubleshooting Cross-Platform Flakiness

### 1. Dev Server & Port 3000 Conflicts
`playwright.config.ts` automatically spins up `next dev` if the server is not running, or reuses an existing server on port `3000`. If an old server process is unresponsive or hung on port 3000:
- **Linux / WSL:**
  ```bash
  fuser -k 3000/tcp
  ```
- **Windows (PowerShell):**
  ```powershell
  Stop-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess -Force
  ```

### 2. Next.js Dev Origin & HMR Warnings
If you see `Blocked cross-origin request to Next.js dev resource` in console output, ensure [`next.config.ts`](../next.config.ts) permits localhost and IPv4 loopback:
```ts
const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};
```

### 3. IPv6 vs IPv4 Routing
`playwright.config.ts` uses `http://127.0.0.1:3000` as the `baseURL` and `webServer.url` to prevent DNS lookup delays on systems where `localhost` resolves intermittently to `::1`. Always use relative paths (`await page.goto("/test-map")`) in spec files.
