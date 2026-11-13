#!/usr/bin/env node
// Browser rehearsal only: never sends a live investigation or external request.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const url = process.env.APP_URL || 'http://127.0.0.1:3010';
const output = path.resolve(process.env.EVIDENCE_DIR || '../hackathon-kit/evidence');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
const failures = [];
const results = [];
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const mobile = viewport.width < 980;
    const context = await browser.newContext({ viewport, acceptDownloads: true });
    const page = await context.newPage();
    page.on('pageerror', e => failures.push(e.message));
    await context.route('**/*', async route => {
      const req = route.request();
      if (new URL(req.url()).origin !== new URL(url).origin) {
        failures.push(`Unexpected external request: ${new URL(req.url()).origin}`);
        return route.abort();
      }
      if (new URL(req.url()).pathname === '/api/investigate' && !req.postData()?.includes('mode:replay')) {
        failures.push('Refused non-replay investigation');
        return route.abort();
      }
      await route.continue();
    });
    await page.goto(url);
    await page.getByRole('radio', { name: 'Replay', exact: true }).check();
    for (const [id, title] of [
      ['checkout-latency', 'Checkout p99 after payments-7f3c'],
      ['auth-5xx', 'Login 500s from identity-gateway'],
      ['queue-lag', 'order-events consumer lag'],
    ]) {
      await page.getByRole('button', { name: new RegExp(title) }).click();
      if (mobile) await page.getByRole('tab', { name: 'Score', exact: true }).click();
      const score = page.locator(mobile ? '.sidebarMobile .evalCard' : '.sidebarDesktop .evalCard');
      await score.getByText('6/6 checks', { exact: true }).waitFor({ timeout: 30000 });
      await page.getByText('Agent response finished.', { exact: true }).waitFor();
      assert(await page.locator('.replayBanner').isVisible(), 'Replay disclaimer missing');
      assert.equal(await page.locator('.verdictCard').count(), 1);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      assert.equal(overflow, false, `${id}: page overflow at ${viewport.width}`);
      if (!mobile) {
        const widths = await page.locator('.sidebarDesktop').evaluate(el => ({ width: el.clientWidth, parent: el.parentElement.clientWidth }));
        assert(widths.width <= widths.parent + 1, 'Sidebar clips evidence');
      }
      const downloaded = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export trace', exact: true }).click();
      const download = await downloaded;
      const target = path.join(output, `${id}-${mobile ? 'mobile' : 'desktop'}.json`);
      await download.saveAs(target);
      const trace = JSON.parse(await fs.readFile(target, 'utf8'));
      const run = trace.contextSnapshots.find(s => s.context_id === 'run');
      assert.equal(run?.data.mode, 'replay');
      assert(!trace.events.some(e => e.type === 'ERROR'), 'Replay emitted an error');
      assert(trace.events.some(e => e.type === 'STREAM_END'), 'Replay did not finish');
      if (!mobile) await page.screenshot({ path: path.join(output, `${id}.png`), fullPage: true });
      results.push({ incident: id, viewport: viewport.width, checks: '6/6', mode: 'replay', export: 'passed' });
      console.log(`PASS ${id}, ${viewport.width}px, 6/6, trace exported`);
    }
    await context.close();
  }
  assert.deepEqual(failures, []);
  await fs.writeFile(path.join(output, 'browser-verification.json'), JSON.stringify({ checkedAt: new Date().toISOString(), url, results, errors: failures }, null, 2));
} finally { await browser.close(); }
