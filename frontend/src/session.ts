import type { ChatReply } from "./api";
export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  time: string;
  image?: string;
  hadImage?: boolean;
  reply?: ChatReply;
  uncertain?: boolean;
}
export interface Conversation {
  id: string;
  messages: Message[];
}
export const STORAGE_KEY = "senja-chat-v1";
export function freshConversation(): Conversation {
  return { id: "web-" + crypto.randomUUID(), messages: [] };
}
export function loadConversation(
  storage: Pick<Storage, "getItem">,
): Conversation {
  try {
    const saved: unknown = JSON.parse(storage.getItem(STORAGE_KEY) || "null");
    if (saved && typeof saved === "object") {
      const c = saved as Conversation;
      if (
        /^web-[\da-f-]{36}$/i.test(c.id) &&
        Array.isArray(c.messages) &&
        c.messages.every(
          (m) =>
            typeof m.id === "string" &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.text === "string" &&
            typeof m.time === "string" &&
            Number.isFinite(Date.parse(m.time)),
        )
      ) {
        // Restore display-only data. Never trust saved response fields as API results.
        return {
          id: c.id,
          messages: c.messages
            .slice(-100)
            .map((m) => ({
              id: m.id,
              role: m.role,
              text: m.text,
              time: m.time,
              hadImage: !!m.hadImage,
              uncertain: !!m.uncertain,
            })),
        };
      }
    }
  } catch {
    /* Private browsing and corrupt storage must not prevent chatting. */
  }
  return freshConversation();
}
export function saveConversation(
  storage: Pick<Storage, "setItem">,
  c: Conversation,
): boolean {
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        id: c.id,
        messages: c.messages
          .slice(-100)
          .map(({ image, reply, ...m }) => ({
            ...m,
            hadImage: !!image || !!m.hadImage,
            text: reply?.sumber.length
              ? `${m.text}\n\nSumber: ${reply.sumber.join(" · ")}`
              : m.text,
          })),
      }),
    );
    return true;
  } catch {
    return false;
  }
}
