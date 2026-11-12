/**
 * Mobile TOC - Layout check
 * Check the styling contract: size, placement, theme variables, scrolling, motion and print.
 *
 * @license MIT
 * @copyright 2026 Mickaël Canouil
 * @author Mickaël Canouil
 */

import { openPage, tap, finish } from "./lib.mjs";

const [, , htmlPath, fixture] = process.argv;
if (!htmlPath || !fixture) {
  console.error("Usage: node layout-check.mjs <html-file> <fixture-name>");
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

const pillBox = (page) => page.locator(".mobile-toc-pill").evaluate((el) => {
  const { left, right, top, bottom, width, height } = el.getBoundingClientRect();
  return { left, right, top, bottom, width, height, vw: innerWidth, vh: innerHeight };
});

const resolvedBodyBg = (page) =>
  page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = "var(--bs-body-bg)";
    document.body.append(probe);
    const colour = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return colour;
  });

const pillStyle = (page, property) =>
  page.locator(".mobile-toc-pill").evaluate((el, name) => getComputedStyle(el)[name], property);

const openSheet = async (page) => {
  await page.locator(".mobile-toc-pill").click();
  await page.locator(".mobile-toc-sheet[open]").waitFor();
  await frames(page, 20);
};

const assertions = {
  async page(page, collected) {
    const box = await pillBox(page);
    tap("pill is at least 44px tall", box.height >= 44, `height ${box.height}`);
    const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    tap(
      "pill sits in the bottom-right corner",
      Math.abs(box.vw - box.right) <= rem + 1 && Math.abs(box.vh - box.bottom) <= rem + 1,
      JSON.stringify(box),
    );
    tap("pill is visible without a page error", await page.locator(".mobile-toc-pill").isVisible() && collected.errors.length === 0, collected.errors.join("; "));

    const bodyBg = await resolvedBodyBg(page);
    const bg = await pillStyle(page, "backgroundColor");
    tap("pill background defaults to the body background", bg === bodyBg, `${bg} vs ${bodyBg}`);
    const upper = await pillStyle(page, "textTransform");
    tap("pill text is not upper-cased", upper === "none", upper);
    const shadow = await pillStyle(page, "boxShadow");
    tap("pill shadow defaults to the built-in shadow", shadow === "rgba(0, 0, 0, 0.15) 0px 2px 8px 0px", shadow);

    await page.emulateMedia({ reducedMotion: "reduce" });
    const duration = await page.locator(".mobile-toc-sheet").evaluate((el) => getComputedStyle(el).transitionDuration);
    tap("reduced motion removes the sheet transition", /^0s(, 0s)*$/.test(duration), duration);
    await page.emulateMedia({ reducedMotion: "no-preference" });

    await page.emulateMedia({ media: "print" });
    const displays = await page.evaluate(() =>
      [".mobile-toc-pill", ".mobile-toc-sheet"].map((s) => getComputedStyle(document.querySelector(s)).display),
    );
    tap("pill and sheet are hidden in print", displays.every((d) => d === "none"), displays.join(", "));
    await page.emulateMedia({ media: "screen" });
  },

  async long(page) {
    await openSheet(page);
    const metrics = await page.locator(".mobile-toc-sheet").evaluate((el) => ({
      height: el.getBoundingClientRect().height,
      vh: innerHeight,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    tap("sheet height is at most 70% of the viewport", metrics.height <= metrics.vh * 0.7 + 1, JSON.stringify(metrics));
    tap("sheet scrolls", metrics.scrollHeight > metrics.clientHeight, JSON.stringify(metrics));

    await page.locator(".mobile-toc-sheet").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await frames(page);
    const before = await page.evaluate(() => scrollY);
    const box = await page.locator(".mobile-toc-sheet").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 400);
    await frames(page, 10);
    const after = await page.evaluate(() => scrollY);
    tap("wheel at the sheet end does not scroll the page", before === after, `${before} -> ${after}`);

    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      const heading = document.querySelectorAll("main h2")[34];
      heading.scrollIntoView();
    });
    await page.waitForFunction(() => document.querySelector("nav#TOC a.active")?.getAttribute("href") === "#heading-35");
    await openSheet(page);
    const visible = await page.evaluate(() => {
      const sheet = document.querySelector(".mobile-toc-sheet");
      const link = sheet.querySelector("a.active");
      if (!link) return { found: false };
      const s = sheet.getBoundingClientRect();
      const l = link.getBoundingClientRect();
      return { found: true, inside: l.top >= s.top && l.bottom <= s.bottom, link: l.toJSON(), sheet: s.toJSON() };
    });
    tap("active link is inside the open sheet", visible.found && visible.inside, JSON.stringify(visible));
  },

  async custom(page) {
    const bg = await pillStyle(page, "backgroundColor");
    tap("pill background follows --mobile-toc-bg", bg === "rgb(1, 2, 3)", bg);
    const box = await pillBox(page);
    tap("pill right gap follows --mobile-toc-inset-inline", Math.abs(box.vw - box.right - 40) < 0.5, JSON.stringify(box));
    const shadow = await pillStyle(page, "boxShadow");
    tap("pill shadow follows --mobile-toc-shadow", shadow === "rgb(1, 2, 3) 1px 2px 3px 0px", shadow);
    await openSheet(page);
    const sheetShadow = await page.locator(".mobile-toc-sheet").evaluate((el) => getComputedStyle(el).boxShadow);
    tap("sheet shadow follows --mobile-toc-sheet-shadow", sheetShadow === "rgb(4, 5, 6) 0px -1px 2px 0px", sheetShadow);
    const backdrop = await page.locator(".mobile-toc-sheet").evaluate((el) => getComputedStyle(el, "::backdrop").backgroundColor);
    tap("backdrop follows --mobile-toc-backdrop", backdrop === "rgb(7, 8, 9)", backdrop);
  },

  async "dark-fallback"(page) {
    await page.evaluate(() => window.quartoToggleColorScheme());
    await frames(page, 5);
    await page.evaluate(() => scrollTo(0, document.querySelectorAll("main h2")[1].getBoundingClientRect().top + scrollY - 20));
    await frames(page, 20);
    await openSheet(page);
    const colours = await page.evaluate(() => {
      const link = document.querySelector("#mobile-toc-sheet a.active");
      const probe = document.createElement("canvas").getContext("2d");
      const rgb = (value) => {
        probe.clearRect(0, 0, 1, 1);
        probe.fillStyle = "#000";
        probe.fillStyle = value;
        probe.fillRect(0, 0, 1, 1);
        return [...probe.getImageData(0, 0, 1, 1).data.slice(0, 3)];
      };
      const style = getComputedStyle(link);
      return { found: !!link, text: rgb(style.color), background: rgb(style.backgroundColor), raw: [style.color, style.backgroundColor] };
    });
    const luminance = (channels) => {
      const [r, g, b] = channels.map((c) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [hi, lo] = [luminance(colours.text), luminance(colours.background)].sort((a, b) => b - a);
    const ratio = (hi + 0.05) / (lo + 0.05);
    tap("active link is found in the open sheet", colours.found);
    tap("active link text has 4.5:1 contrast without --bs-tertiary-bg", ratio >= 4.5, `${ratio.toFixed(2)} ${JSON.stringify(colours.raw)}`);
  },

  async dark(page) {
    const lightBg = await pillStyle(page, "backgroundColor");
    await page.evaluate(() => window.quartoToggleColorScheme());
    await frames(page, 5);
    const bodyBg = await resolvedBodyBg(page);
    const bg = await pillStyle(page, "backgroundColor");
    tap("pill background follows the toggled colour scheme", bg === bodyBg && bg !== lightBg, `${lightBg} -> ${bg} vs ${bodyBg}`);
  },
};

const run = assertions[fixture];
if (!run) {
  console.error(`Unknown fixture "${fixture}".`);
  process.exit(2);
}

const collected = { errors: [] };
const { page, close } = await openPage(htmlPath, {
  beforeLoad: (p) => p.on("pageerror", (error) => collected.errors.push(error.message)),
});
try {
  await run(page, collected);
} finally {
  await close();
}
finish();
