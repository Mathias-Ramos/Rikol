import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  webServer: {
    command: "npm run dev -- --port 4174",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: !process.env.CI
  },
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "mobile",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2
      }
    },
    {
      name: "desktop",
      use: { viewport: { width: 1280, height: 900 } }
    }
  ]
});
