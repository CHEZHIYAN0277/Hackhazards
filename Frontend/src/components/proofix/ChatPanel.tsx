import { useState, useRef, useEffect } from "react";
import { Send, ChevronDown } from "lucide-react";
import { askChat } from "@/lib/runService";

interface Msg {
  role: "user" | "assistant";
  text: string;
}

type Mode = "idle" | "hover" | "open";

export function ChatPanel({
  runId,
  suggestions = ['Why validation failed?', 'Show blast radius', 'Root cause?', 'Why Draft PR?'],
}: {
  runId: string;
  /** Suggestion chips. Override per-run from the backend if desired. */
  suggestions?: string[];
}) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: "I'm reading the current evidence for this run. Ask me anything about what the agents found.",
    },
  ]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("idle");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === "open") {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, mode]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q) return;
    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setInput("");
    setMode("open");
    try {
      const reply = await askChat(runId, q);
      setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", text: "Sorry, I could not get a response." }]);
    }
  };

  const expanded = mode !== "idle";
  const showFullChat = mode === "open";

  return (
    <div className="pointer-events-none fixed bottom-0 z-30 left-0 lg:left-[176px] right-0 xl:right-[404px] px-4 pb-3">
      <section
        onMouseEnter={() => setMode((m) => (m === "idle" ? "hover" : m))}
        onMouseLeave={() => setMode((m) => (m === "hover" ? "idle" : m))}
        className="pointer-events-auto mx-auto max-w-[calc(1480px-176px-404px)] overflow-hidden rounded-2xl border border-border bg-surface/95 backdrop-blur shadow-[0_10px_30px_-12px_rgba(15,23,42,0.18)] transition-all duration-300"
      >
        {/* Expanded content (hover/open) */}
        <div
          className={`grid transition-all duration-300 ease-out ${
            expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            {showFullChat ? (
              <div
                ref={scrollRef}
                className="max-h-[180px] space-y-2 overflow-y-auto px-4 pt-3 pb-2"
              >
                {messages.map((m, i) => (
                  <div key={i} className="flex gap-2 text-[14px]">
                    <div
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-[9px] font-semibold ${
                        m.role === "user"
                          ? "bg-ink text-surface"
                          : "bg-accent text-accent-foreground"
                      }`}
                    >
                      {m.role === "user" ? "U" : "AI"}
                    </div>
                    <div className="min-w-0 flex-1 whitespace-pre-wrap leading-snug text-ink">
                      {m.text}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 pt-3 pb-2">
                <p className="mb-2 text-[13px] text-ink-soft">
                  I'm reading the current evidence for this run. Ask me anything about what the agents found.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => void send(s)}
                      className="rounded-full border border-border bg-surface px-2.5 py-1 text-[12px] text-ink-soft transition hover:border-primary/30 hover:text-ink"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Prompt bar (always visible) */}
        <div className="flex items-center gap-2 px-4 py-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="flex h-9 flex-1 items-center gap-2 rounded-full border border-border bg-surface-muted/60 px-4 transition focus-within:border-primary/40"
            onClick={() => {
              setMode("open");
              inputRef.current?.focus();
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => setMode("open")}
              placeholder="Ask about this run..."
              className="flex-1 bg-transparent text-[14px] text-ink placeholder:text-ink-soft focus:outline-none"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-surface transition disabled:opacity-30"
              aria-label="Send"
            >
              <Send className="h-3 w-3" />
            </button>
          </form>
          {showFullChat && (
            <button
              type="button"
              onClick={() => setMode("idle")}
              className="flex h-7 w-7 items-center justify-center rounded-full text-ink-soft hover:bg-surface-muted hover:text-ink"
              aria-label="Collapse chat"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
