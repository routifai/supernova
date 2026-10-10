import { useLingui } from "@lingui/react/macro";
import { Button, cn } from "@nova/ui-web";
import { Redo2, Undo2 } from "lucide-react";
import { type MutableRefObject, type ReactNode, useCallback, useEffect, useRef } from "react";
import {
  setComposerAttachment,
  useComposerAttachAvailable,
  useComposerAttachment,
} from "../../../lib/composer-attachments";
import { RAIL_OPEN_W, RAIL_SLIM_W } from "../DeckRail";
import { buildDeckAsk, DECK_ASK_KIND } from "../deck-ask";
import { setDeckEditing } from "../deck-ui-state";
import { DeckDock } from "./DeckDock";
import { EditStage } from "./EditStage";
import { targetLabel } from "./edit-model";
import { EditNoticeBanner, StylePanel } from "./StylePanel";
import { type DeckEditSource, type PostToFrame, useDeckEditor } from "./useDeckEditor";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Edit mode of a deck: the stage with the edit bridge and the style panel. `bar` is the viewer's
 * slide navigation, kept under the stage. The deck's own source is never touched here; every
 * change goes through `useDeckEditor` as patches the engine applies.
 */
export function DeckEditor({
  artifact,
  html,
  title,
  active,
  frameRef,
  bar,
  onEdited,
  source,
}: {
  artifact: { id: string; version: number };
  html: string;
  title: string;
  active: number;
  frameRef: MutableRefObject<HTMLIFrameElement | null>;
  bar: ReactNode;
  onEdited?: (artifactId: string) => void;
  source?: DeckEditSource;
}) {
  const { t } = useLingui();
  const postRef = useRef<PostToFrame>(() => {});
  const post = useCallback<PostToFrame>((message) => postRef.current(message), []);
  const editor = useDeckEditor({
    deckKey: title,
    artifactId: artifact.id,
    version: artifact.version,
    html,
    onEdited,
    post,
    source,
  });
  const canAsk = useComposerAttachAvailable();
  const focusDock = useRef<() => void>(() => {});

  // Undo / redo from the keyboard while focus is outside the frame (the bridge covers inside).
  const { undo, redo } = editor;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        void (event.shiftKey ? redo() : undo());
      } else if (key === "y") {
        event.preventDefault();
        void redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // The selection rides along with the next message as its chip (the element request). Removing
  // the chip keeps it off for that selection; a new selection, or Ask Nova, brings it back.
  const attached = useComposerAttachment(DECK_ASK_KIND);
  const attachedFor = useRef<string | null>(null);
  const dismissed = useRef<string | null>(null);
  const selection = editor.targets.map((x) => x.id).join(",");
  const attach = useCallback(() => {
    const list = editor.targets;
    if (!list.length) return;
    const words = {
      slide: t`Slide`,
      heading: t`Heading`,
      text: t`Text`,
      image: t`Image`,
      link: t`Link`,
      box: t`Box`,
    };
    const request = buildDeckAsk({
      artifactId: editor.head.current.id,
      name: title,
      version: editor.head.current.version,
      noun: (n) => t`${n} elements`,
      elements: list.map((target) => ({
        id: target.id,
        label: targetLabel(target, words),
        slide: target.slide,
        text: target.text,
        style: target.computed,
        note: "",
      })),
    });
    attachedFor.current = list.map((x) => x.id).join(",");
    setComposerAttachment(DECK_ASK_KIND, request);
  }, [editor.targets, editor.head, title, t]);
  useEffect(() => {
    if (attached || !attachedFor.current) return;
    dismissed.current = attachedFor.current;
    attachedFor.current = null;
  }, [attached]);
  // What the store holds now (a failed send puts the chip back after this editor let it go).
  const attachedNow = useRef(attached);
  attachedNow.current = attached;
  useEffect(() => {
    if (!selection) {
      dismissed.current = null;
      attachedFor.current = null;
      if (attachedNow.current) setComposerAttachment(DECK_ASK_KIND, null);
      return;
    }
    if (dismissed.current === selection) return;
    dismissed.current = null;
    attach();
  }, [selection, attach]);
  // A sent message took the chip; the selection is still the context of the next one.
  const reattach = useCallback(() => {
    dismissed.current = null;
    attach();
  }, [attach]);
  const ask = useCallback(() => {
    reattach();
    focusDock.current();
  }, [reattach]);
  // The Ask Nova button on the selection itself.
  const askRequest = editor.askRequest;
  const handledAsk = useRef(askRequest);
  useEffect(() => {
    if (askRequest === handledAsk.current) return;
    handledAsk.current = askRequest;
    ask();
  }, [askRequest, ask]);
  // Leaving edit mode takes its attachment with it.
  useEffect(() => () => setComposerAttachment(DECK_ASK_KIND, null), []);

  const selected = editor.targets.length > 0;
  return (
    <div className="@container relative flex min-w-0 flex-1">
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1">
          <EditStage
            html={html}
            title={title}
            reloadKey={editor.reloadKey}
            active={active}
            selectedIds={editor.selectedIds}
            chipInset={RAIL_OPEN_W - RAIL_SLIM_W + 8}
            frameRef={frameRef}
            postRef={postRef}
            onMessage={editor.onFrameMessage}
          />
          {editor.notice ? (
            <div className="pointer-events-none absolute inset-x-3 bottom-2 z-10 flex justify-center">
              <div className="pointer-events-auto">
                <EditNoticeBanner
                  notice={editor.notice}
                  targets={editor.targets}
                  canAsk={canAsk}
                  onAsk={ask}
                  onDismissNotice={editor.dismissNotice}
                />
              </div>
            </div>
          ) : null}
        </div>
        {/* One bottom bar: undo and redo, the composer, the slide controls. */}
        <div className="relative flex shrink-0 items-end gap-1 border-t border-border px-2 py-2">
          <div data-testid="deck-edit-toolbar" className="flex h-12 shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label={t`Undo`}
              title={t`Undo`}
              disabled={!editor.canUndo || editor.saving}
              onClick={() => void editor.undo()}
            >
              <Undo2 />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label={t`Redo`}
              title={t`Redo`}
              disabled={!editor.canRedo || editor.saving}
              onClick={() => void editor.redo()}
            >
              <Redo2 />
            </Button>
          </div>
          <div className="relative flex min-w-0 flex-1 justify-center">
            <DeckDock
              deck={{
                artifactId: editor.head.current.id,
                name: title,
                version: editor.head.current.version,
              }}
              focusRef={focusDock}
              onOpenConversation={() => setDeckEditing(title, false)}
              onSent={reattach}
            />
          </div>
          <div className="flex h-12 shrink-0 items-center">{bar}</div>
        </div>
      </div>
      {/* From 760px of editor width the inspector is a column of its own for the whole edit
          session (empty state, then the selection's controls), so the stage never reflows and
          nothing is covered; it scrolls within the column. Narrower, it floats over the stage's
          top end only while something is selected, clear of the composer and the slide bar. */}
      <div
        data-testid="deck-inspector"
        className={cn(
          "absolute end-2 top-2 z-20 flex max-h-[calc(100%-10rem)] w-[min(300px,calc(100%-1rem))]",
          "@[760px]:static @[760px]:max-h-none @[760px]:w-[276px] @[760px]:shrink-0 @[760px]:py-3 @[760px]:pe-3 @[1000px]:w-[288px] @[1200px]:w-[312px]",
          selected ? "" : "@max-[759px]:hidden",
        )}
      >
        <StylePanel
          targets={editor.targets}
          theme={editor.theme}
          slideCount={editor.theme?.slideCount ?? 0}
          onStyle={(changes, mode) => editor.applyStyle(changes, mode)}
          onAttributes={editor.setAttributes}
          onCommit={() => {
            editor.finishText();
            void editor.flush();
          }}
          onClose={() => post({ type: "nova:edit-select", ids: [] })}
          onRemove={editor.remove}
          onDuplicate={editor.duplicate}
          canAsk={canAsk}
          onAsk={ask}
        />
      </div>
    </div>
  );
}
