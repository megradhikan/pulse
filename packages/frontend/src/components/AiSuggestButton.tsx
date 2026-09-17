interface AiSuggestButtonProps {
  onClick: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export function AiSuggestButton({ onClick, isStreaming, disabled }: AiSuggestButtonProps) {
  return (
    <button className="ai-suggest-btn" onClick={onClick} disabled={isStreaming || disabled}>
      {isStreaming ? "Generating…" : "Continue writing"}
      <span className="kbd">⌘J</span>
    </button>
  );
}
