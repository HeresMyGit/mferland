import { type ChatMessage } from "@mferland/shared";

export type ChatBubble = ChatMessage & {
  expiresAt: number;
  receivedAt: number;
};

export const CHAT_BUBBLE_TTL_MS = 4200;
