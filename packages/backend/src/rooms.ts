import * as Y from "yjs";
import type { WebSocket } from "ws";
import type { PresenceSnapshot } from "./protocol.js";

export interface Connection {
  connId: string;
  ws: WebSocket;
  userId: string;
}

export interface Room {
  roomId: string;
  doc: Y.Doc;
  ytext: Y.Text;
  connections: Map<string, Connection>;
  presence: Map<string, PresenceSnapshot>;
  evictionTimer: ReturnType<typeof setTimeout> | null;
}

const EVICTION_MS = 10 * 60 * 1000;
const rooms = new Map<string, Room>();

const COLOR_PALETTE = [
  "#4f46e5",
  "#059669",
  "#db2777",
  "#d97706",
  "#0891b2",
  "#7c3aed",
  "#dc2626",
  "#65a30d",
];

export function colorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return COLOR_PALETTE[hash % COLOR_PALETTE.length];
}

export function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId);
}

export function getOrCreateRoom(roomId: string): Room {
  const existing = rooms.get(roomId);
  if (existing) {
    if (existing.evictionTimer) {
      clearTimeout(existing.evictionTimer);
      existing.evictionTimer = null;
    }
    return existing;
  }
  const doc = new Y.Doc();
  const room: Room = {
    roomId,
    doc,
    ytext: doc.getText("content"),
    connections: new Map(),
    presence: new Map(),
    evictionTimer: null,
  };
  rooms.set(roomId, room);
  return room;
}

export function scheduleEvictionIfEmpty(
  roomId: string,
  onEvict: (roomId: string) => void
): void {
  const room = rooms.get(roomId);
  if (!room || room.connections.size > 0) return;
  if (room.evictionTimer) clearTimeout(room.evictionTimer);
  room.evictionTimer = setTimeout(() => {
    rooms.delete(roomId);
    onEvict(roomId);
  }, EVICTION_MS);
}

export function getRoomCount(): number {
  return rooms.size;
}
