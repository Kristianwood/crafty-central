"use client";

/* ============================================================
   Crafty Central — workspace state

   The client half of the old Store. It holds the same whole-app
   snapshot the vanilla build kept in memory, so every view reads
   from one place and a change anywhere re-renders everything that
   cares.

   Firestore used to push changes; now the snapshot is re-fetched
   on a timer and after every mutation. The timer stops while the
   tab is hidden and fires once on the way back, so a laptop left
   open overnight is not quietly polling until morning.
   ============================================================ */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "@/lib/client";
import { can as canRole, type Permission } from "@/lib/domain";
import type { Job, Person, Workspace } from "@/lib/types";

const POLL_MS = 8000;

export interface Toast {
  id: number;
  text: string;
  icon: string;
  leaving?: boolean;
}

interface PanelState {
  jobId: string | null;
  date: string | null;
  dayIdx: number;
}

interface WorkspaceContext {
  ws: Workspace;
  refreshing: boolean;
  refresh: () => Promise<void>;
  /** POST/PATCH/DELETE, then pull a fresh snapshot. */
  mutate: <T = unknown>(path: string, body?: unknown, method?: string) => Promise<T>;

  can: (perm: Permission) => boolean;
  person: (id: string) => Person | undefined;
  job: (id: string) => Job | undefined;

  toasts: Toast[];
  toast: (text: string, icon?: string) => void;

  panel: PanelState;
  /** The panel that is on its way out, so it keeps its contents
      while it slides off rather than emptying mid-animation. */
  closingPanel: PanelState | null;
  openJobPanel: (jobId: string, date?: string) => void;
  openDayPanel: (date: string) => void;
  closePanel: () => void;
  setPanelDay: (idx: number) => void;

  modal: React.ReactNode | null;
  openModal: (node: React.ReactNode) => void;
  closeModal: () => void;
}

const Ctx = createContext<WorkspaceContext | null>(null);

export function useWorkspace(): WorkspaceContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return ctx;
}

export function WorkspaceProvider({
  initial,
  children,
}: {
  initial: Workspace;
  children: React.ReactNode;
}) {
  const [ws, setWs] = useState<Workspace>(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [panel, setPanel] = useState<PanelState>({ jobId: null, date: null, dayIdx: 0 });
  const [closingPanel, setClosingPanel] = useState<PanelState | null>(null);
  const [modal, setModal] = useState<React.ReactNode | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    inFlight.current?.abort();
    const ac = new AbortController();
    inFlight.current = ac;
    setRefreshing(true);
    try {
      const next = await api<Workspace>("/api/workspace", { signal: ac.signal });
      setWs(next);
    } catch (err) {
      // A poll that fails is not worth shouting about — the next one
      // usually succeeds. A signed-out session is, though.
      if (err instanceof Error && err.name !== "AbortError") {
        // A hard navigation, not router.push: the session is gone, so the
        // server layout has to re-run and see that for itself.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        if ((err as { status?: number }).status === 401) window.location.href = "/login";
      }
    } finally {
      if (inFlight.current === ac) {
        inFlight.current = null;
        setRefreshing(false);
      }
    }
  }, []);

  /* Poll while the tab is visible; catch up as soon as it is again. */
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => void refresh(), POLL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refresh();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  const toast = useCallback((text: string, icon = "check") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, icon }]);
    setTimeout(() => {
      setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 320);
    }, 2600);
  }, []);

  const mutate = useCallback(
    async <T,>(path: string, body?: unknown, method = "POST"): Promise<T> => {
      try {
        const out = await api<T>(path, { method, body });
        await refresh();
        return out;
      } catch (err) {
        toast(err instanceof Error ? err.message : "That did not save", "alert");
        throw err;
      }
    },
    [refresh, toast],
  );

  const closePanel = useCallback(() => {
    // Hand the outgoing panel to `closingPanel` for the length of the
    // slide-out, then drop it. Doing this here rather than in an effect
    // inside the panel keeps it a plain event, with no cascading render.
    if (panel.jobId || panel.date) {
      setClosingPanel(panel);
      window.setTimeout(() => setClosingPanel(null), 420);
    }
    setPanel({ jobId: null, date: null, dayIdx: 0 });
  }, [panel]);

  const openJobPanel = useCallback(
    (jobId: string, date?: string) => {
      const j = ws.jobs.find((x) => x.id === jobId);
      const idx = date && j ? Math.max(0, j.shootDays.indexOf(date)) : 0;
      setPanel({ jobId, date: null, dayIdx: idx });
    },
    [ws.jobs],
  );

  const value = useMemo<WorkspaceContext>(
    () => ({
      ws,
      refreshing,
      refresh,
      mutate,
      can: (perm) => canRole(ws.me.role, perm),
      person: (id) => ws.people.find((p) => p.id === id),
      job: (id) => ws.jobs.find((j) => j.id === id),
      toasts,
      toast,
      panel,
      closingPanel,
      openJobPanel,
      openDayPanel: (date) => setPanel({ jobId: null, date, dayIdx: 0 }),
      closePanel,
      setPanelDay: (idx) => setPanel((p) => ({ ...p, dayIdx: idx })),
      modal,
      openModal: setModal,
      closeModal: () => setModal(null),
    }),
    [ws, refreshing, refresh, mutate, toasts, toast, panel, closingPanel, closePanel, openJobPanel, modal],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
