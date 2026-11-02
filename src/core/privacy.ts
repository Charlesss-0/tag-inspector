import type { Json } from "./model";

const sensitive =
  /password|passwd|secret|token|authorization|cookie|email|phone|address|first.?name|last.?name|user.?id|client.?id|^cid$|^uid$|^em$|^ph$|^ud\[|gclid|fbclid|msclkid|session.?id|^sid$|form.?value/i;
const safeKey =
  /^(event|event_name|event_id|type|name|form_id|form_name|form_provider|layer|existing|direction|origin|provider|before|after|element|reason|count|status|method|fields|required|fieldTypes|submitButton|embedded|action|ecommerce|items|item_id|item_name|item_category|price|quantity|value|currency|transaction_id|gtm.*|en|tid|id|ti|ev|ea|ec|el|label|send_to|conversion_id|conversion_label|dl|dt|page_location|page_title|v|src|cat|ord|random|standard|parameters|raw|parsed|batch|ep\..*|epn\..*|cd\[.*\])$/;
export function cleanText(v: string): string {
  return v
    .slice(0, 1500)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email redacted]")
    .replace(/\bBearer\s+\S+/gi, "[token redacted]")
    .replace(/\beyJ[A-Za-z0-9_.-]+/g, "[token redacted]")
    .replace(/(?:\+\d[\d ()-]{7,}\d)/g, "[phone redacted]");
}
export function safeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.username = "";
    u.password = "";
    u.hash = "";
    for (const [k, v] of [...u.searchParams])
      u.searchParams.set(
        k,
        sensitive.test(k) || !safeKey.test(k) ? "[redacted]" : cleanText(v),
      );
    return cleanText(u.href);
  } catch {
    return "[unavailable URL]";
  }
}
export function sanitize(value: unknown): Json {
  const seen = new WeakSet<object>();
  let budget = 5000;
  function walk(v: unknown, depth: number, key = ""): Json {
    if (sensitive.test(key)) return "[redacted]";
    if (budget <= 0 || depth > 6) return "[truncated]";
    if (v === null || typeof v === "boolean") return v;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v === "string") {
      budget -= v.length;
      return /^https?:\/\//.test(v) ? safeUrl(v) : cleanText(v);
    }
    if (typeof v !== "object") return `[${typeof v}]`;
    if (seen.has(v)) return "[circular]";
    seen.add(v);
    if (Array.isArray(v)) return v.slice(0, 40).map((x) => walk(x, depth + 1));
    const out: Record<string, Json> = {};
    for (const [k, d] of Object.entries(
      Object.getOwnPropertyDescriptors(v),
    ).slice(0, 50)) {
      if (["__proto__", "constructor", "prototype"].includes(k)) continue;
      out[k.slice(0, 80)] = !("value" in d)
        ? "[accessor omitted]"
        : !safeKey.test(k) && typeof d.value === "string"
          ? "[unrecognized field redacted]"
          : walk(d.value, depth + 1, k);
      budget -= k.length;
    }
    return out;
  }
  try {
    return walk(value, 0);
  } catch {
    return "[unserializable]";
  }
}
