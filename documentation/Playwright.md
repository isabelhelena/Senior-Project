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

# WebKit (Safari engine) only
npx playwright test --project=webkit
```

### Run a Single Test File
```bash
npx playwright test tests/incident-report.spec.ts --project=chromium
```

### Interactive UI Mode
Playwright UI Mode allows you to step through assertions, view DOM snapshots, and inspect network requests in real time:
```bash
npm run test:e2e:ui
```

---

## ⚙️ CI/CD & Headless WebGL Configuration

The CI pipeline runs automated checks on push and pull requests via GitHub Actions in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

### SwiftShader CPU Software Rasterization
Playwright tests interact with live hardware-accelerated MapLibre GL canvases. Because Linux CI agents (e.g. `ubuntu-latest`) lack dedicated GPUs, `playwright.config.ts` passes Google's SwiftShader CPU rendering flags directly to Chromium:
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

### WebServer Configuration in CI
In continuous integration environments (`CI=true`):
- `playwright.config.ts` runs an optimized production build (`node node_modules/next/dist/bin/next build && node node_modules/next/dist/bin/next start`) to ensure fast, deterministic page serving.
- `reporter: [['list'], ['html', { open: 'never' }]]` prevents non-interactive terminal hanging.
- If an E2E test fails in GitHub Actions, test traces, videos, and HTML reports are uploaded as downloadable artifacts for 7 days.

---

## 🔍 Best Practices for Map & Telemetry Testing

1. **Avoid Hardcoded Port URLs:**
   Use relative path navigation (e.g. `await page.goto("/test-map")`) so requests automatically resolve to Playwright's `baseURL` (`http://127.0.0.1:3000`).

2. **Wait for MapLibre Canvas Mount:**
   The map component sets a `data-map-loaded="true"` attribute on its outer container once style loading and initial layer attachment complete:
```ts
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
