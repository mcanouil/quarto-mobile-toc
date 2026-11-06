/**
 * Mobile TOC - Overflow check
 * Check that the pill and back-to-top stay inside the visual viewport when the page overflows.
 *
 * @license MIT
 * @copyright 2026 Mickaël Canouil
 * @author Mickaël Canouil
 */

import { openPage, tap, finish } from "./lib.mjs";

const [, , htmlPath, fixture] = process.argv;
if (!htmlPath || !fixture) {
  console.error("Usage: node overflow-check.mjs <html-file> <fixture-name>");
  process.exit(2);
}

const frames = (page, count = 5) =>
  page.evaluate(
    (n) =>
      new Promise((done) => {
        const step = (left) => (left === 0 ? done() : requestAnimationFrame(() => step(left - 1)));
        step(n);
      }),
    count,
  );

const insideView = (page, selector) =>
  page.evaluate((sel) => {
    const r = document.querySelector(sel).getBoundingClientRect();
    const vv = window.visualViewport;
    const view = { left: vv.offsetLeft, top: vv.offsetTop, right: vv.offsetLeft + vv.width, bottom: vv.offsetTop + vv.height };
    const ok = r.left >= view.left - 1 && r.right <= view.right + 1 && r.top >= view.top - 1 && r.bottom <= view.bottom + 1;
    const round = (n) => Math.round(n);
    return {
      ok,
      detail: `${sel} x ${round(r.left)}-${round(r.right)} y ${round(r.top)}-${round(r.bottom)}; view x ${round(view.left)}-${round(view.right)} y ${round(view.top)}-${round(view.bottom)}; innerWidth ${innerWidth}`,
    };
  }, selector);

const showBackToTop = async (page, x) => {
  await page.evaluate((left) => scrollTo(left, document.documentElement.scrollHeight), x);
  await frames(page);
  await page.evaluate((left) => scrollTo(left, document.documentElement.scrollTop - 300), x);
  await page.waitForFunction(() => document.querySelector("#quarto-back-to-top")?.getBoundingClientRect().width > 0);
  await frames(page);
};

const viewportState = (page) =>
  page.evaluate(() => ({
    left: visualViewport.offsetLeft,
    top: visualViewport.offsetTop,
    scrollY,
  }));

const sheetInsideView = async (page, stage) => {
  const before = await viewportState(page);
  await page.evaluate(() => document.querySelector(".mobile-toc-pill").click());
  await page.locator(".mobile-toc-sheet:popover-open").waitFor();
  await frames(page, 20);
  const m = await page.evaluate(() => {
    const r = document.querySelector(".mobile-toc-sheet").getBoundingClientRect();
    const vv = window.visualViewport;
    return {
      left: r.left - vv.offsetLeft,
      right: r.right - (vv.offsetLeft + vv.width),
      bottom: r.bottom - (vv.offsetTop + vv.height),
    };
  });
  const after = await viewportState(page);
  tap(
    `open sheet fills the visual viewport width and sits on its bottom edge ${stage}`,
    Math.abs(m.left) <= 1 && Math.abs(m.right) <= 1 && Math.abs(m.bottom) <= 1,
    JSON.stringify(m),
  );
  tap(
    `opening the sheet does not pan or scroll the page ${stage}`,
    after.top === before.top && after.left === before.left && after.scrollY === before.scrollY,
    JSON.stringify({ before, after }),
  );
  await page.evaluate(() => document.querySelector(".mobile-toc-sheet").hidePopover());
  await frames(page, 5);
};

const pillAndBackToTop = async (page, stage, backToTop) => {
  await frames(page);
  const pill = await insideView(page, ".mobile-toc-pill");
  tap(`pill is inside the visual viewport ${stage}`, pill.ok, pill.detail);
  if (!backToTop) return;
  const top = await insideView(page, "#quarto-back-to-top");
  tap(`back-to-top is inside the visual viewport ${stage}`, top.ok, top.detail);
  const centre = await page.evaluate(() => {
    const r = document.querySelector("#quarto-back-to-top").getBoundingClientRect();
    const vv = window.visualViewport;
    return Math.abs(r.left + r.width / 2 - (vv.offsetLeft + vv.width / 2));
  });
  tap(`back-to-top is centred in the visual viewport ${stage}`, centre <= 2, `off by ${centre}`);
};

const guard = async (page, { scrollX, backToTop }) => {
  const wide = await page.evaluate(() => innerWidth > 1000);
  tap("the fixture widens the layout viewport", wide);

  await pillAndBackToTop(page, "at rest", false);
  await sheetInsideView(page, "at rest");

  await page.evaluate((left) => scrollTo(left, 400), scrollX);
  if (backToTop) await showBackToTop(page, scrollX);
  await pillAndBackToTop(page, "after scrolling", backToTop);
  await sheetInsideView(page, "after scrolling");

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1.5 });
  await frames(page, 10);
  await cdp.send("Input.synthesizeScrollGesture", {
    x: 100,
    y: 150,
    xDistance: -60,
    yDistance: -40,
    gestureSourceType: "touch",
  });
  await frames(page, 20);
  const panned = await viewportState(page);
  tap("visual viewport panned", panned.left > 0, JSON.stringify(panned));
  if (backToTop) await showBackToTop(page, scrollX);
  await pillAndBackToTop(page, "after zooming and panning", backToTop);
  await sheetInsideView(page, "after zooming and panning");
};

const assertions = {
  async overflow(page) {
    await guard(page, { scrollX: 600, backToTop: false });
  },
  async "overflow-rtl"(page) {
    await guard(page, { scrollX: -600, backToTop: false });
  },
  async "website-overflow"(page) {
    await guard(page, { scrollX: 600, backToTop: true });
  },
  async "overflow-long"(page) {
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForFunction(() => document.querySelector("nav#TOC a.active")?.getAttribute("href") === "#heading-40");
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1.5 });
    await frames(page, 10);
    await cdp.send("Input.synthesizeScrollGesture", { x: 100, y: 150, xDistance: -60, yDistance: -40, gestureSourceType: "touch" });
    await frames(page, 20);
    const panned = await viewportState(page);
    tap("visual viewport panned", panned.left > 0, JSON.stringify(panned));
    const before = await viewportState(page);
    await page.evaluate(() => document.querySelector(".mobile-toc-pill").click());
    await page.locator(".mobile-toc-sheet:popover-open").waitFor();
    await frames(page, 40);
    const after = await viewportState(page);
    tap(
      "opening the sheet does not pan or scroll the page with the active link far down the list",
      after.top === before.top && after.left === before.left && after.scrollY === before.scrollY,
      JSON.stringify({ before, after }),
    );
    const visible = await page.evaluate(() => {
      const sheet = document.querySelector(".mobile-toc-sheet");
      const link = sheet.querySelector("a.active");
      if (!link) return { found: false };
      const s = sheet.getBoundingClientRect();
      const l = link.getBoundingClientRect();
      return { found: true, inside: l.top >= s.top - 1 && l.bottom <= s.bottom + 1, scrollTop: sheet.scrollTop };
    });
    tap("active link is inside the open sheet", visible.found && visible.inside && visible.scrollTop > 0, JSON.stringify(visible));
  },

  async rtl(page) {
    await frames(page);
    const box = await page.locator(".mobile-toc-pill").evaluate((el) => {
      const { left, right, bottom } = el.getBoundingClientRect();
      return { left, right, bottom, vw: innerWidth, vh: innerHeight };
    });
    tap(
      "pill sits in the bottom-left corner",
      Math.abs(box.left - 16) <= 1 && Math.abs(box.vh - box.bottom - 16) <= 1 && box.right < box.vw / 2 + 100,
      JSON.stringify(box),
    );
  },
};

const run = assertions[fixture];
if (!run) {
  console.error(`Unknown fixture "${fixture}".`);
  process.exit(2);
}

// The long list keeps its slide-in transition, because the page panned while the sheet was still translated.
const reducedMotion = fixture === "overflow-long" ? "no-preference" : "reduce";
const { page, close } = await openPage(htmlPath, { reducedMotion });
try {
  await run(page);
} finally {
  await close();
}
finish();
