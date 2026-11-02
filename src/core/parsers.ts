import { classify } from "./detectors";
import { type Json, record } from "./model";
import { sanitize } from "./privacy";
export function layerName(value: unknown): string {
  if (record(value)) {
    if (typeof value.event === "string") return value.event.slice(0, 120);
    if (value[0] === "event" && typeof value[1] === "string") return value[1];
    if (typeof value[0] === "string") return `gtag: ${value[0]}`;
  }
  if (
    Array.isArray(value) &&
    value[0] === "event" &&
    typeof value[1] === "string"
  )
    return value[1];
  if (Array.isArray(value))
    return typeof value[1] === "string"
      ? `${value[0]}: ${value[1]}`
      : "dataLayer entry";
  return "dataLayer entry";
}
export function parseRequest(
  raw: string,
  body?: string,
): { platform: string; name: string; payload: Json }[] {
  const p = classify(raw);
  if (!p) return [];
  const u = new URL(raw);
  const base = Object.fromEntries(u.searchParams);
  const lines = body ? body.slice(0, 32000).split(/\r?\n/).slice(0, 40) : [""];
  return lines.map((line) => {
    let fields: Record<string, unknown> = { ...base };
    try {
      const decoded: unknown = JSON.parse(line);
      if (record(decoded)) fields = { ...fields, ...decoded };
    } catch {
      fields = { ...fields, ...Object.fromEntries(new URLSearchParams(line)) };
    }
    let name = "request";
    if (p.id === "ga4")
      name =
        typeof fields.en === "string"
          ? fields.en
          : "GA request (event unavailable)";
    if (p.id === "ads") {
      name = u.pathname.includes("conversion")
        ? "conversion request"
        : "remarketing request";
      fields.conversion_id =
        u.pathname.match(
          /\/(?:conversion|viewthroughconversion)\/(\d+)/,
        )?.[1] ||
        fields.id ||
        null;
    }
    if (p.id === "meta") {
      name = typeof fields.ev === "string" ? fields.ev : "Meta request";
      fields.standard = [
        "PageView",
        "Lead",
        "Purchase",
        "ViewContent",
        "AddToCart",
        "InitiateCheckout",
        "CompleteRegistration",
        "Search",
        "Contact",
      ].includes(name);
    }
    if (p.id === "uet")
      name =
        typeof fields.ea === "string"
          ? fields.ea
          : typeof fields.evt === "string"
            ? fields.evt
            : "UET request";
    return { platform: p.id, name, payload: sanitize(fields) };
  });
}
