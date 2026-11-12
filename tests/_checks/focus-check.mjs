/**
 * Mobile TOC - Focus check
 * Check keyboard operation, focus return and link activation of the sheet.
 *
 * @license MIT
 * @copyright 2026 Mickaël Canouil
 * @author Mickaël Canouil
 */

import { openPage, tap, finish } from "./lib.mjs";

const [, , htmlPath, fixture] = process.argv;
if (!htmlPath || !fixture) {
  console.error("Usage: node focus-check.mjs <html-file> <fixture-name>");
  process.exit(2);
}

const pillName = "Table of contents";

const frames = (page, count) =>
  page.evaluate(
    (n) =>
      new Promise((done) => {
        const step = (left) => (left === 0 ? done() : requestAnimationFrame(() => step(left - 1)));
        step(n);
      }),
    count,
  );

const isOpen = (page) => page.evaluate(() => document.getElementById("mobile-toc-sheet").matches("[open]"));
const focusIn = (page, selector) =>
  page.evaluate((sel) => !!document.activeElement?.closest(sel), selector);
const focusOnPill = (page) => page.evaluate(() => document.activeElement?.classList.contains("mobile-toc-pill"));
const pillNode = async (page) => {
  const session = await page.context().newCDPSession(page);
  const { nodes } = await session.send("Accessibility.getFullAXTree");
  await session.detach();
  return nodes.find((node) => !node.ignored && node.role?.value === "button" && node.name?.value === pillName);
};
const pillCollapsed = async (page) =>
  (await pillNode(page))?.properties.find((p) => p.name === "expanded")?.value.value === false;

const pillAttribute = (page) => page.locator(".mobile-toc-pill").getAttribute("aria-expanded");
const focusOnStartLink = (page) =>
  page.evaluate(() => {
    const sheet = document.getElementById("mobile-toc-sheet");
    const expected = sheet.querySelector("a[aria-current]") || sheet.querySelector("a");
    return !!expected && document.activeElement === expected;
  });

const openWithKeyboard = async (page) => {
  await page.locator(".mobile-toc-pill").focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.getElementById("mobile-toc-sheet").matches("[open]"));
};

const tabUntil = async (page, predicate, arg, limit = 12) => {
  for (let i = 0; i < limit; i += 1) {
    await page.keyboard.press("Tab");
    if (await page.evaluate(predicate, arg)) return true;
  }
  return false;
};

const tabToThirdLink = async (page) => {
  await tabUntil(page, () => document.activeElement?.classList.contains("mobile-toc-close"));
  for (let i = 0; i < 3; i += 1) await page.keyboard.press("Tab");
};

const assertions = {
  async focus(page) {
    const visited = [];
    for (let i = 0; i < 6 && !(await focusOnPill(page)); i += 1) {
      await page.keyboard.press("Tab");
      visited.push(await page.evaluate(() => (document.activeElement?.closest("main") ? "main" : "other")));
    }
    tap(
      "Tab reaches the pill before any link in the page content",
      (await focusOnPill(page)) && !visited.includes("main"),
      visited.join(", "),
    );
    const beforeMain = await page.evaluate(() => {
      const main = document.querySelector("#quarto-content > main") ?? document.querySelector("main");
      const pill = document.querySelector(".mobile-toc-pill");
      return !!main && !!(pill.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    tap("the pill comes before main in the document", beforeMain);
    await openWithKeyboard(page);
    tap("sheet is open after Enter on the pill", await isOpen(page));
    tap("pill is out of the accessibility tree while the modal sheet is open", !(await pillNode(page)));
    tap("pill aria-expanded is true while the sheet is open", (await pillAttribute(page)) === "true");
    tap("opening moves focus to the current link, else the first link", await focusOnStartLink(page));

    let escaped = false;
    for (let i = 0; i < 20; i += 1) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(() => {
        const active = document.activeElement;
        return !active || active === document.body || !!active.closest("#mobile-toc-sheet");
      });
      if (!inside) escaped = true;
    }
    tap("Tab stays inside the open sheet", !escaped);
    tap("Tab moves focus into the sheet", await focusIn(page, "#mobile-toc-sheet"));

    await page.keyboard.press("Escape");
    await frames(page, 2);
    tap("Escape closes the sheet", !(await isOpen(page)));
    tap("Escape returns focus to the pill", await focusOnPill(page));
    tap("pill is collapsed in the accessibility tree", await pillCollapsed(page));
    tap("pill aria-expanded is false once the sheet is closed", (await pillAttribute(page)) === "false");

    await openWithKeyboard(page);
    const box = await page.locator("#mobile-toc-sheet").boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height - 2);
    tap("click on the sheet padding keeps the sheet open", await isOpen(page));
    await page.mouse.click(box.x + box.width / 2, Math.max(1, box.y / 2));
    tap("click on the backdrop closes the sheet", !(await isOpen(page)));
    tap("pill aria-expanded is false after a backdrop click", (await pillAttribute(page)) === "false");

    await openWithKeyboard(page);
    const reached = await tabUntil(page, () => document.activeElement?.classList.contains("mobile-toc-close"));
    tap("Tab reaches the close button", reached);
    await page.keyboard.press("Enter");
    tap("Enter on the close button closes the sheet", !(await isOpen(page)));
    tap("close button returns focus to the pill", await focusOnPill(page));

    await page.evaluate(() => window.scrollTo(0, 0));
    await openWithKeyboard(page);
    await tabToThirdLink(page);
    const target = await page.evaluate(() => document.activeElement.hash);
    const belowFold = await page.evaluate(
      (hash) => document.querySelector(hash).getBoundingClientRect().top > window.innerHeight,
      target,
    );
    tap("link target is below the fold before activation", belowFold);
    await page.keyboard.press("Enter");
    await frames(page, 3);
    const landed = await page.evaluate(() => ({
      open: document.getElementById("mobile-toc-sheet").matches("[open]"),
      hash: location.hash,
      tag: document.activeElement?.tagName,
      sectionId: document.activeElement?.closest("section")?.id,
    }));
    tap("Enter on a link closes the sheet", !landed.open);
    tap("location.hash is the link target", landed.hash === target, `${landed.hash} vs ${target}`);
    tap(
      "focus is on the target heading, not its section",
      /^H[1-6]$/.test(landed.tag) && `#${landed.sectionId}` === target,
      `${landed.tag} in ${landed.sectionId}`,
    );
    await page.evaluate(() => {
      window.focusedHeading = document.activeElement;
    });
    await page.keyboard.press("Tab");
    const follows = await page.evaluate((hash) => {
      const heading = window.focusedHeading;
      const active = document.activeElement;
      return {
        after: !!(heading.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_FOLLOWING),
        pill: active.classList.contains("mobile-toc-pill"),
      };
    }, target);
    tap("heading loses the added tabindex after blur", !(await page.evaluate(() => window.focusedHeading.hasAttribute("tabindex"))));
    tap("Tab after the heading reaches a later element, not the pill", follows.after && !follows.pill);

    await page.evaluate(() => window.scrollTo(0, 0));
    await openWithKeyboard(page);
    await tabToThirdLink(page);
    const sameHref = await page.evaluate(() => document.activeElement.getAttribute("href"));
    await page.evaluate(() => {
      document.querySelectorAll("#TOC a").forEach((a) => a.append(document.createElement("span")));
    });
    await frames(page, 2);
    const kept = await page.evaluate(() => {
      const active = document.activeElement;
      return { inSheet: !!active?.closest("#mobile-toc-sheet"), href: active?.getAttribute?.("href") };
    });
    tap(
      "re-clone keeps focus on the sheet link with the same href",
      kept.inSheet && kept.href === sameHref,
      `${kept.inSheet} ${kept.href} vs ${sameHref}`,
    );
    await page.keyboard.press("Escape");

    for (const href of ["#does-not-exist", "#%E0%A4%A"]) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await openWithKeyboard(page);
      await page.evaluate((h) => {
        const link = document.createElement("a");
        link.id = "probe-link";
        link.href = h;
        link.textContent = "probe";
        document.querySelector("#mobile-toc-sheet").append(link);
        link.focus();
      }, href);
      await page.keyboard.press("Enter");
      await frames(page, 3);
      const missing = await page.evaluate(() => ({
        open: document.getElementById("mobile-toc-sheet").matches("[open]"),
        tag: document.activeElement?.tagName,
      }));
      tap(`link to ${href} closes the sheet`, !missing.open);
      tap(`link to ${href} leaves focus off any heading`, !/^H[1-6]$/.test(missing.tag), missing.tag);
      await page.evaluate(() => document.getElementById("probe-link")?.remove());
    }
    tap("no page error was raised", errors.length === 0, errors.join("; "));

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator(".mobile-toc-pill").tap();
    await page.waitForFunction(() => document.getElementById("mobile-toc-sheet").matches("[open]"));
    const touchHref = await page.locator("#mobile-toc-sheet a:visible").nth(2).evaluate((a) => a.hash);
    await page.locator("#mobile-toc-sheet a:visible").nth(2).tap();
    await frames(page, 5);
    const touched = await page.evaluate((hash) => {
      const rect = document.querySelector(hash).getBoundingClientRect();
      return {
        open: document.getElementById("mobile-toc-sheet").matches("[open]"),
        visible: rect.top >= 0 && rect.top < window.innerHeight,
      };
    }, touchHref);
    tap("tapping a link closes the sheet", !touched.open);
    tap("tapping a link brings the heading into view", touched.visible);
  },
};

const errors = [];
const { page, close } = await openPage(htmlPath, {
  beforeLoad: (target) => target.on("pageerror", (error) => errors.push(error.message)),
});
try {
  await assertions[fixture](page);
} finally {
  await close();
}
finish();
