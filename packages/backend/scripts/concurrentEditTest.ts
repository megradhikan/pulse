// Section 10.2: the single most important correctness test in the project.
//
// Opens two raw WebSocket connections to the same room, has both insert a
// distinct, known string at the same position at (nearly) the same time, then
// asserts both connections' locally-applied Yjs docs converge to an identical
// final string containing both inserted strings in full, none lost, none
// duplicated, none corrupted.
//
// Requires the backend server to already be running (pnpm dev:backend).
import WebSocket from "ws";
import * as Y from "yjs";
import { randomUUID } from "node:crypto";
import type { ClientMessage, ServerMessage } from "../src/protocol.js";

const WS_URL = process.env.WS_URL ?? "ws://localhost:3001";
const ROOM_ID = `test-concurrent-${Date.now()}`;
const MARKER_A = "AAAAAAAAAA_FROM_CLIENT_A";
const MARKER_B = "BBBBBBBBBB_FROM_CLIENT_B";

interface ClientHandle {
  ws: WebSocket;
  doc: Y.Doc;
  ytext: Y.Text;
  synced: Promise<void>;
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
function fromBase64(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

function connectClient(userId: string, displayName: string): ClientHandle {
  const ws = new WebSocket(WS_URL);
  const doc = new Y.Doc();
  const ytext = doc.getText("content");

  let resolveSynced: () => void;
  const synced = new Promise<void>((resolve) => (resolveSynced = resolve));

  doc.on("update", (update: Uint8Array, origin: unknown) => {
    if (origin === "remote") return;
    const msg: ClientMessage = { type: "doc-update", roomId: ROOM_ID, update: toBase64(update) };
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  });

  ws.on("open", () => {
    const joinMsg: ClientMessage = { type: "join", roomId: ROOM_ID, userId, displayName };
    ws.send(JSON.stringify(joinMsg));
  });

  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString()) as ServerMessage;
    if (msg.type === "sync") {
      Y.applyUpdate(doc, fromBase64(msg.docState), "remote");
      resolveSynced();
    } else if (msg.type === "doc-update") {
      Y.applyUpdate(doc, fromBase64(msg.update), "remote");
    }
  });

  return { ws, doc, ytext, synced };
}

async function main() {
  console.log(`[test] room=${ROOM_ID} ws=${WS_URL}`);

  const clientA = connectClient(`u-${randomUUID()}`, "Client A");
  const clientB = connectClient(`u-${randomUUID()}`, "Client B");

  await Promise.all([clientA.synced, clientB.synced]);
  console.log("[test] both clients synced on empty doc");

  // Fire both inserts as close to simultaneously as possible.
  clientA.doc.transact(() => clientA.ytext.insert(0, MARKER_A), "local");
  clientB.doc.transact(() => clientB.ytext.insert(0, MARKER_B), "local");

  // Give the server + redis fanout time to converge both clients.
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const finalA = clientA.ytext.toString();
  const finalB = clientB.ytext.toString();

  clientA.ws.close();
  clientB.ws.close();

  console.log(`[test] finalA (len=${finalA.length}): ${JSON.stringify(finalA)}`);
  console.log(`[test] finalB (len=${finalB.length}): ${JSON.stringify(finalB)}`);

  const converged = finalA === finalB;
  const containsA = finalA.includes(MARKER_A);
  const containsB = finalA.includes(MARKER_B);
  const expectedLength = MARKER_A.length + MARKER_B.length;
  const noCorruption = finalA.length === expectedLength;

  const pass = converged && containsA && containsB && noCorruption;

  console.log("---");
  console.log(`converged both clients identical: ${converged}`);
  console.log(`contains marker A: ${containsA}`);
  console.log(`contains marker B: ${containsB}`);
  console.log(`no lost/duplicated content (length check): ${noCorruption} (expected ${expectedLength}, got ${finalA.length})`);
  console.log(pass ? "PASS" : "FAIL");

  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error("[test] error", err);
  process.exit(1);
});
