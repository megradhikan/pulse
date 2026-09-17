import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import type { RemoteUser } from "../hooks/usePresence";
import { Cursor } from "./Cursor";

interface EditorProps {
  ydoc: Y.Doc;
  ytext: Y.Text;
  remoteUsers: RemoteUser[];
  onCursorMove: (position: number, selectionStart: number, selectionEnd: number) => void;
  onTriggerAi: () => void;
}

// Binds a plain <textarea> to a Y.Text using a minimal diff (common
// prefix/suffix) between the old and new value, rather than replacing the
// whole text on every keystroke — this is what lets concurrent edits
// (including AI-streamed text) merge via Yjs's CRDT instead of one writer's
// keystrokes clobbering another's. Local caret position is tracked as a Yjs
// relative position so it stays correct when remote text is inserted
// earlier in the document while this user is mid-edit.
export function Editor({ ydoc, ytext, remoteUsers, onCursorMove, onTriggerAi }: EditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [, forceRerender] = useState(0);
  const [value, setValue] = useState(() => ytext.toString());
  const caretRelPos = useRef<Y.RelativePosition | null>(null);
  const isLocalChange = useRef(false);

  useEffect(() => {
    const observer = () => {
      if (isLocalChange.current) {
        isLocalChange.current = false;
        return;
      }
      const newValue = ytext.toString();
      setValue(newValue);

      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (!ta || !caretRelPos.current) return;
        const abs = Y.createAbsolutePositionFromRelativePosition(caretRelPos.current, ydoc);
        const index = abs ? abs.index : newValue.length;
        ta.selectionStart = ta.selectionEnd = index;
      });
    };
    ytext.observe(observer);
    return () => ytext.unobserve(observer);
  }, [ytext, ydoc]);

  const captureCaret = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    caretRelPos.current = Y.createRelativePositionFromTypeIndex(ytext, ta.selectionStart);
  }, [ytext]);

  const handleSelect = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    captureCaret();
    onCursorMove(ta.selectionStart, ta.selectionStart, ta.selectionEnd);
  }, [captureCaret, onCursorMove]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const oldValue = value;
    if (newValue === oldValue) return;

    let start = 0;
    const minLen = Math.min(oldValue.length, newValue.length);
    while (start < minLen && oldValue[start] === newValue[start]) start++;
    let oldEnd = oldValue.length;
    let newEnd = newValue.length;
    while (oldEnd > start && newEnd > start && oldValue[oldEnd - 1] === newValue[newEnd - 1]) {
      oldEnd--;
      newEnd--;
    }

    isLocalChange.current = true;
    ydoc.transact(() => {
      if (oldEnd > start) ytext.delete(start, oldEnd - start);
      if (newEnd > start) ytext.insert(start, newValue.slice(start, newEnd));
    }, "local");

    setValue(newValue);
    captureCaret();
    handleSelect();
  };

  const handleContinueWriting = () => {
    onTriggerAi();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
      e.preventDefault();
      handleContinueWriting();
    }
  };

  // Re-measure remote cursor overlays on scroll (their pixel position
  // depends on textarea scrollTop/scrollLeft).
  const handleScroll = () => forceRerender((n) => n + 1);

  return (
    <div className="editor-wrap">
      <textarea
        ref={textareaRef}
        className="editor"
        value={value}
        onChange={handleChange}
        onSelect={handleSelect}
        onKeyUp={handleSelect}
        onClick={handleSelect}
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
        spellCheck={false}
        placeholder="Start typing, or press ⌘J to let AI continue writing…"
      />
      {remoteUsers.map((u) => (
        <Cursor
          key={u.userId}
          textareaEl={textareaRef.current}
          position={u.position}
          displayName={u.displayName}
          color={u.color}
          text={value}
        />
      ))}
    </div>
  );
}
