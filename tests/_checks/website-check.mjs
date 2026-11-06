/**
 * Mobile TOC - Website check
 * Check the pill against Quarto's back-to-top button and search overlay.
 *
 * @license MIT
 * @copyright 2026 Mickaël Canouil
 * @author Mickaël Canouil
 */

import { openPage, tap, finish } from "./lib.mjs";

const [, , htmlPath, fixture] = process.argv;
if (!htmlPath || !fixture) {
  console.error("Usage: node website-check.mjs <html-file> <fixture-name>");
  process.exit(2);
}

const frames = (page, count = 3) =>
  page.evaluate(
    (n) =>
      new Promise((done) => {
        const step = (left) => (left === 0 ? done() : requestAnimationFrame(() => step(left - 1)));
        step(n);
      }),
    count,
  );

const boxes = (page) =>
  page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
    return { pill: rect(".mobile-toc-pill"), top: rect("#quarto-back-to-top") };
  });

const intersect = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

const assertions = {
  async website(page) {
    await page.evaluate(() => scrollTo(0, 2000));
    await frames(page, 5);
    await page.evaluate(() => scrollTo(0, 1500));
    await page.waitForFunction(() => getComputedStyle(document.querySelector("#quarto-back-to-top")).display !== "none");
    await frames(page, 5);
    let { pill, top } = await boxes(page);
    const vh = await page.evaluate(() => innerHeight);
    tap("pill stays in the viewport while the page is scrolled", Math.abs(vh - pill.bottom - 16) <= 1, JSON.stringify(pill));
    tap("back-to-top does not overlap the pill", !intersect(pill, top), JSON.stringify({ pill, top }));
    tap("back-to-top sits above the pill", top.bottom <= pill.top, JSON.stringify({ pill, top }));

    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await frames(page, 5);
    ({ pill, top } = await boxes(page));
    tap("back-to-top does not overlap the pill at 200% text size", !intersect(pill, top), JSON.stringify({ pill, top }));
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });

    await page.evaluate(() => scrollTo(0, 0));
    const pillVisible = () => page.locator(".mobile-toc-pill").isVisible();
    tap("pill is visible while the sidebar is closed", await pillVisible());
    await page.locator('button[aria-label="Toggle sidebar navigation"]').click();
    await page.locator("#quarto-sidebar-glass.show").waitFor();
    await frames(page, 10);
    tap("pill is hidden while the sidebar is open", !(await pillVisible()));
    await page.locator("#quarto-sidebar-glass").click({ position: { x: 360, y: 300 } });
    await page.locator("#quarto-sidebar-glass.show").waitFor({ state: "detached" });
    await frames(page, 10);
    tap("pill is visible again once the sidebar is closed", await pillVisible());

    await page.locator(".aa-DetachedSearchButton").click();
    await page.locator(".aa-DetachedOverlay").waitFor();
    await frames(page, 10);
    const covered = await page.evaluate(() => {
      const rect = document.querySelector(".mobile-toc-pill").getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      const inViewport = rect.bottom <= innerHeight && rect.top >= 0;
      return { inViewport, inside: Boolean(hit?.closest(".mobile-toc-pill")), hit: hit?.className ?? null };
    });
    tap("search overlay covers the pill", covered.inViewport && !covered.inside, JSON.stringify(covered));
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
