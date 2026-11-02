import { classify } from "../core/detectors";
import {
  defaults,
  type Observation,
  record,
  type Session,
  type Settings,
} from "../core/model";
import { parseRequest } from "../core/parsers";
import { cleanText, safeUrl, sanitize } from "../core/privacy";
import { isElement, isEvidence } from "../core/protocol";
import { acceptsBatch, append, clearEvents, newSession } from "../core/session";

let queue = Promise.resolve();
function serial(work: () => Promise<void>) {
  queue = queue.then(work).catch((e) => console.error("Tag Inspector", e));
}
const key = (tab: number) => `tab:${tab}`;
async function settings(): Promise<Settings> {
  const v = await chrome.storage.local.get<{ settings?: Settings }>("settings");
  return { ...defaults, ...v.settings };
}
async function get(tab: number): Promise<Session | undefined> {
  return (await chrome.storage.session.get<Record<string, Session>>(key(tab)))[
    key(tab)
  ];
}
async function save(s: Session) {
  // Bound inventories as well as streams, including pages with many frames.
  const frameKeys = Object.keys(s.frames);
  for (const id of frameKeys.slice(24)) delete s.frames[id];
  while (JSON.stringify(s).length > 350000) {
    if (s.events.length || s.requests.length) {
      s.events.shift();
      s.requests.shift();
      s.dropped++;
      continue;
    }
    const frame = Object.values(s.frames).find(
      (f) => f.elements.length > 0 || f.evidence.length > 0,
    );
    if (!frame) break;
    frame.elements.pop();
    frame.evidence.pop();
    s.dropped++;
  }
  await chrome.storage.session.set({ [key(s.tab)]: s });
  const all = await chrome.storage.session.get<Record<string, Session>>(null);
  const sessions = Object.entries(all)
    .filter(([k]) => k.startsWith("tab:"))
    .sort((a, b) => a[1].started - b[1].started);
  if (sessions.length > 12)
    await chrome.storage.session.remove(
      sessions.slice(0, sessions.length - 12).map(([k]) => k),
    );
}
function config(s: Session | undefined, p: Settings) {
  return {
    type: "CONFIG",
    sessionId: s?.id,
    generation: s?.captureGeneration ?? 0,
    enabled: !!s,
    active: s?.capturing === true,
    messages: p.messages,
    layers: p.layers,
  };
}
async function notify(s: Session, p: Settings) {
  try {
    await chrome.tabs.sendMessage(s.tab, config(s, p));
  } catch {
    /* Existing pages require reload after installation. */
  }
}
function isPanel(sender: chrome.runtime.MessageSender) {
  return (
    sender.id === chrome.runtime.id &&
    sender.url === chrome.runtime.getURL("index.html")
  );
}
chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});
chrome.runtime.onStartup.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});
chrome.runtime.onMessage.addListener((message: unknown, sender, reply) => {
  if (!record(message) || typeof message.type !== "string") return;
  serial(async () => {
    try {
      const p = await settings();
      if (sender.tab?.id !== undefined && !isPanel(sender)) {
        const tab = sender.tab.id;
        const s = await get(tab);
        if (message.type === "HELLO") {
          if (s) {
            s.frames[String(sender.frameId || 0)] = {
              document: sender.documentId || "",
              origin: safeUrl(sender.url || ""),
              evidence: [],
              elements: [],
            };
            await save(s);
          }
          reply(config(s, p));
          return;
        }
        if (!s) return reply({ ok: false });
        const f = s.frames[String(sender.frameId || 0)];
        if (!f || f.document !== (sender.documentId || ""))
          return reply({ ok: false });
        if (
          message.type === "SCAN" &&
          Array.isArray(message.evidence) &&
          Array.isArray(message.elements) &&
          JSON.stringify(message).length < 180000
        ) {
          f.evidence = message.evidence.filter(isEvidence).slice(0, 150);
          f.elements = message.elements
            .filter(isElement)
            .slice(0, 400)
            .map((e) => ({ ...e, frame: sender.frameId || 0 }));
          await save(s);
        }
        if (
          message.type === "OBSERVE" &&
          acceptsBatch(s, message.sessionId, message.generation) &&
          Array.isArray(message.events) &&
          message.events.length <= 80 &&
          JSON.stringify(message).length < 500000
        ) {
          for (const e of message.events) {
            if (
              !record(e) ||
              typeof e.id !== "string" ||
              typeof e.name !== "string" ||
              !["dataLayer", "postMessage", "form", "dni"].includes(
                String(e.source),
              )
            )
              continue;
            append(
              s,
              {
                id: e.id.slice(0, 80),
                time: Date.now(),
                name: cleanText(e.name.slice(0, 120)),
                source: String(e.source),
                platform: e.source === "dataLayer" ? "gtm" : "page",
                payload: sanitize(e.payload),
                frame: sender.frameId || 0,
                origin: f.origin,
                navigation: s.navigation,
              },
              p.limit,
            );
          }
          await save(s);
        }
        reply({ ok: true });
        return;
      }
      if (!isPanel(sender))
        return reply({ ok: false, error: "Untrusted sender" });
      if (message.type === "SETTINGS" && record(message.settings)) {
        const v = message.settings;
        const next: Settings = {
          theme: v.theme === "dark" || v.theme === "light" ? v.theme : "system",
          limit: [100, 300, 600].includes(Number(v.limit))
            ? Number(v.limit)
            : 300,
          automatic: v.automatic === true,
          messages: v.messages === true,
          layers: Array.isArray(v.layers)
            ? v.layers
                .filter(
                  (x): x is string =>
                    typeof x === "string" && /^[A-Za-z_$][\w$]{0,50}$/.test(x),
                )
                .slice(0, 5)
            : ["dataLayer"],
        };
        await chrome.storage.local.set({ settings: next });
        const all =
          await chrome.storage.session.get<Record<string, Session>>(null);
        for (const s of Object.values(all) as Session[]) await notify(s, next);
        reply({ ok: true });
        return;
      }
      if (message.type === "CLEAR_ALL") {
        const all =
          await chrome.storage.session.get<Record<string, Session>>(null);
        await chrome.storage.session.clear();
        for (const old of Object.values(all)) {
          const cleared = newSession(old.tab, old.url, false);
          cleared.frames = Object.fromEntries(
            Object.entries(old.frames).map(([id, f]) => [
              id,
              { ...f, evidence: [], elements: [] },
            ]),
          );
          await save(cleared);
        }
        for (const s of Object.values(all) as Session[])
          try {
            await chrome.tabs.sendMessage(s.tab, config(undefined, p));
          } catch {
            /* Tab closed. */
          }
        reply({ ok: true });
        return;
      }
      if (typeof message.tab !== "number") return reply({ ok: false });
      const tab = await chrome.tabs.get(message.tab);
      if (!tab.url || !/^https?:/.test(tab.url))
        return reply({
          ok: false,
          error:
            "This page cannot be inspected. Open an HTTP or HTTPS website.",
        });
      let s = await get(message.tab);
      if (!s) {
        s = newSession(message.tab, safeUrl(tab.url), p.automatic);
        await save(s);
        try {
          const frames = await chrome.webNavigation.getAllFrames({
            tabId: s.tab,
          });
          for (const frame of frames || [])
            s.frames[String(frame.frameId)] = {
              document: frame.documentId,
              origin: safeUrl(frame.url),
              evidence: [],
              elements: [],
            };
          await save(s);
          await notify(s, p);
        } catch {
          /* Reload initializes content scripts. */
        }
      }
      if (message.type === "CAPTURE") {
        s.capturing = message.active === true;
        await save(s);
        await notify(s, p);
      }
      if (message.type === "CLEAR" || message.type === "CLEAR_EVENTS") {
        clearEvents(s);
        if (message.type === "CLEAR") {
          s.requests = [];
          s.dropped = 0;
        }
        await save(s);
        try {
          await chrome.tabs.sendMessage(s.tab, {
            type: "RESET_EVENTS",
            sessionId: s.id,
            generation: s.captureGeneration,
          });
        } catch {
          /* Frames may be unavailable; old batches remain invalid. */
        }
      }
      if (message.type === "RESCAN")
        try {
          await chrome.tabs.sendMessage(s.tab, { type: "RESCAN" });
        } catch {
          return reply({
            ok: false,
            error:
              "Reload the website to activate content scripts, and check extension site access.",
          });
        }
      if (
        message.type === "LOCATE" &&
        typeof message.id === "string" &&
        typeof message.frame === "number"
      ) {
        try {
          reply(
            await chrome.tabs.sendMessage(
              s.tab,
              { type: "LOCATE", id: message.id },
              { frameId: message.frame },
            ),
          );
        } catch {
          reply({
            ok: false,
            error: "Frame unavailable. Rescan or reload the website.",
          });
        }
        return;
      }
      reply({ ok: true, session: s, settings: p });
    } catch (e) {
      reply({
        ok: false,
        error: e instanceof Error ? e.message : "Inspection failed",
      });
    }
  });
  return true;
});
chrome.tabs.onRemoved.addListener((tab) =>
  serial(async () => {
    await chrome.storage.session.remove(key(tab));
  }),
);
chrome.webNavigation.onCommitted.addListener((d) =>
  serial(async () => {
    let s = await get(d.tabId);
    if (!s) return;
    if (d.frameId === 0) s = newSession(d.tabId, safeUrl(d.url), s.capturing);
    s.frames[String(d.frameId)] = {
      document: d.documentId,
      origin: safeUrl(d.url),
      evidence: [],
      elements: [],
    };
    await save(s);
  }),
);
chrome.webNavigation.onHistoryStateUpdated.addListener((d) =>
  serial(async () => {
    const s = await get(d.tabId);
    if (!s) return;
    if (d.frameId === 0) {
      s.url = safeUrl(d.url);
      s.navigation = crypto.randomUUID();
      await save(s);
    }
  }),
);
chrome.webRequest.onBeforeRequest.addListener(
  (d) => {
    if (d.tabId < 0 || !classify(d.url)) return;
    serial(async () => {
      const s = await get(d.tabId);
      if (!s?.capturing) return;
      const frame = s.frames[String(d.frameId)];
      if (d.documentId && frame && frame.document !== d.documentId) return;
      const p = await settings();
      let body: string | undefined;
      if (d.requestBody?.formData)
        body = new URLSearchParams(
          Object.fromEntries(
            Object.entries(d.requestBody.formData).map(([k, v]) => [
              k,
              String(v[0] || ""),
            ]),
          ),
        ).toString();
      else if (d.requestBody?.raw)
        body = d.requestBody.raw
          .slice(0, 4)
          .map((r) =>
            r.bytes ? new TextDecoder().decode(r.bytes.slice(0, 32000)) : "",
          )
          .join("");
      const parsed = parseRequest(d.url, body);
      const first = parsed[0];
      if (!first) return;
      const observation: Observation = {
        id: `request:${d.requestId}:${d.timeStamp}`,
        requestId: d.requestId,
        time: d.timeStamp,
        source: "network",
        platform: first.platform,
        name: first.name,
        payload: first.payload,
        url: safeUrl(d.url),
        method: d.method,
        requestType: d.type,
        frame: d.frameId,
        origin: safeUrl(d.initiator || s.url),
        navigation: s.navigation,
      };
      append(s, observation, p.limit, true);
      if (d.timeStamp > (s.eventsClearedAt ?? 0))
        for (const [i, e] of parsed.entries())
          append(
            s,
            { ...observation, ...e, id: `${observation.id}:${i}` },
            p.limit,
          );
      await save(s);
    });
    return undefined;
  },
  { urls: ["http://*/*", "https://*/*"] },
  ["requestBody"],
);
function finish(
  d:
    | chrome.webRequest.OnCompletedDetails
    | chrome.webRequest.OnErrorOccurredDetails,
) {
  if (d.tabId < 0 || !classify(d.url)) return;
  serial(async () => {
    const s = await get(d.tabId);
    if (!s?.capturing) return;
    for (const e of [...s.requests, ...s.events])
      if (e.requestId === d.requestId) {
        if ("statusCode" in d) e.status = d.statusCode;
        else e.name = `${e.name} · failed`;
      }
    await save(s);
  });
}
chrome.webRequest.onCompleted.addListener(finish, {
  urls: ["http://*/*", "https://*/*"],
});
chrome.webRequest.onErrorOccurred.addListener(finish, {
  urls: ["http://*/*", "https://*/*"],
});
