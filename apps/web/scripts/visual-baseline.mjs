import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const baseUrl = process.env.PREVIEW_BASE_URL ?? 'http://127.0.0.1:3000';
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '../visual/baseline');

await mkdir(outDir, { recursive: true });

const shots = [
  { name: 'home-desktop', route: '/', viewport: { width: 1440, height: 900 } },
  { name: 'forum-desktop', route: '/forum', viewport: { width: 1440, height: 900 } },
  { name: 'login-desktop', route: '/login', viewport: { width: 1440, height: 900 } },
  {
    name: 'notifications-desktop',
    route: '/notifications',
    viewport: { width: 1440, height: 900 },
  },
  {
    name: 'home-mobile',
    route: '/',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  },
  {
    name: 'forum-mobile',
    route: '/forum',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  },
];

const browser = await chromium.launch();
try {
  for (const shot of shots) {
    const page = await browser.newPage({
      viewport: shot.viewport,
      deviceScaleFactor: shot.deviceScaleFactor ?? 1,
    });
    await page.goto(`${baseUrl}${shot.route}`, {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });
    await page.screenshot({
      path: path.join(outDir, `${shot.name}.png`),
      fullPage: true,
    });
    await page.close();
    console.log(`saved ${shot.name}.png`);
  }
} finally {
  await browser.close();
}

console.log(`baseline -> ${outDir}`);
