import type { Evidence } from "./model";
export interface Provider {
  id: string;
  name: string;
  category: "tag" | "call";
  domains: string[];
  script?: RegExp;
  inline?: RegExp;
  globals: string[];
  ids?: RegExp;
}
export const providers: Provider[] = [
  {
    id: "gtm",
    name: "Google Tag Manager",
    category: "tag",
    domains: [],
    script: /googletagmanager\.com\/gtm\.js/,
    inline: /GTM-[A-Z0-9]+/,
    globals: ["google_tag_manager"],
    ids: /GTM-[A-Z0-9]+/g,
  },
  {
    id: "gtag",
    name: "Google tag",
    category: "tag",
    domains: [],
    script: /googletagmanager\.com\/gtag\/js/,
    globals: ["gtag"],
    ids: /(?:G|AW|DC)-[A-Z0-9]+/g,
  },
  {
    id: "ga4",
    name: "Google Analytics 4",
    category: "tag",
    domains: ["google-analytics.com", "analytics.google.com"],
    inline: /G-[A-Z0-9]{4,}/,
    globals: [],
    ids: /G-[A-Z0-9]+/g,
  },
  {
    id: "ads",
    name: "Google Ads",
    category: "tag",
    domains: ["googleadservices.com", "googleads.g.doubleclick.net"],
    inline: /AW-\d+/,
    globals: [],
    ids: /AW-\d+/g,
  },
  {
    id: "floodlight",
    name: "Floodlight",
    category: "tag",
    domains: ["fls.doubleclick.net"],
    inline: /DC-\d+/,
    globals: [],
    ids: /DC-\d+/g,
  },
  {
    id: "meta",
    name: "Meta Pixel",
    category: "tag",
    domains: ["connect.facebook.net"],
    script: /facebook\.com\/tr(?:\?|\/)/,
    inline: /fbq\s*\(\s*['"]init/,
    globals: ["fbq"],
    ids: /fbq\s*\(\s*['"]init['"]\s*,\s*['"](\d+)/g,
  },
  {
    id: "uet",
    name: "Microsoft UET",
    category: "tag",
    domains: ["bat.bing.com"],
    inline: /uetq|UET\s*\(/,
    globals: ["uetq"],
    ids: /ti\s*[:=]\s*['"]?(\d+)/g,
  },
  {
    id: "tiktok",
    name: "TikTok Pixel",
    category: "tag",
    domains: ["analytics.tiktok.com"],
    globals: ["ttq"],
  },
  {
    id: "linkedin",
    name: "LinkedIn Insight",
    category: "tag",
    domains: ["snap.licdn.com", "px.ads.linkedin.com"],
    globals: ["_linkedin_data_partner_ids"],
  },
  {
    id: "pinterest",
    name: "Pinterest Tag",
    category: "tag",
    domains: ["s.pinimg.com", "ct.pinterest.com"],
    globals: ["pintrk"],
  },
  {
    id: "snap",
    name: "Snapchat Pixel",
    category: "tag",
    domains: ["sc-static.net", "tr.snapchat.com"],
    globals: ["snaptr"],
  },
  {
    id: "segment",
    name: "Segment",
    category: "tag",
    domains: ["cdn.segment.com", "api.segment.io"],
    globals: [],
  },
  {
    id: "hotjar",
    name: "Hotjar",
    category: "tag",
    domains: ["static.hotjar.com", "script.hotjar.com", "hotjar.io"],
    globals: ["hj"],
  },
  {
    id: "clarity",
    name: "Microsoft Clarity",
    category: "tag",
    domains: ["clarity.ms"],
    globals: ["clarity"],
  },
  {
    id: "mixpanel",
    name: "Mixpanel",
    category: "tag",
    domains: ["mxpnl.com", "api.mixpanel.com"],
    globals: ["mixpanel"],
  },
  {
    id: "amplitude",
    name: "Amplitude",
    category: "tag",
    domains: ["cdn.amplitude.com", "api2.amplitude.com"],
    globals: ["amplitude"],
  },
  {
    id: "ctm",
    name: "CallTrackingMetrics",
    category: "call",
    domains: ["calltrackingmetrics.com", "tctm.co"],
    globals: ["__ctm", "ctm"],
  },
  {
    id: "callrail",
    name: "CallRail",
    category: "call",
    domains: ["callrail.com", "calltrk.com"],
    globals: ["CallTrk"],
  },
  {
    id: "whatconverts",
    name: "WhatConverts",
    category: "call",
    domains: ["whatconverts.com"],
    globals: ["_wct"],
  },
  {
    id: "invoca",
    name: "Invoca",
    category: "call",
    domains: ["invocacdn.com", "invoca.net"],
    globals: ["Invoca"],
  },
  {
    id: "marchex",
    name: "Marchex",
    category: "call",
    domains: ["marchex.io", "marchex.com", "voicestar.com"],
    globals: [],
  },
];
export function domainMatches(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}
export function classify(raw: string): Provider | undefined {
  try {
    const u = new URL(raw);
    if (
      domainMatches(u.hostname, "facebook.com") &&
      /^\/tr\/?$/.test(u.pathname)
    )
      return providers.find((p) => p.id === "meta");
    if (
      domainMatches(u.hostname, "google.com") &&
      u.pathname.startsWith("/pagead/")
    )
      return providers.find((p) => p.id === "ads");
    return providers.find(
      (p) =>
        (p.domains.some((d) => domainMatches(u.hostname, d)) &&
          (p.id !== "ga4" ||
            /^\/(g|mp)\/collect/.test(u.pathname) ||
            u.searchParams.get("tid")?.startsWith("G-"))) ||
        (domainMatches(u.hostname, "googletagmanager.com") &&
          p.script?.test(`${u.hostname}${u.pathname}`)),
    );
  } catch {
    return undefined;
  }
}
export function detect(input: {
  scripts: string[];
  inline: string[];
  globals: string[];
}): Evidence[] {
  const result: Evidence[] = [];
  for (const p of providers) {
    for (const src of input.scripts) {
      let matched = classify(src)?.id === p.id;
      if (
        p.id === "ga4" &&
        classify(src)?.id === "gtag" &&
        /[?&]id=G-/.test(src)
      )
        matched = true;
      if (
        p.id === "ads" &&
        classify(src)?.id === "gtag" &&
        /[?&]id=AW-/.test(src)
      )
        matched = true;
      if (matched)
        result.push({
          platform: p.id,
          category: p.category,
          kind: "script",
          detail: src.split("?")[0],
          ids: extractIds(p, src),
        });
    }
    for (const code of input.inline) {
      if (p.inline?.test(code))
        result.push({
          platform: p.id,
          category: p.category,
          kind: "configuration",
          detail: "Recognized inline initialization signature",
          ids: extractIds(p, code),
        });
    }
    for (const g of p.globals)
      if (input.globals.includes(g))
        result.push({
          platform: p.id,
          category: p.category,
          kind: "global",
          detail: `window.${g} exists (possible detection)`,
          ids: [],
        });
  }
  return result.slice(0, 150);
}
function extractIds(p: Provider, text: string): string[] {
  return p.ids
    ? [...text.matchAll(p.ids)].slice(0, 12).map((m) => m[1] || m[0])
    : [];
}
export const platformName = (id: string) =>
  providers.find((p) => p.id === id)?.name || id;
