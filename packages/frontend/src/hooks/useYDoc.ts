import { useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import { WsClient, type ConnectionStatus } from "../lib/wsClient";
import type { PresenceSnapshot, ServerMessage } from "../lib/protocol";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export interface UseYDocResult {
  ydoc: Y.Doc;
  ytext: Y.Text;
  wsClient: WsClient | null;
  status: ConnectionStatus;
  initialPresence: PresenceSnapshot[];
}

// Sets up a Y.Doc + WebSocket connection for a room. The Y.Doc is created
// once per room and kept alive across reconnects (Yjs is offline-first:
// local edits made while disconnected are preserved and merge automatically
// once a fresh 'sync' is applied) — we never recreate or discard it on
// reconnect, per section 6.3.
//
// The WsClient itself is created and torn down entirely *inside* the
// effect below (not via useMemo/useState-initializer at render time).
// React 18 StrictMode mounts every effect, runs its cleanup, then mounts it
// again in dev to catch non-idempotent effects. A WebSocket opened during
// render and only closed via effect cleanup would get permanently killed
// by that first synthetic mount->cleanup pass (close() disables reconnect)
// before the second, real mount ever gets a working connection. Owning the
// whole lifecycle inside the effect means each mount/cleanup pass gets its
// own fresh client, which is what makes this correct under StrictMode.
export function useYDoc(
  roomId: string,
  userId: string,
  displayName: string,
  wsUrl: string
): UseYDocResult {
  const ydoc = useMemo(() => new Y.Doc(), [roomId]);
  const ytext = useMemo(() => ydoc.getText("content"), [ydoc]);
  const [wsClient, setWsClient] = useState<WsClient | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [initialPresence, setInitialPresence] = useState<PresenceSnapshot[]>([]);

  useEffect(() => {
    const client = new WsClient(wsUrl);
    setWsClient(client);
    setStatus(client.getStatus());

    const offStatus = client.onStatusChange((s) => {
      setStatus(s);
      if (s === "open") {
        // Sent on first open AND every reconnect — server treats a re-join
        // as idempotent and responds with a fresh 'sync'.
        client.send({ type: "join", roomId, userId, displayName });
      }
    });

    const offMessage = client.onMessage((msg: ServerMessage) => {
      if (msg.type === "sync") {
        Y.applyUpdate(ydoc, fromBase64(msg.docState), "remote");
        setInitialPresence(msg.presence);
      } else if (msg.type === "doc-update") {
        Y.applyUpdate(ydoc, fromBase64(msg.update), "remote");
      }
    });

    const updateHandler = (update: Uint8Array, origin: unknown) => {
      if (origin === "remote") return; // don't echo back updates we just applied
      client.send({ type: "doc-update", roomId, update: toBase64(update) });
    };
    ydoc.on("update", updateHandler);

    const handleBeforeUnload = () => {
      client.send({ type: "leave", roomId, userId });
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      offStatus();
      offMessage();
      ydoc.off("update", updateHandler);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      client.send({ type: "leave", roomId, userId });
      client.close();
      setWsClient((current) => (current === client ? null : current));
    };
  }, [wsUrl, ydoc, roomId, userId, displayName]);

  return { ydoc, ytext, wsClient, status, initialPresence };
}
