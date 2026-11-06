/**
 * Mobile TOC - Smoke check
 * Check that the filter injects its options block and that the pill shows at 375px.
 *
 * @license MIT
 * @copyright 2026 Mickaël Canouil
 * @author Mickaël Canouil
 */

import { openPage, tap, finish } from "./lib.mjs";

const [, , htmlPath, fixture] = process.argv;
if (!htmlPath || !fixture) {
  console.error("Usage: node smoke-check.mjs <html-file> <fixture-name>");
  process.exit(2);
}

const assertions = {
  async page(page) {
    const options = await page.locator("#mobile-toc-options").count();
    tap("options block exists", options === 1, `found ${options}`);

    const pill = page.locator(".mobile-toc-pill").first();
    const visible = (await pill.count()) > 0 && (await pill.isVisible());
    tap("pill is visible at 375px", visible);
  },
};

const run = assertions[fixture];
if (!run) {
  console.error(`Unknown fixture "${fixture}".`);
  process.exit(2);
}

const { page, close } = await openPage(htmlPath);
try {
  await run(page);
} finally {
  await close();
}
finish();
