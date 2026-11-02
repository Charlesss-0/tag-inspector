export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };
export interface Evidence {
  platform: string;
  kind: string;
  detail: string;
  ids: string[];
  category: "tag" | "call";
}
export interface Observation {
  id: string;
  time: number;
  source: string;
  name: string;
  platform: string;
  payload: Json;
  frame: number;
  origin: string;
  navigation: string;
  url?: string;
  method?: string;
  requestType?: string;
  status?: number;
  requestId?: string;
}
export interface PageElement {
  id: string;
  kind: "phone" | "email" | "form";
  label: string;
  normalized: string;
  location: string;
  frame: number;
  details: Json;
}
export interface Frame {
  document: string;
  origin: string;
  evidence: Evidence[];
  elements: PageElement[];
}
export interface Session {
  tab: number;
  id: string;
  url: string;
  capturing: boolean;
  captureGeneration: number;
  eventsClearedAt: number;
  started: number;
  frames: Record<string, Frame>;
  events: Observation[];
  requests: Observation[];
  dropped: number;
  navigation: string;
}
export interface Settings {
  theme: "system" | "light" | "dark";
  limit: number;
  automatic: boolean;
  messages: boolean;
  layers: string[];
}
export const defaults: Settings = {
  theme: "system",
  limit: 300,
  automatic: true,
  messages: false,
  layers: ["dataLayer"],
};
export function record(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
