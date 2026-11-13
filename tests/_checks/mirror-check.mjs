/**
 * Mobile TOC - Mirror check
 * Check that the sheet follows the hidden table of contents.
 *
 * @license MIT
 * @copyright 2026 Mickaël Canouil
 * @author Mickaël Canouil
 */

import { openPage, tap, finish } from "./lib.mjs";

const [, , htmlPath, fixture] = process.argv;
if (!htmlPath || !fixture) {
  console.error("Usage: node mirror-check.mjs <html-file> <fixture-name>");
  process.exit(2);
}

const frames = (page, count) =>
  page.evaluate(
    (n) =>
      new Promise((done) => {
        const step = (left) => (left === 0 ? done() : requestAnimationFrame(() => step(left - 1)));
        step(n);
      }),
    count,
  );

const headingIds = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("#TOC a")].map((a) => a.getAttribute("href").slice(1)),
  );

const scrollTo = (page, id) =>
  page.evaluate((target) => {
    const el = document.getElementById(target);
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 10);
  }, id);

const activeHref = (page, selector) =>
  page.evaluate(
    (sel) => document.querySelector(`${sel} a.active`)?.getAttribute("href"),
    selector,
  );

const assertions = {
  async "toggle-clone"(page) {
    const state = await page.evaluate(() => ({
      clones: document.querySelectorAll("#quarto-toc-toggle nav#TOC").length,
      sheet: !!document.getElementById("mobile-toc-sheet"),
      clonePrecedes: !!(
        document.querySelector("#quarto-toc-toggle nav#TOC")?.compareDocumentPosition(
          document.querySelector("#quarto-margin-sidebar nav#TOC, #quarto-sidebar-toc-left nav#TOC"),
        ) & Node.DOCUMENT_POSITION_FOLLOWING
      ),
    }));
    tap("the toggle clone precedes the side table of contents", state.clones === 1 && state.clonePrecedes);
    tap("the sheet is built", state.sheet);

    await page.evaluate(() => {
      const link = document.querySelector("#quarto-margin-sidebar nav#TOC a, #quarto-sidebar-toc-left nav#TOC a");
      link.append(Object.assign(document.createElement("span"), { className: "probe", textContent: "x" }));
    });
    await frames(page, 3);
    const followed = await page.evaluate(() => !!document.querySelector("#mobile-toc-sheet .probe"));
    tap("the sheet follows the side table of contents", followed);
  },

  async deep(page) {
    const ids = await headingIds(page);

    await scrollTo(page, ids[2]);
    await page.waitForFunction(() => document.querySelector("#TOC a.active"));
    await frames(page, 3);
    const original = await activeHref(page, "#TOC");
    const mirrored = await activeHref(page, "#mobile-toc-sheet");
    tap("sheet link with the same href is active", !!original && original === mirrored, `${original} vs ${mirrored}`);

    const current = await page.evaluate(() => {
      const links = [...document.querySelectorAll("#mobile-toc-sheet a[aria-current]")];
      return { count: links.length, value: links[0]?.getAttribute("aria-current"), active: links[0]?.classList.contains("active") };
    });
    tap("exactly one sheet link has aria-current=location", current.count === 1 && current.value === "location" && current.active);

    await scrollTo(page, ids[ids.length - 3]);
    await frames(page, 3);
    const lists = await page.evaluate(() => {
      const key = (ul) => ul.querySelector("a")?.getAttribute("href");
      const original = new Map([...document.querySelectorAll("#TOC ul")].map((ul) => [key(ul), ul.className]));
      return [...document.querySelectorAll("#mobile-toc-sheet ul")].map((ul) => ({
        href: key(ul),
        sheet: ul.className,
        original: original.get(key(ul)),
      }));
    });
    tap(
      "every sheet list has the class of its original",
      lists.length > 0 && lists.every((l) => l.sheet === l.original),
      JSON.stringify(lists.filter((l) => l.sheet !== l.original)),
    );
    tap("a nested list was collapsed or shown", lists.some((l) => /collapse/.test(l.sheet)));

    await page.evaluate(() => {
      for (const a of document.querySelectorAll("#TOC a")) {
        const probe = document.createElement("span");
        probe.className = "probe";
        probe.textContent = "x";
        a.append(probe);
      }
      const links = document.querySelectorAll("#TOC a");
      links.forEach((a) => a.classList.remove("active"));
      links[links.length - 1].classList.add("active");
    });
    await frames(page, 3);
    const recloned = await page.evaluate(() => {
      const links = [...document.querySelectorAll("#mobile-toc-sheet a")];
      return {
        probes: links.every((a) => a.querySelector(".probe")),
        last: links[links.length - 1].getAttribute("aria-current") === "location",
        count: document.querySelectorAll("#mobile-toc-sheet a[aria-current]").length,
      };
    });
    tap("every sheet link gets the probe after a re-clone", recloned.probes);
    tap("last sheet link is current after a re-clone", recloned.last && recloned.count === 1);

    const hiddenHref = await page.evaluate(() => document.querySelector("#TOC li a").getAttribute("href"));
    for (const tag of ["li", "a"]) {
      for (const hide of [true, false]) {
        await page.evaluate(
          ([name, value]) => {
            document.querySelector(`#TOC li${name === "a" ? " a" : ""}`).hidden = value;
          },
          [tag, hide],
        );
        await frames(page, 3);
        const state = await page.evaluate(
          ([h, name]) => {
            const link = document.querySelector(`#mobile-toc-sheet a[href="${h}"]`);
            const el = name === "a" ? link : link.closest("li");
            return { hidden: el.hidden, display: getComputedStyle(el).display };
          },
          [hiddenHref, tag],
        );
        const word = hide ? "hidden" : "shown";
        tap(
          `sheet ${tag} is ${word} when its original is ${word}`,
          state.hidden === hide && (state.display === "none") === hide,
          JSON.stringify(state),
        );
      }
    }

    await page.evaluate(() => {
      window.__swaps = 0;
      new MutationObserver((records) => {
        for (const r of records) window.__swaps += [...r.addedNodes].filter((n) => n.nodeName === "UL").length;
      }).observe(document.querySelector("#mobile-toc-sheet > nav"), { childList: true });
      const first = document.querySelector("#TOC a");
      for (let i = 0; i < 50; i += 1) first.append(document.createElement("span"));
    });
    await frames(page, 2);
    const swaps = await page.evaluate(() => window.__swaps);
    tap("50 mutations replace the sheet list once", swaps === 1, `swaps: ${swaps}`);
  },
};

const pageOptions = {
  "toggle-clone": {
    beforeLoad(page) {
      return page.addInitScript(() => {
        document.addEventListener("DOMContentLoaded", () => {
          const toggle = document.createElement("div");
          toggle.id = "quarto-toc-toggle";
          toggle.append(document.querySelector("nav#TOC").cloneNode(true));
          document.body.prepend(toggle);
        });
      });
    },
  },
};

const { page, close } = await openPage(htmlPath, { width: 360, ...pageOptions[fixture] });
try {
  if (!assertions[fixture]) {
    console.error(`mirror-check: unknown fixture "${fixture}".`);
    process.exit(2);
  }
  await assertions[fixture](page);
} finally {
  await close();
}
finish();
