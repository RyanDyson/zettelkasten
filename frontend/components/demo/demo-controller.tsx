"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Joyride, type EventData, type Step } from "react-joyride";
import { disableDemoServer, enableDemoServer } from "@/lib/demo-server";

const sleep = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

async function waitFor(selector: string, timeoutMs = 9000): Promise<HTMLElement | null> {
  const end = performance.now() + timeoutMs;
  while (performance.now() < end) {
    const element = document.querySelector(selector);
    if (element instanceof HTMLElement) return element;
    await sleep(150);
  }
  return null;
}

async function click(selector: string) {
  const element = await waitFor(selector);
  if (element) element.click();
  await sleep(400);
}

function dropFile(selector: string) {
  const zone = document.querySelector(selector);
  if (!(zone instanceof HTMLElement)) {
    console.warn("[demo] dropzone not found");
    return;
  }
  try {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(["demo audio"], "jobless-future-panel.mp3", { type: "audio/mpeg" }),
    );
    zone.dispatchEvent(
      new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }),
    );
  } catch (error) {
    console.error("[demo] drop dispatch failed", error);
  }
}

type Scene = {
  route: string;
  target: string;
  title: string;
  text: string;
  hold: number;
  awaitTarget?: string;
  action?: "openDialog" | "drop" | "openRelated" | "openChat";
};

// Fully self-running: every scene includes its own action; the whole tour
// plays out unattended in roughly a minute.
const SCENES: Scene[] = [
  {
    route: "/uploads",
    target: '[data-tour="upload-trigger"]',
    title: "It starts with a source",
    text: "Drop a podcast, lecture, or PDF into the app. Uploads and transcription run fully on your machine.",
    hold: 3200,
    action: "openDialog",
  },
  {
    route: "/uploads",
    target: '[data-tour="upload-dropzone"]',
    title: "The file lands here",
    text: "A file has been dropped — processing starts right away.",
    hold: 2400,
    awaitTarget: '[data-tour="upload-dropzone"]',
    action: "drop",
  },
  {
    route: "/uploads/demo-source-1",
    target: '[data-tour="source-status"]',
    title: "Transcription starts automatically",
    text: "Whisper turns audio into text right after upload. Processing flips to done shortly.",
    hold: 7500,
  },
  {
    route: "/uploads/demo-source-1",
    target: '[data-tour="source-title"]',
    title: "Done — and a note exists",
    text: "When transcription finishes, a Markdown note is created in your library.",
    hold: 2000,
  },
  {
    route: "/notes/demo-note-1",
    target: '[data-tour="note-title"]',
    title: "Every upload becomes a note",
    text: "A local LLM extracts concepts and links this note into the graph.",
    hold: 5000,
    action: "openRelated",
  },
  {
    route: "/notes/demo-note-2",
    target: '[data-tour="note-title"]',
    title: "Hyperlinks keep threads together",
    text: "Related notes are one click away — the demo just followed one automatically.",
    hold: 3800,
  },
  {
    route: "/",
    target: '[data-tour="graph-canvas"]',
    title: "The graph shows the shape of your thinking",
    text: "Each note is a node; related notes pull together through shared concepts.",
    hold: 6500,
  },
  {
    route: "/",
    target: '[data-tour="chat-open"]',
    title: "Ask your library directly",
    text: "The AI answers from your notes' markdown and embeddings — this panel will stream a chat now.",
    hold: 3000,
    action: "openChat",
  },
  {
    route: "/",
    target: "body",
    title: "Demo complete",
    text: "Upload -> transcription -> note -> hyperlink -> graph -> grounded chat. The chat replays on the right; the demo exits itself in a few seconds.",
    hold: 15000,
  },
];

// Upload → transcription → note → hyperlink → graph → grounded chat, on the real app.
type TourContextValue = { active: boolean; start: () => void; stop: () => void };
const TourContext = createContext<TourContextValue>({
  active: false,
  start: () => {},
  stop: () => {},
});

export function useDemoTour() {
  return useContext(TourContext);
}

export function DemoProvider({ children }: { children?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const client = useQueryClient();
  const [active, setActive] = useState(false);
  const [visible, setVisible] = useState(false);
  const [scene, setScene] = useState(0);
  const nonce = useRef(0);
  const nextRef = useRef<(() => void) | null>(null);
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const stop = useCallback(() => {
    nonce.current += 1;
    setActive(false);
    setVisible(false);
    setScene(0);
    disableDemoServer();
    client.clear();
    router.push("/");
  }, [client, router]);

  const start = useCallback(() => {
    if (active) return;
    enableDemoServer();
    client.clear();
    router.push("/uploads");
    nonce.current += 1;
    setScene(0);
    setActive(true);
  }, [active, client, router]);

  useEffect(() => () => disableDemoServer(), []);

  useEffect(() => {
    if (!active) return;
    const myNonce = ++nonce.current;
    let cancelled = false;
    nextRef.current = null;
    // Waits that the user can interrupt with the tooltip's Next button.
    const nextPress = () =>
      new Promise<void>(resolve => {
        nextRef.current = () => {
          nextRef.current = null;
          resolve();
        };
      });
    async function holdable(ms: number) {
      if (ms <= 0) return;
      await new Promise<void>(resolve => {
        const timer = window.setTimeout(() => resolve(), ms);
        nextRef.current = () => {
          window.clearTimeout(timer);
          resolve();
        };
      });
      nextRef.current = null;
    }
    async function waitUntil(target: string, timeoutMs: number) {
      await Promise.race([waitFor(target, timeoutMs), nextPress()]);
    }
    void (async () => {
      try {
        for (let index = 0; index < SCENES.length; index += 1) {
          if (cancelled || nonce.current !== myNonce) return;
          const def = SCENES[index];
          if (pathnameRef.current !== def.route) {
            // Hide the overlay while pages swap so the floating tooltip never
            // recalculates against a just-unmounted target (top-left glitch).
            setVisible(false);
            router.push(def.route);
          }
          // The tooltip is shown as soon as the target exists; interaction waits happen after.
          await waitFor(def.target);
          if (cancelled || nonce.current !== myNonce) return;
          setScene(index);
        setVisible(true);
          if (def.hold > 0 && def.hold !== Number.POSITIVE_INFINITY)
            await holdable(def.hold);
          if (def.awaitTarget) await waitUntil(def.awaitTarget, 60_000);
          if (cancelled || nonce.current !== myNonce) return;
          if (def.action) {
            if (def.action === "openDialog") await click(def.target);
            else if (def.action === "drop") dropFile('[data-tour="upload-dropzone"]');
            else if (def.action === "openRelated") {
              const link = await waitFor('[data-tour="related-note"]');
              link?.click();
              await sleep(500);
            } else if (def.action === "openChat") await click('[data-tour="chat-open"]');
          }
        }
        if (!cancelled && nonce.current === myNonce) stop();
      } catch (error) {
        console.error("[demo] tour crashed", error);
        if (!cancelled) stop();
      }
    })();
    return () => {
      cancelled = true;
      nextRef.current = null;
    };
    // scenes run once per activation; nonce changes restart the loop (e.g. start again).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const steps = useMemo<Step[]>(
    () =>
      SCENES.map((def, index) => ({
        id: `demo-step-${index}`,
        target: def.target,
        title: def.title,
        content: def.text,
        skipBeacon: true,
        scrollDuration: 0,
        buttons: index === SCENES.length - 1 ? ["close", "skip"] : ["close", "primary", "skip"],
        dismissKeyAction: false,
        closeButtonAction: "skip",
        overlayClickAction: false,
        locale: { next: "Next", last: "Finish", skip: "Exit demo", close: "Exit demo" },
        primaryColor: "#8a8cff",
        zIndex: 16000,
      })),
    [],
  );
  const onEvent = useCallback(
    ({ type, action }: EventData) => {
      if (type === "step:after" && (action === "skip" || action === "close")) {
        stop();
      } else if (type === "step:after" && action === "next") {
        nextRef.current?.();
      }
    },
    [stop],
  );

  return (
    <TourContext.Provider value={{ active, start, stop }}>
      {children}
      {active && visible && (
        <Joyride
          // Fresh mount per scene: after route changes the old target elements are
          // unmounted, and reviving the same floating-ui instance recalculates at
          // (0,0) — a fresh instance recomputes geometry against the new page.
          key={scene}
          steps={steps}
          stepIndex={Math.min(scene, SCENES.length - 1)}
          run
          continuous
          scrollToFirstStep={false}
          onEvent={onEvent}
        />
      )}
    </TourContext.Provider>
  );
}
