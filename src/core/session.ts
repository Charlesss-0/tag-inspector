import type { Observation, Session } from "./model";
export function newSession(
  tab: number,
  url: string,
  capturing: boolean,
): Session {
  return {
    tab,
    id: crypto.randomUUID(),
    url,
    capturing,
    captureGeneration: 0,
    eventsClearedAt: 0,
    started: Date.now(),
    frames: {},
    events: [],
    requests: [],
    dropped: 0,
    navigation: crypto.randomUUID(),
  };
}
export function append(
  session: Session,
  observation: Observation,
  limit: number,
  network = false,
) {
  if (!session.capturing) return;
  const list = network ? session.requests : session.events;
  if (list.some((e) => e.id === observation.id)) return;
  list.push(observation);
  if (list.length > limit) {
    session.dropped += list.length - limit;
    list.splice(0, list.length - limit);
  }
  while (
    JSON.stringify(session).length > 350000 &&
    (session.events.length || session.requests.length)
  ) {
    if (session.events.length) session.events.shift();
    if (session.requests.length) session.requests.shift();
    session.dropped++;
  }
}

/** Persist before notifying frames: late batches from the previous generation are rejected. */
export function clearEvents(session: Session, now = Date.now()) {
  session.captureGeneration = (session.captureGeneration ?? 0) + 1;
  session.eventsClearedAt = now;
  session.events = [];
}
export function acceptsBatch(
  session: Session,
  sessionId: unknown,
  generation: unknown,
) {
  return (
    session.id === sessionId && (session.captureGeneration ?? 0) === generation
  );
}
