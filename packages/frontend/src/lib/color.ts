// Mirrors packages/backend/src/rooms.ts colorForUser so a user's own cursor
// color (rendered locally, never broadcast for self) matches the color the
// server assigns them when other clients render it.
const PALETTE = ["#4f46e5", "#059669", "#db2777", "#d97706", "#0891b2", "#7c3aed", "#dc2626", "#65a30d"];

export function colorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}
