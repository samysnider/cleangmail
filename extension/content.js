// Clean Gmail: the two things CSS can't do on its own.
//
// 1. Unread dot next to the "Non lus" heading. Reads the unread count Gmail
//    puts in the tab title ("Boîte de réception (3)") and shows it as an
//    orange dot plus number. Hidden when there's nothing unread.
//
// 2. Closing animation for the compose sheet. Gmail removes the compose
//    window instantly (close, send, ⌘Enter, discard), so when it disappears
//    we put a non-interactive copy in its place and let the CSS slide that
//    copy down while the blur fades out, then remove it.

const BADGE_CLASS = "cg-unread";
const GHOST_CLASS = "cg-ghost";
const COMPOSE_SELECTOR = '.Hd[role="dialog"]';

// ---------- Unread dot ----------

function unreadCount() {
  const match = document.title.match(/\((\d+)\)/);
  return match ? Number(match[1]) : 0;
}

// Same rule as the CSS: only the inbox with several sections ("Non lus" first)
function unreadHeading() {
  const sections = document.querySelectorAll('[role="main"] .ae4');
  if (sections.length < 2) return null;
  return sections[0].querySelector("h3.Wr");
}

function update() {
  const heading = unreadHeading();
  const count = unreadCount();
  let badge = heading?.querySelector(`.${BADGE_CLASS}`);

  // Remove stale badges, like one left in a heading Gmail no longer uses
  document.querySelectorAll(`.${BADGE_CLASS}`).forEach((el) => {
    if (el !== badge) el.remove();
  });

  if (!heading || count === 0) {
    badge?.remove();
    return;
  }

  if (!badge) {
    badge = document.createElement("span");
    badge.className = BADGE_CLASS;
    heading.append(badge);
  }

  if (badge.textContent !== String(count)) badge.textContent = count;
}

// ---------- Compose closing animation ----------

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function playClosingAnimation(removedDialog) {
  if (reducedMotion.matches) return;

  // The copy lives in its own ".dw" wrapper so the sheet styles still apply
  const ghost = document.createElement("div");
  ghost.className = `dw ${GHOST_CLASS}`;
  ghost.setAttribute("aria-hidden", "true");
  ghost.inert = true;

  const copy = removedDialog.cloneNode(true);
  copy.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
  copy.removeAttribute("id");
  ghost.append(copy);
  document.body.append(ghost);

  const remove = () => ghost.remove();
  copy.addEventListener("animationend", (event) => {
    if (event.target === copy) remove();
  });
  setTimeout(remove, 1000); // in case the animation never runs
}

function handleRemovals(records) {
  for (const record of records) {
    for (const node of record.removedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      if (node.classList.contains(GHOST_CLASS)) continue;
      const dialog = node.matches(COMPOSE_SELECTOR)
        ? node
        : node.querySelector(COMPOSE_SELECTOR);
      if (dialog) playClosingAnimation(dialog);
    }
  }
}

// ---------- Watching the page ----------

// Gmail rebuilds parts of the page often, so re-check the dot after changes,
// at most once per frame. Compose removals are handled right away, before
// the next paint, so the copy appears without a flicker.
let scheduled = false;
function scheduleUpdate() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    update();
  });
}

new MutationObserver((records) => {
  handleRemovals(records);
  scheduleUpdate();
}).observe(document.documentElement, {
  childList: true,
  subtree: true,
  characterData: true,
});

update();
