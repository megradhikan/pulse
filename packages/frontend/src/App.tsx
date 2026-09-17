import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useParams } from "react-router-dom";
import { useYDoc } from "./hooks/useYDoc";
import { usePresence } from "./hooks/usePresence";
import { Editor } from "./components/Editor";
import { PresenceBar } from "./components/PresenceBar";
import { AiSuggestButton } from "./components/AiSuggestButton";
import { colorForUser } from "./lib/color";
import type { ServerMessage } from "./lib/protocol";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:3001";
const API_URL = WS_URL.replace(/^ws/, "http");
const CURSOR_THROTTLE_MS = 50;

function getOrCreateUserId(): string {
  const key = "pulse:userId";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = `u-${crypto.randomUUID()}`;
    sessionStorage.setItem(key, id);
  }
  return id;
}

function getOrCreateDisplayName(): string {
  const key = "pulse:displayName";
  let name = sessionStorage.getItem(key);
  if (!name) {
    name = `Guest-${Math.random().toString(36).slice(2, 6)}`;
  }
  return name;
}

function HomePage() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/rooms`, { method: "POST" });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = (await res.json()) as { roomId: string };
      navigate(`/room/${data.roomId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create room");
      setCreating(false);
    }
  };

  return (
    <div className="home">
      <h1>Pulse</h1>
      <p>A shared document workspace with live cursors and streaming AI suggestions.</p>
      <button className="ai-suggest-btn" onClick={handleCreate} disabled={creating}>
        {creating ? "Creating…" : "New document"}
      </button>
      {error && <p className="error-banner">{error}</p>}
    </div>
  );
}

function NamePrompt({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [name, setName] = useState(getOrCreateDisplayName());
  return (
    <div className="home">
      <h1>Join room</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = name.trim() || "Guest";
          sessionStorage.setItem("pulse:displayName", trimmed);
          onSubmit(trimmed);
        }}
      >
        <input
          className="name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          maxLength={40}
        />
        <button className="ai-suggest-btn" type="submit">
          Join
        </button>
      </form>
    </div>
  );
}

function RoomPage() {
  const { roomId = "" } = useParams();
  const [displayName, setDisplayName] = useState<string | null>(() => sessionStorage.getItem("pulse:displayName"));
  const userId = useRef(getOrCreateUserId()).current;

  if (!displayName) {
    return <NamePrompt onSubmit={setDisplayName} />;
  }

  return <RoomWorkspace roomId={roomId} userId={userId} displayName={displayName} />;
}

function RoomWorkspace({ roomId, userId, displayName }: { roomId: string; userId: string; displayName: string }) {
  const { ydoc, ytext, wsClient, status, initialPresence } = useYDoc(roomId, userId, displayName, WS_URL);
  const remoteUsers = usePresence(wsClient, initialPresence, userId);
  const [isStreaming, setIsStreaming] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const lastCursorSentAt = useRef(0);
  const pendingRequestId = useRef<string | null>(null);

  useEffect(() => {
    if (!wsClient) return;
    return wsClient.onMessage((msg: ServerMessage) => {
      if (msg.type === "ai-done" && msg.requestId === pendingRequestId.current) {
        setIsStreaming(false);
        pendingRequestId.current = null;
      } else if (msg.type === "ai-error") {
        setIsStreaming(false);
        pendingRequestId.current = null;
        setAiError(msg.message);
        setTimeout(() => setAiError(null), 6000);
      }
    });
  }, [wsClient]);

  const handleCursorMove = useCallback(
    (position: number, selectionStart: number, selectionEnd: number) => {
      if (!wsClient) return;
      const now = Date.now();
      if (now - lastCursorSentAt.current < CURSOR_THROTTLE_MS) return;
      lastCursorSentAt.current = now;
      wsClient.send({ type: "cursor", roomId, userId, position, selectionStart, selectionEnd });
    },
    [wsClient, roomId, userId]
  );

  const cursorPositionRef = useRef(0);
  const handleCursorMoveTracked = useCallback(
    (position: number, selectionStart: number, selectionEnd: number) => {
      cursorPositionRef.current = position;
      handleCursorMove(position, selectionStart, selectionEnd);
    },
    [handleCursorMove]
  );

  const handleTriggerAi = useCallback(() => {
    if (isStreaming || !wsClient) return;
    const cursorPosition = cursorPositionRef.current;
    const fullText = ytext.toString();
    const contextWindow = fullText.slice(Math.max(0, cursorPosition - 2000), cursorPosition);
    setIsStreaming(true);
    pendingRequestId.current = "pending"; // resolved to the real id by the server's ai-token/ai-done frames
    wsClient.send({ type: "ai-request", roomId, userId, cursorPosition, contextWindow });
  }, [isStreaming, ytext, roomId, userId, wsClient]);

  // Track the real requestId as soon as the first ai-token/ai-done/ai-error
  // for this request arrives, so completion detection above is accurate.
  useEffect(() => {
    if (!wsClient) return;
    return wsClient.onMessage((msg: ServerMessage) => {
      if ((msg.type === "ai-token" || msg.type === "ai-done" || msg.type === "ai-error") && isStreaming) {
        if (pendingRequestId.current === "pending") {
          pendingRequestId.current = msg.requestId;
        }
      }
    });
  }, [wsClient, isStreaming]);

  return (
    <div className="room">
      <PresenceBar
        selfName={displayName}
        selfColor={colorForUser(userId)}
        remoteUsers={remoteUsers}
        status={status}
        roomId={roomId}
      />
      <div className="editor-toolbar">
        <AiSuggestButton onClick={handleTriggerAi} isStreaming={isStreaming} />
        {aiError && <span className="error-banner">AI error: {aiError}</span>}
      </div>
      <Editor
        ydoc={ydoc}
        ytext={ytext}
        remoteUsers={remoteUsers}
        onCursorMove={handleCursorMoveTracked}
        onTriggerAi={handleTriggerAi}
      />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/room/:roomId" element={<RoomPage />} />
      </Routes>
    </BrowserRouter>
  );
}
