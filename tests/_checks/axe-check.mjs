/**
 * Mobile TOC - Accessibility check
 * Scan the pill and the sheet with axe-core, with the sheet closed and open.
 * The scan is scoped to the extension's own elements, so a finding elsewhere on the page does not count.
 *
 * @license MIT
 * @copyright 2026 Mickaël Canouil
 * @author Mickaël Canouil
 */

import AxeBuilder from "@axe-core/playwright";
import { openPage, tap, finish } from "./lib.mjs";

const [, , htmlPath, fixture] = process.argv;
if (!htmlPath || !fixture) {
  console.error("Usage: node axe-check.mjs <html-file> <fixture-name>");
  process.exit(2);
}

const SCOPE = ".mobile-toc-pill, #mobile-toc-sheet";

const frames = (page, count = 3) =>
  page.evaluate(
    (n) =>
      new Promise((done) => {
        const step = (left) => (left === 0 ? done() : requestAnimationFrame(() => step(left - 1)));
        step(n);
      }),
    count,
  );

const scan = async (page, name, { requireNodes = false } = {}) => {
  const { violations, passes } = await new AxeBuilder({ page }).include(SCOPE).analyze();
  const contrast = [...violations, ...passes].filter((r) => r.id === "color-contrast");
  const checked = contrast.reduce((total, r) => total + r.nodes.length, 0);
  if (requireNodes) {
    tap(`axe scans nodes for colour contrast, ${name}`, checked > 0, `${checked} nodes`);
  }
  console.log(`# ${name}: color-contrast nodes ${checked}, violations ${violations.length}`);
  const detail = violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`).join("; ");
  tap(`axe finds no violation, ${name}`, violations.length === 0, detail);
};

const run = async (page) => {
  await page.locator(".mobile-toc-pill").waitFor();
  await scan(page, "sheet closed");
  await page.locator(".mobile-toc-pill").click();
  await page.waitForFunction(() => document.querySelector("#mobile-toc-sheet")?.matches("[open]"));
  await frames(page, 15);
  await scan(page, "sheet open", { requireNodes: true });
};

const toggleDark = async (page) => {
  await page.evaluate(() => window.quartoToggleColorScheme());
  await frames(page, 5);
};

const setups = {
  dark: toggleDark,
  "dark-fallback": toggleDark,
};

const { page, close } = await openPage(htmlPath);
try {
  await setups[fixture]?.(page);
  await run(page);
} finally {
  await close();
}
finish();
