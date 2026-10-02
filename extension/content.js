// Gmail Zen: the things CSS can't do on its own.
//
// 1. Unread dot next to the "Non lus" heading. Reads the unread count Gmail
//    puts in the tab title ("Boîte de réception (3)") and shows it as an
//    orange dot plus number. Hidden when there's nothing unread.
//
// 2. New arrivals in "Non lus": when a message lands, the other emails blur
//    so it stands alone, and the edges of the inbox glow for a moment.
//
// 3. Closing animation for the compose sheet. Gmail removes the compose
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

// ---------- New arrivals ----------

// Attributes rather than classes: Gmail rewrites a row's class list while it
// draws a new email, which would drop our marker
const ARRIVED_ATTR = "data-cg-arrived";
const FOCUS_MS = 3000; // other emails blurred until the edge light starts fading
const SHINE_MS = 7000; // matches the cg-shine animation in clean.css
const SHINE_CLASS = "cg-shine";
const SHINE_ATTR = "data-cg-shining";
const ARRIVING_ATTR = "data-cg-arriving"; // on <html>: blurs the other rows
let shineTimer;
let focusTimer;
let pointerStart = null;

// Messages already shown in the inbox, and those already shown as unread.
// A row counts as an arrival when its latest message shows up as unread for
// the first time and is either new to the inbox or just sent (an email to
// yourself shows up read for a moment first). So Gmail redrawing the list, or
// you marking an older email as unread, doesn't count as an arrival.
const seenMessages = new Set();
const seenUnread = new Set();
const ARRIVAL_MINUTES = 2;
let baselineTaken = false;

function lastMessageId(row) {
  return row
    .querySelector("[data-legacy-last-message-id]")
    ?.getAttribute("data-legacy-last-message-id");
}

// Gmail shows today's emails as a time ("08:45" or "8:45 AM")
function minutesAgo(text) {
  const match = text
    .replace(/[\u00a0\u202f]/g, " ")
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?:\s*([ap])\.?\s*m\.?)?$/i);
  if (!match) return null;

  let hours = Number(match[1]) % (match[3] ? 12 : 24);
  if (match[3]?.toLowerCase() === "p") hours += 12;
  const sent = new Date();
  sent.setHours(hours, Number(match[2]), 0, 0);
  return (Date.now() - sent) / 60000;
}

// The shine lives in its own element, created the first time it's needed
function shine() {
  let layer = document.querySelector(`.${SHINE_CLASS}`);
  if (!layer) {
    layer = document.createElement("div");
    layer.className = SHINE_CLASS;
    layer.setAttribute("aria-hidden", "true");
    document.body.prepend(layer);
  }
  // Already lit: let it play out rather than restart it, which would flash
  if (layer.hasAttribute(SHINE_ATTR)) return;
  layer.setAttribute(SHINE_ATTR, "");
  clearTimeout(shineTimer);
  shineTimer = setTimeout(() => layer.removeAttribute(SHINE_ATTR), SHINE_MS);
}

// The other emails blur while the new one stays sharp, until the edge light
// starts fading, or sooner as soon as you move, scroll, click or type:
// the moment gives way to whatever you were doing
function isFocusing() {
  return document.documentElement.hasAttribute(ARRIVING_ATTR);
}

function startFocus() {
  document.documentElement.setAttribute(ARRIVING_ATTR, "");
  pointerStart = null;
  clearTimeout(focusTimer);
  focusTimer = setTimeout(endFocus, FOCUS_MS);
}

function endFocus() {
  clearTimeout(focusTimer);
  document.documentElement.removeAttribute(ARRIVING_ATTR);
  document
    .querySelectorAll(`[${ARRIVED_ATTR}]`)
    .forEach((row) => row.removeAttribute(ARRIVED_ATTR));
}

// Small pointer jitters don't count, only a real move (over 24px)
document.addEventListener(
  "pointermove",
  (event) => {
    if (!isFocusing()) return;
    if (!pointerStart) {
      pointerStart = { x: event.clientX, y: event.clientY };
      return;
    }
    const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    if (moved > 24) endFocus();
  },
  { passive: true }
);

for (const type of ["wheel", "pointerdown", "keydown"]) {
  document.addEventListener(
    type,
    () => {
      if (isFocusing()) endFocus();
    },
    { passive: true, capture: true }
  );
}

function updateArrivals() {
  const sections = document.querySelectorAll('[role="main"] .ae4');
  // Only while the inbox is on screen, so what arrives while you're reading
  // an email or on another tab plays when you come back
  if (sections.length < 2 || !sections[0].getClientRects().length) return;
  if (document.hidden) return;

  // Only the inbox's own rows: Gmail keeps other lists (like Sent) hidden in
  // the page, and an email to yourself lands there first
  const rows = [...sections].flatMap((section) => [...section.querySelectorAll("tr.zA")]);
  const unread = sections[0].querySelectorAll("tr.zA.zE");

  let arrived = false;
  unread.forEach((row) => {
    const id = lastMessageId(row);
    if (!id || seenUnread.has(id)) return;
    seenUnread.add(id);
    if (!baselineTaken) return;

    const minutes = minutesAgo(row.querySelector("td.xW")?.textContent ?? "");
    const justSent = minutes !== null && minutes < ARRIVAL_MINUTES;
    if (seenMessages.has(id) && !justSent) return;

    row.setAttribute(ARRIVED_ATTR, "");
    arrived = true;
  });
  if (arrived) {
    shine();
    startFocus();
  }
  rows.forEach((row) => {
    const id = lastMessageId(row);
    if (id) seenMessages.add(id);
  });
  if (rows.length) baselineTaken = true;
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

// Gmail rebuilds parts of the page often, so re-check the dot and the
// arrivals after changes, at most once per frame. Compose removals are handled right away, before
// the next paint, so the copy appears without a flicker.
let scheduled = false;
function scheduleUpdate() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    update();
    updateArrivals();
  });
}

document.addEventListener("visibilitychange", scheduleUpdate);

new MutationObserver((records) => {
  handleRemovals(records);
  scheduleUpdate();
}).observe(document.documentElement, {
  childList: true,
  subtree: true,
  characterData: true,
});

update();
updateArrivals();
