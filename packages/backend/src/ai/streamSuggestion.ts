import Groq from "groq-sdk";
import * as Y from "yjs";
import type { Room } from "../rooms.js";
import type { UpdateOrigin } from "../server.js";

const SYSTEM_PROMPT =
  "Continue the following text naturally, in the same voice and tense, picking up exactly where it stops " +
  "(including a leading space if the text doesn't already end in whitespace, so it reads correctly when " +
  "concatenated directly onto the given text with no separator). Output only the continuation itself — no " +
  "preamble, no quotation marks, no restating what came before.";

const MODEL = "openai/gpt-oss-120b";

export interface StreamSuggestionArgs {
  groq: Groq;
  room: Room;
  requestId: string;
  cursorPosition: number;
  contextWindow: string;
  onToken: (token: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
  log: (msg: string) => void;
}

// Each AI-generated delta is inserted via a Yjs transaction tagged with an
// UpdateOrigin, so it flows through the exact same doc.on('update') -> broadcast
// -> Redis-publish pipeline as a human edit (see server.ts). We do not maintain
// a separate "AI text" rendering path on the client.
export async function streamSuggestion({
  groq,
  room,
  requestId,
  cursorPosition,
  contextWindow,
  onToken,
  onDone,
  onError,
  log,
}: StreamSuggestionArgs): Promise<void> {
  const clampedStart = Math.max(0, Math.min(cursorPosition, room.ytext.length));

  // Anchored as a Yjs relative position: this stays correct even as the
  // insertion point shifts (our own streamed tokens, or a concurrent edit
  // earlier in the document from another user) instead of drifting against a
  // fixed numeric index.
  let relPos = Y.createRelativePositionFromTypeIndex(room.ytext, clampedStart);

  const origin: UpdateOrigin = { userId: "ai", excludeConnId: undefined, fromRedis: false };

  try {
    const stream = await groq.chat.completions.create({
      model: MODEL,
      max_tokens: 1024,
      stream: true,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: contextWindow },
      ],
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (!delta) continue;

      const abs = Y.createAbsolutePositionFromRelativePosition(relPos, room.doc);
      const index = abs ? abs.index : room.ytext.length;

      room.doc.transact(() => {
        room.ytext.insert(index, delta);
      }, origin);

      relPos = Y.createRelativePositionFromTypeIndex(room.ytext, index + delta.length);
      onToken(delta);
    }

    log(`[ai-done] requestId=${requestId} room=${room.roomId}`);
    onDone();
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI request failed";
    log(`[ai-error] requestId=${requestId} room=${room.roomId} message=${message}`);
    onError(message);
  }
}
