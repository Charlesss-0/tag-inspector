import { describe, expect, it } from "vitest";
import { classify, detect, providers } from "../src/core/detectors";
import { emails, phones } from "../src/core/elements";
import type { Observation } from "../src/core/model";
import { layerName, parseRequest } from "../src/core/parsers";
import { safeUrl, sanitize } from "../src/core/privacy";
import {
  acceptsBatch,
  append,
  clearEvents,
  newSession,
} from "../src/core/session";

describe("evidence registry", () => {
  it.each([
    ["gtm", "https://www.googletagmanager.com/gtm.js?id=GTM-ABCD"],
    ["ga4", "https://www.googletagmanager.com/gtag/js?id=G-ABCD"],
    ["ads", "https://www.googletagmanager.com/gtag/js?id=AW-1234"],
    ["meta", "https://connect.facebook.net/en_US/fbevents.js"],
    ["uet", "https://bat.bing.com/bat.js"],
  ])("detects %s script evidence", (id, url) => {
    expect(
      detect({ scripts: [url], inline: [], globals: [] }).some(
        (e) => e.platform === id,
      ),
    ).toBe(true);
  });
  it.each(providers.filter((p) => p.category === "call"))(
    "recognizes $name",
    (p) => {
      expect(classify(`https://${p.domains[0]}/script.js`)?.id).toBe(p.id);
    },
  );
  it("rejects hostname lookalikes", () => {
    expect(
      classify("https://google-analytics.com.attacker.example/g/collect"),
    ).toBeUndefined();
    expect(classify("https://example.com/?url=bat.bing.com")).toBeUndefined();
  });
  it("marks globals as possible evidence and extracts IDs", () => {
    expect(
      detect({
        scripts: [],
        inline: ["fbq('init', '123456789');"],
        globals: ["fbq"],
      })[0].ids,
    ).toEqual(["123456789"]);
  });
});
describe("event parsing", () => {
  it("keeps GA4 batched events distinct", () => {
    const events = parseRequest(
      "https://www.google-analytics.com/g/collect?tid=G-TEST",
      "en=page_view&ep.currency=USD\nen=purchase&epn.value=25",
    );
    expect(events.map((e) => e.name)).toEqual(["page_view", "purchase"]);
    expect(events[1].payload).toMatchObject({
      tid: "G-TEST",
      "epn.value": "25",
    });
  });
  it("extracts Ads conversion fields without success claims", () => {
    expect(
      parseRequest(
        "https://www.googleadservices.com/pagead/conversion/123/?label=xyz&value=12&currency=USD",
      )[0],
    ).toMatchObject({
      name: "conversion request",
      payload: {
        conversion_id: "123",
        label: "xyz",
        value: "12",
        currency: "USD",
      },
    });
  });
  it("parses Meta custom events", () =>
    expect(
      parseRequest("https://www.facebook.com/tr/?id=123&ev=CustomLead")[0],
    ).toMatchObject({ name: "CustomLead", payload: { standard: false } }));
  it("parses UET actions", () =>
    expect(
      parseRequest("https://bat.bing.com/action/0?ti=123&ea=lead")[0].name,
    ).toBe("lead"));
  it("handles unnamed layers and malformed URLs", () => {
    expect(layerName({ event: "generate_lead" })).toBe("generate_lead");
    expect(layerName({ ecommerce: {} })).toBe("dataLayer entry");
    expect(parseRequest("not a url")).toEqual([]);
  });
});
describe("privacy and serialization", () => {
  it("redacts secrets before retention", () => {
    const output = JSON.stringify(
      sanitize({
        event: "purchase",
        email: "a@example.com",
        password: "secret",
        token: "secret",
        cid: "123",
        custom: "private text",
        ecommerce: { value: 10, currency: "USD" },
      }),
    );
    expect(output).not.toContain("secret");
    expect(output).not.toContain("a@example.com");
    expect(output).not.toContain("private text");
    expect(output).toContain("purchase");
    expect(output).toContain("USD");
  });
  it("handles cycles, getters and large input without executing accessors", () => {
    const value: Record<string, unknown> = { event: "hello" };
    value.raw = value;
    Object.defineProperty(value, "name", {
      get() {
        throw new Error("must not run");
      },
      enumerable: true,
    });
    expect(JSON.stringify(sanitize(value))).toContain("[circular]");
    expect(JSON.stringify(sanitize("x".repeat(10000))).length).toBeLessThan(
      2000,
    );
  });
  it("redacts URL credentials and unknown query fields", () => {
    const u = safeUrl(
      "https://user:pass@example.com/p?token=abc&tid=G-123&search=private#secret",
    );
    expect(u).not.toContain("abc");
    expect(u).not.toContain("pass");
    expect(u).not.toContain("private");
    expect(u).toContain("G-123");
  });
});
describe("sessions", () => {
  const event: Observation = {
    id: "1",
    time: 1,
    source: "dataLayer",
    name: "lead",
    platform: "gtm",
    payload: { event: "lead" },
    frame: 0,
    origin: "https://example.com",
    navigation: "a",
  };
  it("discards paused observations", () => {
    const s = newSession(1, "https://example.com", false);
    append(s, event, 100);
    expect(s.events).toEqual([]);
    s.capturing = true;
    append(s, event, 100);
    expect(s.events).toHaveLength(1);
  });
  it("deduplicates only observation IDs", () => {
    const s = newSession(1, "https://example.com", true);
    append(s, event, 100);
    append(s, event, 100);
    append(s, { ...event, id: "2", source: "network" }, 100);
    expect(s.events).toHaveLength(2);
  });
  it("bounds retention and isolates tabs/navigation", () => {
    const a = newSession(1, "https://example.com", true),
      b = newSession(2, "https://other.com", true);
    for (let i = 0; i < 20; i++) append(a, { ...event, id: String(i) }, 5);
    expect(a.events).toHaveLength(5);
    expect(a.dropped).toBe(15);
    expect(b.events).toHaveLength(0);
    expect(a.navigation).not.toBe(b.navigation);
  });
});
it("extracts plausible phones and deduplicates public emails", () => {
  expect(phones("Call +1 (415) 555-0199")).toEqual(["+1 (415) 555-0199"]);
  expect(phones("2026-11-01 123456")).toEqual([]);
  expect(emails("hi@example.com hi@example.com")).toEqual(["hi@example.com"]);
});

import { isElement, isEvidence } from "../src/core/protocol";

it("rejects malformed cross-boundary inventories", () => {
  expect(isElement({ id: "x", kind: "phone", details: {} })).toBe(false);
  expect(
    isEvidence({
      platform: "ga4",
      kind: "script",
      detail: "x",
      ids: [{}],
      category: "tag",
    }),
  ).toBe(false);
  expect(
    isEvidence({
      platform: "ga4",
      kind: "script",
      detail: "x",
      ids: ["G-TEST"],
      category: "tag",
    }),
  ).toBe(true);
});

it("does not mistake lookalike Google hosts or Universal Analytics for GA4", () => {
  expect(classify("https://evilgoogletagmanager.com/gtm.js")).toBeUndefined();
  expect(
    classify("https://www.google-analytics.com/analytics.js"),
  ).toBeUndefined();
  expect(
    detect({
      scripts: ["https://evilgoogletagmanager.com/gtag/js?id=G-ABCD"],
      inline: [],
      globals: [],
    }),
  ).toEqual([]);
});

it.each([true, false])(
  "event-only reset preserves capture=%s, evidence and requests",
  (capturing) => {
    const s = newSession(1, "https://example.com", capturing);
    s.frames["0"] = {
      document: "doc",
      origin: s.url,
      evidence: [
        {
          platform: "meta",
          category: "tag",
          kind: "script",
          detail: "installed",
          ids: [],
        },
      ],
      elements: [],
    };
    const observation = {
      id: "old",
      time: 1,
      source: "network",
      name: "lead",
      platform: "meta",
      payload: null,
      frame: 0,
      origin: s.url,
      navigation: s.navigation,
    };
    s.events = [observation];
    s.requests = [observation];
    const oldGeneration = s.captureGeneration;
    const inventory = structuredClone(s.frames);
    clearEvents(s, 10);
    expect(s.events).toEqual([]);
    expect(s.requests).toEqual([observation]);
    expect(s.frames).toEqual(inventory);
    expect(s.capturing).toBe(capturing);
    expect(acceptsBatch(s, s.id, oldGeneration)).toBe(false);
    expect(acceptsBatch(s, s.id, s.captureGeneration)).toBe(true);
    expect(acceptsBatch(s, "another-session", s.captureGeneration)).toBe(false);
    const restored = JSON.parse(JSON.stringify(s));
    expect(acceptsBatch(restored, s.id, oldGeneration)).toBe(false);
  },
);
