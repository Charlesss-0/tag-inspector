import type { PageElement } from "./model";
import { safeUrl } from "./privacy";

const forms: [string, string][] = [
  ["Elementor", "form.elementor-form"],
  ["Gravity Forms", ".gform_wrapper"],
  ["Contact Form 7", ".wpcf7"],
  ["WPForms", ".wpforms-container"],
  ["Ninja Forms", ".nf-form-cont"],
  ["Formidable Forms", ".frm_forms"],
  ["HubSpot", ".hbspt-form, .hs-form"],
  ["GoHighLevel", '[data-form-id], iframe[src*="leadconnectorhq.com"]'],
  ["Typeform", '[data-tf-live], iframe[src*="typeform.com"]'],
  ["Jotform", 'iframe[src*="jotform.com"], form[action*="jotform.com"]'],
  ["Marketo", ".mktoForm"],
  ["Webflow", ".w-form"],
  ["Formspree", 'form[action*="formspree.io"]'],
];
export const formSelector =
  'form, [role="form"], iframe[src*="typeform.com"], iframe[src*="jotform.com"], iframe[src*="leadconnectorhq.com"], iframe[src*="hsforms.com"], [data-tf-live], .nf-form-cont';
export function formProvider(el: Element): string {
  return (
    forms.find(([, s]) => el.matches(s) || el.closest(s))?.[0] ||
    (el.matches('iframe[src*="hsforms.com"]')
      ? "HubSpot"
      : "Native / custom HTML")
  );
}
export function phones(text: string): string[] {
  return [
    ...text.matchAll(
      /(?:\+\d{1,3}[ .-]?)?(?:\(\d{2,4}\)|\d{2,4})[ .-]\d{3,4}[ .-]\d{3,4}/g,
    ),
  ]
    .map((m) => m[0])
    .filter((v) => {
      const n = v.replace(/\D/g, "");
      return n.length >= 8 && n.length <= 15 && !/^\d{4}-\d{2}-\d{2}$/.test(v);
    });
}
export function emails(text: string): string[] {
  return [
    ...new Set(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []),
  ];
}
export function locationOf(el: Element): string {
  return `${el.tagName.toLowerCase()}${el.id ? `#${el.id.slice(0, 80)}` : ""}${typeof el.className === "string" && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}` : ""}`;
}
export function scanElements(
  doc: Document,
  remember: (el: Element) => string,
): PageElement[] {
  const out: PageElement[] = [];
  const seen = new Set<string>();
  const add = (
    el: Element,
    kind: "phone" | "email",
    value: string,
    linked: boolean,
  ) => {
    const normalized =
      kind === "phone" ? value.replace(/[^+\d]/g, "") : value.toLowerCase();
    if (
      kind === "phone" &&
      (normalized.replace(/\D/g, "").length < 7 || normalized.length > 17)
    )
      return;
    const id = remember(el);
    const key = `${id}:${kind}:${normalized}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      id,
      kind,
      label: value.slice(0, 120),
      normalized,
      frame: 0,
      location: locationOf(el),
      details: {
        clickable: linked,
        element: el.tagName,
        linked: linked ? value : null,
      },
    });
  };
  for (const el of [
    ...doc.querySelectorAll(
      'a[href^="tel:"],a[href^="mailto:"],[data-phone],[data-email],input[type="tel"][placeholder]',
    ),
  ].slice(0, 300)) {
    if (el.closest('[hidden],[aria-hidden="true"]')) continue;
    const href = el.getAttribute("href") || "";
    if (href.startsWith("tel:"))
      add(el, "phone", href.slice(4).split("?")[0], true);
    if (href.startsWith("mailto:"))
      for (const e of emails(href.slice(7).split("?")[0]))
        add(el, "email", e, true);
    for (const p of phones(
      el.getAttribute("data-phone") || el.getAttribute("placeholder") || "",
    ))
      add(el, "phone", p, false);
    for (const e of emails(el.getAttribute("data-email") || ""))
      add(el, "email", e, false);
  }
  if (doc.body) {
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    let count = 0;
    while (count++ < 12000 && out.length < 400) {
      n = walker.nextNode();
      if (!n) break;
      const el = n.parentElement;
      if (
        !el ||
        el.closest(
          'script,style,noscript,textarea,input,select,[contenteditable], [hidden],[aria-hidden="true"]',
        ) ||
        !el.getClientRects().length
      )
        continue;
      const text = (n.textContent || "").slice(0, 2000);
      for (const p of phones(text))
        add(el, "phone", p, el.closest('a[href^="tel:"]') !== null);
      for (const e of emails(text))
        add(el, "email", e, el.closest('a[href^="mailto:"]') !== null);
    }
  }
  for (const el of [...doc.querySelectorAll(formSelector)].slice(0, 100)) {
    const fields = [...el.querySelectorAll("input,textarea,select")];
    out.push({
      id: remember(el),
      kind: "form",
      label:
        el.getAttribute("aria-label") ||
        el.getAttribute("name") ||
        el.id ||
        "Untitled form",
      normalized: formProvider(el),
      location: locationOf(el),
      frame: 0,
      details: {
        provider: formProvider(el),
        evidence:
          formProvider(el) === "Native / custom HTML"
            ? "Native form or accessible form role"
            : "Matching provider DOM signature",
        action: el.getAttribute("action")
          ? safeUrl(new URL(el.getAttribute("action") || "", doc.URL).href)
          : null,
        method: el.getAttribute("method") || "GET",
        fields: fields.length,
        fieldTypes: fields.map(
          (f) => f.getAttribute("type") || f.tagName.toLowerCase(),
        ),
        required: fields.filter((f) => f.hasAttribute("required")).length,
        submitButton: !!el.querySelector(
          'button:not([type]),button[type="submit"],input[type="submit"]',
        ),
        embedded: el.tagName === "IFRAME",
      },
    });
  }
  return out;
}
