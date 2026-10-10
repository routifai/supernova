import { cn } from "@nova/ui-web";
import { useEffect, useMemo, useState } from "react";
import {
  type ConversationDockApi,
  ConversationDockProvider,
  type DockComposerState,
} from "../../components/conversation-dock";
import { artifactPanelWidth } from "../../features/artifacts/ArtifactPanel";
import { DeckHeaderActions } from "../../features/decks/DeckHeaderActions";
import { DeckViewer } from "../../features/decks/DeckViewer";
import { useDeckEditing } from "../../features/decks/deck-ui-state";
import sample from "../../features/decks/edit/sample-deck.txt?raw";
import { setDeckThemeSources } from "../../lib/deck-themes";

const NAME = "sample.deck.html";

type DevWindow = Window & {
  __deckEdits?: unknown[];
  /** Replaces the page's deck source (a test loads a deck the engine's kit built). */
  __deckSetHtml?: (html: string) => void;
  /** The engine's theme dictionary, when a test provides it. */
  __deckThemes?: () => Promise<{ themes: never[]; defaultTheme: string }>;
  /** The theme id the engine reads from a deck's source (null when hand-made). */
  __deckTheme?: (html: string) => Promise<string | null>;
  /** What the engine would answer to a `set-theme` patch: the restyled source. */
  __deckRestyle?: (html: string, theme: string) => Promise<string>;
  /** What the docked composer sent (the conversation is a recorder here). */
  __deckAsks?: string[];
  /** Sets what the conversation's composer would show (a file waiting, an error); a file is
   * given by name. */
  __deckDock?: (patch: Partial<DockComposerState> & { files?: string[]; fail?: string }) => void;
  /** A theme's sample deck (the engine's kit builds it), for the theme preview. */
  __deckThemeSample?: (themeId: string) => Promise<string>;
};

/**
 * Dev-only route (`/dev/deck`, gated by `import.meta.env.DEV` in App.tsx): the deck viewer in the
 * artifact panel's width with the panel's real header buttons, the engine replaced by a recorder
 * (`window.__deckEdits`), so selecting, editing and switching themes can be driven in a real
 * browser without a session or engine. A test may hand it a kit-built deck, the theme dictionary
 * and a restyle function (`window.__deckSetHtml`, `__deckThemes`, `__deckRestyle`).
 */
export function DeckPreviewPage() {
  const editing = useDeckEditing(NAME);
  const [version, setVersion] = useState(1);
  const [html, setHtml] = useState(sample);
  // The conversation is a recorder: a sent message is kept, and a canned reply lands a moment
  // later; a test can set what the conversation's composer shows, or make the next send fail.
  const [reply, setReply] = useState<ConversationDockApi["reply"]>(null);
  const [state, setState] = useState<DockComposerState>({});
  const [running, setRunning] = useState(false);
  const [fail, setFail] = useState<string | null>(null);
  useEffect(() => {
    (window as DevWindow).__deckDock = ({ files, fail: next, ...patch }) => {
      if (next !== undefined) setFail(next || null);
      setState((current) => ({
        ...current,
        ...patch,
        ...(files
          ? {
              pendingAttachments: files.map((name) => ({
                id: name,
                threadKey: "dev",
                file: new File(["x"], name),
              })),
            }
          : {}),
      }));
    };
  }, []);
  const dock = useMemo<ConversationDockApi>(
    () => ({
      composer: {
        ...state,
        running,
        sending: false,
        onStop: async () => setRunning(false),
        onRemoveAttachment: (gone) =>
          setState((current) => ({
            ...current,
            pendingAttachments: current.pendingAttachments?.filter((a) => a.id !== gone.id),
          })),
        onDismissError: () => setState((current) => ({ ...current, sendError: null })),
      },
      reply,
      send: async (text) => {
        const dev = window as DevWindow;
        if (fail) {
          setState((current) => ({ ...current, sendError: fail }));
          return false;
        }
        dev.__deckAsks = [...(dev.__deckAsks ?? []), text];
        setState((current) => ({ ...current, pendingAttachments: [] }));
        setRunning(true);
        window.setTimeout(() => {
          setRunning(false);
          setReply({
            id: `reply-${Date.now()}`,
            text: "Done: I tightened the heading and kept the rest of the slide as it was. Version 2 is in the panel.",
          });
        }, 1200);
        return true;
      },
    }),
    [reply, running, state, fail],
  );
  // Read at call time: a run exposes the function after the page has loaded.
  useState(() =>
    setDeckThemeSources({
      sample: async (id) => {
        const dev = window as DevWindow;
        if (!dev.__deckThemeSample) throw new Error("no sample deck in this run");
        return dev.__deckThemeSample(id);
      },
    }),
  );
  useEffect(() => {
    const dev = window as DevWindow;
    dev.__deckSetHtml = (next) => {
      setHtml(next);
      setVersion(1);
    };
    return () => {
      dev.__deckSetHtml = undefined;
    };
  }, []);
  return (
    <div className="flex h-dvh justify-center bg-background p-2">
      <section
        data-testid="dev-panel"
        className={cn(
          "flex min-h-0 flex-col overflow-hidden rounded-[18px] border border-border bg-card motion-safe:transition-[width] motion-safe:duration-300 motion-safe:ease-out",
          artifactPanelWidth({ wide: true, expanded: editing }),
        )}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
          <div className="min-w-0 flex-1 truncate text-[14px] font-medium">{NAME}</div>
          <DeckHeaderActions
            deckKey={NAME}
            state={{ kind: "idle" }}
            onExport={() => undefined}
            onCancel={() => undefined}
            source={undefined}
          />
          <span data-testid="dev-version" className="text-[12px]">
            v{version}
          </span>
        </header>
        <div className="min-h-0 flex-1">
          <ConversationDockProvider value={dock}>
            <DeckViewer
              html={html}
              title={NAME}
              artifact={{ id: `v${version}`, version }}
              themesSource={async () => {
                const dev = window as DevWindow;
                if (dev.__deckThemes) return dev.__deckThemes();
                return { themes: [], defaultTheme: "" };
              }}
              themeSource={async () => {
                const dev = window as DevWindow;
                return dev.__deckTheme ? dev.__deckTheme(html) : null;
              }}
              editSource={async (input) => {
                const dev = window as DevWindow;
                dev.__deckEdits = [...(dev.__deckEdits ?? []), input];
                const theme = input.patches.find((patch) => patch.kind === "set-theme");
                if (theme?.kind === "set-theme" && dev.__deckRestyle) {
                  setHtml(await dev.__deckRestyle(html, theme.theme));
                }
                const full = input.patches.find((patch) => patch.kind === "set-full-source");
                if (full?.kind === "set-full-source") setHtml(full.source);
                setVersion(input.baseVersion + 1);
                return { id: `v${input.baseVersion + 1}`, version: input.baseVersion + 1 };
              }}
            />
          </ConversationDockProvider>
        </div>
      </section>
    </div>
  );
}
