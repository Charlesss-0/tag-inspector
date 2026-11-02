// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "../src/app/main";
import { defaults } from "../src/core/model";
import { newSession } from "../src/core/session";

const session = newSession(7, "https://fixture.example/", true);
session.events = [
  {
    id: "e1",
    time: 1,
    source: "dataLayer",
    platform: "gtm",
    name: "generate_lead",
    payload: { event: "generate_lead" },
    frame: 0,
    origin: "https://fixture.example",
    navigation: "n1",
  },
];
beforeEach(() => {
  vi.stubGlobal("chrome", {
    tabs: { query: vi.fn().mockResolvedValue([{ id: 7, url: session.url }]) },
    runtime: {
      id: "test",
      sendMessage: vi
        .fn()
        .mockResolvedValue({ ok: true, session, settings: defaults }),
    },
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("navigates, searches, opens details, and copies real session data", async () => {
  render(<App />);
  await screen.findByText("fixture.example");
  fireEvent.click(screen.getByRole("button", { name: "Events" }));
  await screen.findByText("generate_lead");
  fireEvent.change(screen.getByLabelText("Search current section"), {
    target: { value: "absent" },
  });
  expect(screen.queryByText("generate_lead")).toBeNull();
  expect(screen.getByText("No observations to show")).toBeTruthy();
  fireEvent.click(screen.getByText("Reset filters"));
  fireEvent.click(screen.getByText("generate_lead"));
  expect(
    screen.getByText("Available evidence · sensitive fields are redacted"),
  ).toBeTruthy();
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Copy" })),
  );
  expect(navigator.clipboard.writeText).toHaveBeenCalled();
});
it("routes capture and clear actions to the active tab", async () => {
  render(<App />);
  await screen.findByText("fixture.example");
  fireEvent.click(screen.getByRole("button", { name: "Pause" }));
  await waitFor(() =>
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: "CAPTURE",
      tab: 7,
      active: false,
    }),
  );
});

it("clears the timeline and counters through the header control", async () => {
  const cleared = { ...session, events: [], captureGeneration: 1 };
  Object.assign(chrome.runtime, {
    sendMessage: vi.fn(async (message: { type: string }) => ({
      ok: true,
      session: message.type === "CLEAR_EVENTS" ? cleared : session,
      settings: defaults,
    })),
  });
  render(<App />);
  await screen.findByText("fixture.example");
  fireEvent.click(screen.getByRole("button", { name: "Events" }));
  await screen.findByText("generate_lead");
  fireEvent.click(screen.getByRole("button", { name: "Clear events" }));
  await screen.findByText("No observations to show");
  expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
    type: "CLEAR_EVENTS",
    tab: 7,
  });
  expect(screen.getByText("0 frames · 0 events")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Overview" }));
  expect(screen.getByRole("button", { name: "0 Events" })).toBeTruthy();
});

it("ignores a stale polling response that arrives after an event reset", async () => {
  vi.useFakeTimers();
  try {
    let finishPoll: ((result: unknown) => void) | undefined;
    let reads = 0;
    Object.assign(chrome.runtime, {
      sendMessage: vi.fn((message: { type: string }) => {
        if (message.type === "GET" && ++reads === 2)
          return new Promise((resolve) => {
            finishPoll = resolve;
          });
        return Promise.resolve({
          ok: true,
          session:
            message.type === "CLEAR_EVENTS"
              ? { ...session, events: [], captureGeneration: 1 }
              : session,
          settings: defaults,
        });
      }),
    });
    render(<App />);
    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    fireEvent.click(screen.getByRole("button", { name: "Events" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Clear events" }));
    });
    expect(screen.queryByText("generate_lead")).toBeNull();
    await act(async () => {
      finishPoll?.({ ok: true, session, settings: defaults });
    });
    expect(screen.queryByText("generate_lead")).toBeNull();
    expect(screen.getByText("0 frames · 0 events")).toBeTruthy();
  } finally {
    cleanup();
    vi.useRealTimers();
  }
});
