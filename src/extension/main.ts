import { providers } from "../core/detectors";
import { record } from "../core/model";
import { sanitize } from "../core/privacy";

const configEvent = "tag-inspector:config:v1",
  dataEvent = "tag-inspector:data:v1";
let active = false;
let previousGlobals = "";
let pushDepth = 0;
let layers = ["dataLayer"];
let timer: ReturnType<typeof setInterval> | undefined;
const watched = new WeakMap<
  unknown[],
  {
    original: typeof Array.prototype.push;
    wrapper: typeof Array.prototype.push;
  }
>();
const restore = new Set<() => void>();
function emit(kind: string, payload: unknown) {
  if (kind === "layer" && record(payload) && record(payload.raw)) {
    const descriptors = Object.getOwnPropertyDescriptors(payload.raw);
    const command = descriptors["0"]?.value;
    if (["event", "config", "consent", "js", "set"].includes(command)) {
      payload = {
        ...payload,
        raw: [command, descriptors["1"]?.value, descriptors["2"]?.value],
      };
    }
  }

  try {
    window.dispatchEvent(
      new CustomEvent(dataEvent, {
        detail: JSON.stringify({ kind, payload: sanitize(payload) }),
      }),
    );
  } catch {
    /* A hostile page must not break a push. */
  }
}
function inspect() {
  const globals = providers
    .flatMap((p) => p.globals)
    .filter(
      (k) => Object.getOwnPropertyDescriptor(window, k)?.value !== undefined,
    );
  if (JSON.stringify(globals) !== previousGlobals) {
    previousGlobals = JSON.stringify(globals);
    emit("globals", globals);
  }
  for (const name of layers) {
    const value = Object.getOwnPropertyDescriptor(window, name)?.value;
    if (!Array.isArray(value)) continue;
    const prev = watched.get(value);
    if (prev?.wrapper === value.push) continue;
    const original = value.push;
    const first = !prev;
    const wrapper: typeof Array.prototype.push = function (
      this: unknown[],
      ...items: unknown[]
    ) {
      let result: number;
      pushDepth++;
      try {
        result = Reflect.apply(original, this, items);
      } finally {
        pushDepth--;
      }
      if (active && pushDepth === 0)
        for (const item of items.slice(0, 40))
          emit("layer", { layer: name, raw: item, existing: false });
      return result;
    };
    try {
      value.push = wrapper;
      watched.set(value, { original, wrapper });
      restore.add(() => {
        if (value.push === wrapper) value.push = original;
      });
      if (first && active)
        for (const item of value.slice(-100))
          emit("layer", { layer: name, raw: item, existing: true });
    } catch {
      /* Frozen arrays remain untouched. */
    }
  }
}
window.addEventListener(configEvent, (event) => {
  if (
    !(event instanceof CustomEvent) ||
    typeof event.detail !== "string" ||
    event.detail.length > 2000
  )
    return;
  try {
    const c: unknown = JSON.parse(event.detail);
    if (!record(c) || typeof c.active !== "boolean" || !Array.isArray(c.layers))
      return;
    active = c.active;
    layers = c.layers
      .filter(
        (x): x is string =>
          typeof x === "string" && /^[A-Za-z_$][\w$]{0,50}$/.test(x),
      )
      .slice(0, 5);
    if (timer) clearInterval(timer);
    if (c.enabled === true) {
      inspect();
      timer = setInterval(inspect, 1500);
    }
  } catch {
    /* Invalid page-originated configuration is ignored. */
  }
});
window.addEventListener("pagehide", () => {
  active = false;
  if (timer) clearInterval(timer);
  for (const undo of restore) undo();
  restore.clear();
});
