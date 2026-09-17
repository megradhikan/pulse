// Shared WebSocket message protocol. Mirrored by hand in
// packages/frontend/src/lib/protocol.ts — keep the two files in sync.

export type ClientMessage =
  | { type: "join"; roomId: string; userId: string; displayName: string }
  | { type: "doc-update"; roomId: string; update: string }
  | {
      type: "cursor";
      roomId: string;
      userId: string;
      position: number;
      selectionStart: number;
      selectionEnd: number;
    }
  | {
      type: "ai-request";
      roomId: string;
      userId: string;
      cursorPosition: number;
      contextWindow: string;
    }
  | { type: "leave"; roomId: string; userId: string };

export interface PresenceSnapshot {
  userId: string;
  displayName: string;
  position: number;
  color: string;
}

export type ServerMessage =
  | { type: "sync"; roomId: string; docState: string; presence: PresenceSnapshot[] }
  | { type: "doc-update"; roomId: string; update: string; sourceUserId: string }
  | {
      type: "cursor";
      roomId: string;
      userId: string;
      displayName: string;
      position: number;
      color: string;
    }
  | { type: "user-joined"; roomId: string; userId: string; displayName: string }
  | { type: "user-left"; roomId: string; userId: string }
  | { type: "ai-token"; roomId: string; requestId: string; token: string }
  | { type: "ai-done"; roomId: string; requestId: string }
  | { type: "ai-error"; roomId: string; requestId: string; message: string }
  | { type: "error"; message: string };
