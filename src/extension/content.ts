import { detect } from "../core/detectors";
import { formSelector, scanElements } from "../core/elements";
import { record } from "../core/model";
import { layerName } from "../core/parsers";
import { sanitize } from "../core/privacy";

let enabled = false,
  capturing = false,
  messages = false,
  layers = ["dataLayer"];
let globals: string[] = [];
let sessionId = "";
let generation = 0;
function resetEvents(id: string, next: number) {
  if (sessionId === id && next < generation) return false;
  sessionId = id;
  generation = next;
  batch = [];
  if (batchTimer) clearTimeout(batchTimer);
  batchTimer = undefined;
  return true;
}
let scanTimer: ReturnType<typeof setTimeout> | undefined;
let batchTimer: ReturnType<typeof setTimeout> | undefined;
let batch: unknown[] = [];
const ids = new WeakMap<Element, string>();
const elements = new Map<string, Element>();
let serial = 0;
const remember = (el: Element) => {
  let id = ids.get(el);
  if (!id) {
    id = `el-${++serial}`;
    ids.set(el, id);
  }
  elements.set(id, el);
  return id;
};
function send(data: unknown) {
  try {
    return chrome.runtime.sendMessage(data).catch(() => {
      cleanup();
    });
  } catch {
    cleanup();
    return Promise.resolve(undefined);
  }
}
function event(source: string, name: string, payload: unknown) {
  if (!capturing) return;
  if (batch.length >= 80) return;
  batch.push({
    id: crypto.randomUUID(),
    time: Date.now(),
    source,
    name: name.slice(0, 120),
    payload: sanitize(payload),
  });
  if (!batchTimer)
    batchTimer = setTimeout(() => {
      void send({ type: "OBSERVE", sessionId, generation, events: batch });
      batch = [];
      batchTimer = undefined;
    }, 200);
}
function scan() {
  if (!enabled) return;
  elements.clear();
  const inventory = scanElements(document, remember);
  const scripts = [...document.scripts].slice(0, 300);
  const evidence = detect({
    scripts: scripts.map((s) => s.src).filter(Boolean),
    inline: scripts
      .filter((s) => !s.src)
      .map((s) => (s.textContent || "").slice(0, 30000)),
    globals,
  });
  void send({ type: "SCAN", evidence, elements: inventory });
}
function schedule() {
  if (!scanTimer)
    scanTimer = setTimeout(() => {
      scanTimer = undefined;
      scan();
    }, 800);
}
const observer = new MutationObserver((records) => {
  if (!enabled) return;
  for (const m of records.slice(0, 100)) {
    const el = m.target instanceof Element ? m.target : m.target.parentElement;
    const phone = el?.closest('a[href^="tel:"]');
    if (
      phone &&
      ((m.type === "attributes" && m.attributeName === "href") ||
        m.type === "characterData" ||
        m.type === "childList")
    )
      event("dni", "Phone replacement observed", {
        element: remember(phone),
        reason: "Phone link changed; provider attribution unconfirmed",
      });
  }
  schedule();
});
function configure(c: Record<string, unknown>) {
  if (typeof c.sessionId === "string" && typeof c.generation === "number") {
    if (c.sessionId === sessionId && c.generation < generation) return;
    if (c.sessionId !== sessionId || c.generation !== generation)
      resetEvents(c.sessionId, c.generation);
  }
  enabled = c.enabled === true;
  capturing = c.active === true;
  messages = c.messages === true;
  if (Array.isArray(c.layers))
    layers = c.layers.filter((x): x is string => typeof x === "string");
  if (!capturing) {
    batch = [];
    if (batchTimer) clearTimeout(batchTimer);
    batchTimer = undefined;
  }
  window.dispatchEvent(
    new CustomEvent("tag-inspector:config:v1", {
      detail: JSON.stringify({ enabled, active: capturing, layers }),
    }),
  );
  observer.disconnect();
  if (enabled) {
    observer.observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
      characterDataOldValue: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ["href", "src", "class", "data-phone", "data-email"],
    });
    schedule();
  }
}
function bridge(e: Event) {
  if (
    !(e instanceof CustomEvent) ||
    typeof e.detail !== "string" ||
    e.detail.length > 20000
  )
    return;
  try {
    const d: unknown = JSON.parse(e.detail);
    if (!record(d)) return;
    if (d.kind === "globals" && Array.isArray(d.payload)) {
      globals = d.payload.filter((x): x is string => typeof x === "string");
      schedule();
    }
    if (d.kind === "layer" && record(d.payload))
      event("dataLayer", layerName(d.payload.raw), d.payload);
  } catch {
    /* Ignore malformed page data. */
  }
}
function message(e: MessageEvent) {
  if (messages)
    event("postMessage", "Incoming message", {
      direction: "incoming",
      origin: e.origin,
      raw:
        typeof e.data === "string"
          ? { type: "string message", count: e.data.length }
          : e.data,
    });
}
function form(e: Event) {
  const target = e.target;
  if (!(target instanceof Element)) return;
  const el = target.closest(formSelector);
  if (el)
    event(
      "form",
      e.type === "submit" ? "Native submit event" : "Validation failure",
      {
        form_id: el.id,
        element: remember(el),
        reason: "Observation does not confirm successful submission",
      },
    );
}
function click(e: Event) {
  const target = e.target;
  if (!(target instanceof Element)) return;
  const button = target.closest(
    'button[type="submit"],input[type="submit"],form button:not([type])',
  );
  const form = button?.closest("form");
  if (form)
    event("form", "Submit attempt", {
      form_id: form.id,
      element: remember(form),
    });
}
function cleanup() {
  observer.disconnect();
  if (scanTimer) clearTimeout(scanTimer);
  if (batchTimer) clearTimeout(batchTimer);
  window.removeEventListener("tag-inspector:data:v1", bridge);
  window.removeEventListener("message", message);
  document.removeEventListener("submit", form, true);
  document.removeEventListener("invalid", form, true);
  document.removeEventListener("click", click, true);
  window.dispatchEvent(
    new CustomEvent("tag-inspector:config:v1", {
      detail: JSON.stringify({ active: false, layers: [] }),
    }),
  );
}
window.addEventListener("tag-inspector:data:v1", bridge);
window.addEventListener("message", message);
document.addEventListener("submit", form, true);
document.addEventListener("invalid", form, true);
document.addEventListener("click", click, true);
window.addEventListener("pagehide", cleanup);
chrome.runtime.onMessage.addListener((msg: unknown, _sender, reply) => {
  if (!record(msg)) return;
  if (msg.type === "CONFIG") {
    configure(msg);
    reply({ ok: true });
  }
  if (
    msg.type === "RESET_EVENTS" &&
    typeof msg.sessionId === "string" &&
    typeof msg.generation === "number"
  ) {
    resetEvents(msg.sessionId, msg.generation);
    reply({ ok: true });
  }
  if (msg.type === "DISCARD") {
    batch = [];
    reply({ ok: true });
  }
  if (msg.type === "RESCAN") {
    scan();
    reply({ ok: true });
  }
  if (msg.type === "LOCATE" && typeof msg.id === "string") {
    const el = elements.get(msg.id);
    if (el instanceof HTMLElement && el.isConnected) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.animate(
        [
          { outline: "3px solid #238566", outlineOffset: "4px" },
          { outline: "3px solid transparent", outlineOffset: "4px" },
        ],
        { duration: 1800 },
      );
      reply({ ok: true });
    } else
      reply({
        ok: false,
        error: "Element is no longer present. Rescan the page.",
      });
  }
});
void send({ type: "HELLO" }).then((c) => {
  if (record(c)) configure(c);
});
window.addEventListener("pageshow", (e) => {
  if (e.persisted) {
    window.addEventListener("tag-inspector:data:v1", bridge);
    window.addEventListener("message", message);
    document.addEventListener("submit", form, true);
    document.addEventListener("invalid", form, true);
    document.addEventListener("click", click, true);
    void send({ type: "HELLO" }).then((c) => {
      if (record(c)) configure(c);
    });
  }
});
