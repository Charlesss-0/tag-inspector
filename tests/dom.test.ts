// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { formProvider, scanElements } from "../src/core/elements";

afterEach(() => {
  document.body.innerHTML = "";
});
describe("forms and public contacts", () => {
  it.each([
    ["Elementor", '<form class="elementor-form"></form>'],
    ["Gravity Forms", '<div class="gform_wrapper"><form></form></div>'],
    ["Contact Form 7", '<div class="wpcf7"><form></form></div>'],
    ["WPForms", '<div class="wpforms-container"><form></form></div>'],
    ["Ninja Forms", '<div class="nf-form-cont"><form></form></div>'],
    ["Formidable Forms", '<div class="frm_forms"><form></form></div>'],
    ["HubSpot", '<form class="hs-form"></form>'],
    ["Marketo", '<form class="mktoForm"></form>'],
    ["Webflow", '<div class="w-form"><form></form></div>'],
    ["Formspree", '<form action="https://formspree.io/f/x"></form>'],
  ])("identifies %s", (name, html) => {
    document.body.innerHTML = html;
    const form = document.querySelector("form");
    if (!form) throw new Error("Missing fixture");
    expect(formProvider(form)).toBe(name);
  });
  it("never reads form values or mailto bodies", () => {
    document.body.innerHTML =
      '<form id="contact"><input type="password" value="secret"><input type="email" value="private@example.com" required><button>Send</button></form><a href="mailto:public@example.com?body=secret">Contact</a>';
    let id = 0;
    const rows = scanElements(document, () => String(++id));
    expect(JSON.stringify(rows)).not.toContain("secret");
    expect(JSON.stringify(rows)).not.toContain("private@example.com");
    expect(rows.find((r) => r.kind === "email")?.label).toBe(
      "public@example.com",
    );
    expect(rows.find((r) => r.kind === "form")?.details).toMatchObject({
      fields: 2,
      required: 1,
      submitButton: true,
    });
  });
});
