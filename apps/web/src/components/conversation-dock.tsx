import type { ThreadMessage } from "@nova/contracts";
import { type ComponentProps, createContext, useContext } from "react";
import { copyableMessageText } from "../lib/message-text";
import type { Composer } from "../pages/muse/conversation/Composer";

/** The newest reply in the conversation, as plain text; null while the person's message is the
 * newest (Nova has not answered it yet). */
export type DockReply = { id: string; text: string };

/** What the conversation's composer shows that a message carries or reports (files waiting to
 * go, the reply being quoted, upload progress, errors, Stop), so a docked composer shows the
 * same and nothing is sent unseen. */
export type DockComposerState = Partial<
  Pick<
    ComponentProps<typeof Composer>,
    | "running"
    | "sending"
    | "disabled"
    | "onStop"
    | "pendingAttachments"
    | "onRemoveAttachment"
    | "onRetryAttachment"
    | "attachmentNotice"
    | "uploadStatus"
    | "sendError"
    | "runError"
    | "runErrorId"
    | "onRunErrorPresented"
    | "onDismissError"
    | "replyTarget"
    | "replyQuote"
    | "replyTargetName"
    | "onClearReply"
  >
>;

/**
 * A surface that hides the conversation (a deck in edit mode) can still talk in it: the same
 * send path and composer state the conversation's composer has, and the newest reply. The
 * Shell provides it around the conversation's artifact panel only.
 */
export type ConversationDockApi = {
  send: (text: string) => Promise<boolean>;
  composer: DockComposerState & { sending: boolean; running: boolean };
  reply: DockReply | null;
};

const DockContext = createContext<ConversationDockApi | null>(null);
export const ConversationDockProvider = DockContext.Provider;
export const useConversationDock = () => useContext(DockContext);

/** The newest reply of the thread (see `DockReply`). */
export function latestDockReply(messages: readonly ThreadMessage[]): DockReply | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message) continue;
    if (message.role === "user") return null;
    if (message.role !== "bot") continue;
    const text = copyableMessageText(message);
    if (text) return { id: message.id, text };
  }
  return null;
}
