import { useEffect, useRef, useState } from "react";

// Leave a mark (§9): press M, give one word to the dark. It never arrives
// labeled. The mind will find it and puzzle over it forever.

export function MarkInput() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [word, setWord] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "m" && !open && !isTyping(e)) {
        setOpen(true);
        setStatus(null);
        setWord("");
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    const w = word.trim();
    if (!w) return;
    try {
      const res = await fetch("/api/mark", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ word: w }),
      });
      if (res.ok) {
        setStatus("it is out there now. it will be found.");
        window.setTimeout(() => setOpen(false), 2600);
      } else {
        const data = (await res.json()) as { error?: string };
        setStatus(data.error ?? "the dark refused it");
      }
    } catch {
      setStatus("the dark refused it");
    }
  };

  return (
    <div className="mark-overlay" onClick={() => setOpen(false)}>
      <div className="mark-box" onClick={(e) => e.stopPropagation()}>
        <div className="mark-title">leave one word in the dark</div>
        <input
          ref={inputRef}
          className="mark-input"
          value={word}
          maxLength={16}
          placeholder="one word"
          onChange={(e) => setWord(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
            e.stopPropagation();
          }}
        />
        <div className="mark-hint">{status ?? "it will never know it was you"}</div>
      </div>
    </div>
  );
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
}
