import { useLingui } from "@lingui/react/macro";
import { Button } from "@nova/ui-web";
import { MessageSquare, X } from "lucide-react";
import { type MutableRefObject, useCallback, useEffect, useRef, useState } from "react";
import { Shimmer } from "../../../components/ai/primitives";
import { type DockReply, useConversationDock } from "../../../components/conversation-dock";
import { useComposerAttachment } from "../../../lib/composer-attachments";
import { Composer } from "../../../pages/muse/conversation/Composer";
import { buildDeckScope, DECK_ASK_KIND, startsWithDeckAsk } from "../deck-ask";

/**
 * Talk to Nova without leaving edit mode: the conversation's own composer, docked under the
 * stage. A selection rides along as its chip (the element request); with nothing selected the
 * message names the deck. Nova's answer shows as a short snippet above, with the way back to the
 * full conversation. Renders nothing outside a conversation.
 */
export function DeckDock({
  deck,
  focusRef,
  onOpenConversation,
  onSent,
}: {
  deck: { artifactId: string; name: string; version: number };
  /** Receives the function that puts the cursor in the composer. */
  focusRef: MutableRefObject<() => void>;
  onOpenConversation: () => void;
  /** A message went out (its chip went with it). */
  onSent?: () => void;
}) {
  const { t } = useLingui();
  const dock = useConversationDock();
  const chip = useComposerAttachment(DECK_ASK_KIND);
  const host = useRef<HTMLDivElement>(null);
  // The reply as it stood when the person asked. A different message, or the same one with new
  // text (a steered answer streams into Nova's current message), is the answer.
  const [asked, setAsked] = useState<{ before: DockReply | null } | null>(null);

  useEffect(() => {
    focusRef.current = () => host.current?.querySelector("textarea")?.focus();
    return () => {
      focusRef.current = () => {};
    };
  }, [focusRef]);

  const send = dock?.send;
  const before = dock?.reply ?? null;
  const { artifactId, name, version } = deck;
  const onSend = useCallback(
    async (text: string) => {
      if (!send) return false;
      const scoped = startsWithDeckAsk(text)
        ? text
        : `${buildDeckScope({ artifactId, name, version })}\n\n${text}`;
      const sent = await send(scoped);
      if (sent !== false) {
        setAsked({ before });
        onSent?.();
      }
      return sent;
    },
    [send, before, artifactId, name, version, onSent],
  );

  if (!dock) return null;
  const now = dock.reply;
  const reply =
    asked && now && (now.id !== asked.before?.id || now.text !== asked.before?.text) ? now : null;
  const { composer } = dock;
  // A failure shows in the composer's own error line, right where this snippet sits.
  const failed = Boolean(composer.sendError || composer.runError);
  const working = asked && !reply && !failed && (composer.running || composer.sending);

  return (
    <div ref={host} data-testid="deck-dock" className="relative w-full max-w-[560px]">
      {(reply && !failed) || working ? (
        <div
          role="status"
          data-testid="deck-dock-reply"
          className="absolute bottom-full z-20 mb-3 w-full max-w-[560px] rounded-2xl bg-popover/95 px-3.5 py-2.5 text-[13px] text-popover-foreground shadow-[0_8px_32px_rgb(0_0_0/0.14)] ring-1 ring-border backdrop-blur-xl motion-safe:animate-[deck-inspector-in_180ms_ease-out]"
        >
          {reply ? (
            <>
              <p className="line-clamp-3 whitespace-pre-line" dir="auto">
                {reply.text}
              </p>
              <div className="-mb-1 mt-1.5 flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-muted-foreground"
                  onClick={onOpenConversation}
                >
                  <MessageSquare />
                  {t`Open conversation`}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground"
                  aria-label={t`Dismiss`}
                  onClick={() => setAsked(null)}
                >
                  <X />
                </Button>
              </div>
            </>
          ) : (
            <Shimmer>{t`Working…`}</Shimmer>
          )}
        </div>
      ) : null}
      <div>
        <Composer
          museMode
          docked
          activeName=""
          placeholder={chip ? t`Ask Nova about this` : t`Ask Nova about this deck`}
          {...composer}
          onSend={onSend}
        />
      </div>
    </div>
  );
}
