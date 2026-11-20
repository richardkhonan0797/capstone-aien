import { useEffect, useRef, useState } from "react";
import { Mic, PhoneOff } from "lucide-react";
import { VoiceCall, type VoiceState } from "./voice";
import type { Message } from "./session";

const labels: Record<VoiceState, string> = {
  connecting: "Menghubungkan…",
  listening: "Silakan bicara",
  thinking: "Memeriksa katalog… Tunggu sebentar.",
  speaking: "Asisten menjawab…",
};
export function VoicePanel({
  disabled,
  onActive,
  onMessage,
}: {
  disabled: boolean;
  onActive: (active: boolean) => void;
  onMessage: (message: Message) => void;
}) {
  const [state, setState] = useState<VoiceState | null>(null);
  const [error, setError] = useState("");
  const call = useRef<VoiceCall | null>(null);
  useEffect(() => {
    const leave = () => {
      call.current?.stop();
      call.current = null;
      setState(null);
      onActive(false);
    };
    window.addEventListener("pagehide", leave);
    return () => {
      call.current?.stop();
      window.removeEventListener("pagehide", leave);
    };
  }, [onActive]);
  function stop() {
    call.current?.stop();
    call.current = null;
    setState(null);
    onActive(false);
  }
  function start() {
    if (call.current || disabled) return;
    setError("");
    onActive(true);
    setState("connecting");
    const session = new VoiceCall({
      state: setState,
      question: (text) =>
        onMessage({
          id: crypto.randomUUID(),
          role: "user",
          text: "🎙 " + text,
          time: new Date().toISOString(),
        }),
      reply: (reply) =>
        onMessage({
          id: crypto.randomUUID(),
          role: "assistant",
          text: reply.jawaban,
          reply,
          time: new Date().toISOString(),
        }),
      error: (message) => {
        stop();
        setError(message);
      },
    });
    call.current = session;
    void session.start();
  }
  return (
    <section className="voice-panel" aria-label="Asisten suara">
      <div className="voice-controls">
        <div>
          <strong>
            <Mic size={16} /> Tanya lewat suara{" "}
            <span className="voice-badge">Demo</span>
          </strong>
          <p role="status">
            {state
              ? labels[state]
              : "Tanya produk, stok, dan kebijakan. Pesanan melalui chat teks."}
          </p>
        </div>
        {state ? (
          <button type="button" className="button" onClick={stop}>
            <PhoneOff size={16} /> Akhiri
          </button>
        ) : (
          <button
            type="button"
            className="button"
            disabled={disabled}
            onClick={start}
          >
            <Mic size={16} /> Mulai suara
          </button>
        )}
      </div>
      {!state && (
        <p className="voice-help">
          Khusus presentasi owner.{" "}
          <a href="/dashboard/" target="_blank" rel="noreferrer">
            Login owner
          </a>{" "}
          terlebih dahulu. Suara yang terdengar dibuat oleh AI.
        </p>
      )}
      {error && (
        <p className="voice-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
