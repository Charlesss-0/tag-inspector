import {
  type Evidence,
  type Observation,
  type PageElement,
  record,
  type Settings,
} from "./model";
export type PanelMessage =
  | { type: "GET" | "CLEAR" | "CLEAR_EVENTS" | "RESCAN"; tab: number }
  | { type: "CAPTURE"; tab: number; active: boolean }
  | { type: "LOCATE"; tab: number; frame: number; id: string }
  | { type: "SETTINGS"; settings: Settings }
  | { type: "CLEAR_ALL" };
export type ContentMessage =
  | { type: "HELLO" }
  | { type: "SCAN"; evidence: Evidence[]; elements: PageElement[] }
  | {
      type: "OBSERVE";
      sessionId: string;
      generation: number;
      events: Pick<
        Observation,
        "id" | "time" | "source" | "name" | "payload"
      >[];
    };
export function isEvidence(v: unknown): v is Evidence {
  return (
    record(v) &&
    typeof v.platform === "string" &&
    typeof v.kind === "string" &&
    typeof v.detail === "string" &&
    Array.isArray(v.ids) &&
    v.ids.every((x: unknown) => typeof x === "string") &&
    (v.category === "tag" || v.category === "call")
  );
}
export function isElement(v: unknown): v is PageElement {
  return (
    record(v) &&
    typeof v.id === "string" &&
    (v.kind === "phone" || v.kind === "email" || v.kind === "form") &&
    typeof v.label === "string" &&
    typeof v.normalized === "string" &&
    typeof v.location === "string" &&
    typeof v.frame === "number" &&
    isJson(v.details)
  );
}
function isJson(v: unknown, depth = 0): boolean {
  if (depth > 12) return false;
  if (v === null || typeof v === "string" || typeof v === "boolean")
    return true;
  if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v))
    return v.length <= 500 && v.every((x) => isJson(x, depth + 1));
  return (
    record(v) &&
    Object.keys(v).length <= 100 &&
    Object.values(v).every((x) => isJson(x, depth + 1))
  );
}
