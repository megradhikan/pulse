import { useEffect, useState } from "react";
import { getCaretCoordinates } from "../lib/caretCoords";

interface CursorProps {
  textareaEl: HTMLTextAreaElement | null;
  position: number;
  displayName: string;
  color: string;
  text: string;
}

export function Cursor({ textareaEl, position, displayName, color, text }: CursorProps) {
  const [coords, setCoords] = useState<{ top: number; left: number; height: number } | null>(null);

  useEffect(() => {
    if (!textareaEl) return;
    const clamped = Math.max(0, Math.min(position, textareaEl.value.length));
    setCoords(getCaretCoordinates(textareaEl, clamped));
    // Re-measure whenever the underlying text changes too, since offsets
    // can shift meaning even if `position` itself didn't.
  }, [textareaEl, position, text]);

  if (!coords) return null;

  return (
    <div
      className="remote-cursor"
      style={{ top: coords.top, left: coords.left, height: coords.height, background: color }}
    >
      <span className="remote-cursor-label" style={{ background: color }}>
        {displayName}
      </span>
    </div>
  );
}
