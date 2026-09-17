import { useEffect, useState } from "react";
import type { WsClient } from "../lib/wsClient";
import type { PresenceSnapshot, ServerMessage } from "../lib/protocol";

export interface RemoteUser {
  userId: string;
  displayName: string;
  position: number;
  color: string;
}

// Tracks remote cursor/user state from 'cursor', 'user-joined', and
// 'user-left' broadcasts, seeded from the initial 'sync' presence snapshot.
export function usePresence(
  wsClient: WsClient | null,
  initialPresence: PresenceSnapshot[],
  selfUserId: string
): RemoteUser[] {
  const [users, setUsers] = useState<Map<string, RemoteUser>>(new Map());

  useEffect(() => {
    setUsers((prev) => {
      const next = new Map(prev);
      for (const p of initialPresence) {
        if (p.userId === selfUserId) continue;
        next.set(p.userId, { userId: p.userId, displayName: p.displayName, position: p.position, color: p.color });
      }
      return next;
    });
  }, [initialPresence, selfUserId]);

  useEffect(() => {
    if (!wsClient) return;
    return wsClient.onMessage((msg: ServerMessage) => {
      if (msg.type === "cursor" && msg.userId !== selfUserId) {
        setUsers((prev) => {
          const next = new Map(prev);
          next.set(msg.userId, {
            userId: msg.userId,
            displayName: msg.displayName,
            position: msg.position,
            color: msg.color,
          });
          return next;
        });
      } else if (msg.type === "user-joined" && msg.userId !== selfUserId) {
        setUsers((prev) => {
          if (prev.has(msg.userId)) return prev;
          const next = new Map(prev);
          next.set(msg.userId, { userId: msg.userId, displayName: msg.displayName, position: 0, color: "#94a3b8" });
          return next;
        });
      } else if (msg.type === "user-left") {
        setUsers((prev) => {
          if (!prev.has(msg.userId)) return prev;
          const next = new Map(prev);
          next.delete(msg.userId);
          return next;
        });
      }
    });
  }, [wsClient, selfUserId]);

  return Array.from(users.values());
}
