import { request, sendChat, type ChatReply } from "./api";

export type VoiceState = "connecting" | "listening" | "thinking" | "speaking";
export function parseToken(raw: unknown) {
  const t = raw as {
    value?: unknown;
    expires_at?: unknown;
    model?: unknown;
  } | null;
  if (
    !t ||
    typeof t.value !== "string" ||
    !t.value ||
    typeof t.expires_at !== "number" ||
    t.expires_at * 1000 <= Date.now() ||
    typeof t.model !== "string"
  )
    throw new Error("Token suara tidak valid atau sudah kedaluwarsa.");
  return { value: t.value, expires_at: t.expires_at, model: t.model };
}

// One call ID is executed at most once. No retries: the existing agent has tools
// that can write data, even though this demo asks only informational questions.
export class VoiceTools {
  private seen = new Set<string>();
  private stopped = false;
  busy = false;
  constructor(
    private sessionId: string,
    private ask = sendChat,
  ) {}
  stop() {
    this.stopped = true;
  }
  async run(
    call: { call_id: string; name: string; arguments: string },
    onQuestion: (question: string) => void,
    onReply: (reply: ChatReply) => void,
  ): Promise<string | undefined> {
    if (this.stopped || this.seen.has(call.call_id)) return;
    this.seen.add(call.call_id);
    if (this.busy)
      return JSON.stringify({
        error:
          "Tunggu jawaban pertanyaan sebelumnya. Jangan ulangi permintaan.",
      });
    if (call.name !== "tanya_toko")
      return JSON.stringify({ error: "Tool tidak tersedia." });
    let message: string;
    try {
      const args = JSON.parse(call.arguments);
      if (
        typeof args.pesan !== "string" ||
        !args.pesan.trim() ||
        args.pesan.length > 4000
      )
        throw new Error();
      message = args.pesan.trim();
    } catch {
      return JSON.stringify({
        error:
          "Pertanyaan tidak valid. Minta pelanggan mengulangi dengan jelas.",
      });
    }
    this.busy = true;
    onQuestion(message);
    try {
      const reply = await this.ask({ message, session_id: this.sessionId });
      if (this.stopped) return;
      onReply(reply);
      return JSON.stringify(reply);
    } catch {
      if (this.stopped) return;
      throw new Error(
        "Jawaban toko belum diterima. Akhiri suara dan gunakan chat teks. Permintaan mungkin sudah diproses; jangan mengulang konfirmasi pesanan.",
      );
    } finally {
      this.busy = false;
    }
  }
}

interface Callbacks {
  state: (state: VoiceState) => void;
  question: (question: string) => void;
  reply: (reply: ChatReply) => void;
  error: (message: string) => void;
}
export class VoiceCall {
  private pc?: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private stream?: MediaStream;
  private audio = new Audio();
  private stopped = false;
  private abort = new AbortController();
  private timer?: ReturnType<typeof setTimeout>;
  private tools = new VoiceTools("voice-" + crypto.randomUUID());
  constructor(private callbacks: Callbacks) {}
  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.abort.abort();
    this.tools.stop();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.channel?.close();
    this.pc?.close();
    this.audio.pause();
    this.audio.srcObject = null;
  }
  private fail(message: string) {
    if (this.stopped) return;
    this.stop();
    this.callbacks.error(message);
  }
  private send(event: unknown) {
    if (!this.stopped && this.channel?.readyState === "open")
      this.channel.send(JSON.stringify(event));
  }
  async start() {
    try {
      if (
        !window.isSecureContext ||
        !navigator.mediaDevices?.getUserMedia ||
        !window.RTCPeerConnection
      )
        throw new Error(
          "Suara memerlukan Chrome/Edge melalui HTTPS atau localhost.",
        );
      this.callbacks.state("connecting");
      this.timer = setTimeout(
        () => this.fail("Koneksi suara terlalu lama. Coba mulai lagi."),
        45000,
      );
      // Permission first, so the short-lived token is minted only when needed.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (this.stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      const token = parseToken(
        await request("/webhook/realtime-token", { method: "POST" }, 35000),
      );
      if (this.stopped) return;
      const pc = (this.pc = new RTCPeerConnection());
      this.audio.autoplay = true;
      pc.ontrack = (event) => {
        if (this.stopped) return;
        this.audio.srcObject =
          event.streams[0] || new MediaStream([event.track]);
        void this.audio
          .play()
          .catch(() =>
            this.fail(
              "Browser memblokir audio. Izinkan suara untuk situs ini, lalu mulai lagi.",
            ),
          );
      };
      pc.onconnectionstatechange = () => {
        if (["failed", "disconnected"].includes(pc.connectionState))
          this.fail(
            "Koneksi suara terputus. Silakan mulai lagi atau gunakan chat teks.",
          );
      };
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      const channel = (this.channel = pc.createDataChannel("oai-events"));
      channel.onopen = () => {
        if (!this.stopped) {
          clearTimeout(this.timer);
          this.callbacks.state("listening");
        }
      };
      channel.onclose = () =>
        this.fail("Sesi suara berakhir. Silakan mulai lagi.");
      channel.onerror = () => this.fail("Koneksi data suara bermasalah.");
      channel.onmessage = (event) => {
        void this.handle(event.data);
      };
      const offer = await pc.createOffer();
      if (this.stopped) return;
      await pc.setLocalDescription(offer);
      const response = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${token.value}`,
          "Content-Type": "application/sdp",
        },
        signal: this.abort.signal,
      });
      if (!response.ok)
        throw new Error(
          `Koneksi OpenAI gagal (HTTP ${response.status}). Periksa akses model realtime.`,
        );
      const sdp = await response.text();
      if (!this.stopped) await pc.setRemoteDescription({ type: "answer", sdp });
    } catch (error) {
      const denied =
        error instanceof DOMException && error.name === "NotAllowedError";
      this.fail(
        denied
          ? "Akses mikrofon ditolak. Izinkan mikrofon di pengaturan browser lalu coba lagi."
          : error instanceof Error
            ? error.message
            : "Tidak dapat memulai suara.",
      );
    }
  }
  private async handle(data: string) {
    if (this.stopped) return;
    try {
      const event = JSON.parse(data);
      if (event.type === "error") {
        this.fail(
          "Layanan suara mengalami kendala. Akhiri dan mulai kembali; gunakan chat teks jika berulang.",
        );
        return;
      }
      if (
        event.type === "input_audio_buffer.speech_started" &&
        !this.tools.busy
      )
        this.callbacks.state("listening");
      if (
        event.type === "input_audio_buffer.speech_stopped" &&
        !this.tools.busy
      ) {
        this.callbacks.state("thinking");
        clearTimeout(this.timer);
        this.timer = setTimeout(
          () =>
            this.fail("Jawaban suara terlalu lama. Silakan gunakan chat teks."),
          150000,
        );
      }
      if (event.type === "output_audio_buffer.started")
        this.callbacks.state("speaking");
      if (event.type === "output_audio_buffer.stopped") {
        if (!this.tools.busy) {
          clearTimeout(this.timer);
          this.stream?.getAudioTracks().forEach((t) => {
            t.enabled = true;
          });
        }
        this.callbacks.state(this.tools.busy ? "thinking" : "listening");
      }
      // response.done gives complete function calls, after response generation has
      // ended, avoiding response.create collisions with an active response.
      if (event.type === "response.done") {
        if (event.response?.status === "failed") {
          this.fail("Asisten suara gagal menjawab. Silakan mulai lagi.");
          return;
        }
        if (event.response?.status !== "completed") return;
        let answered = false;
        for (const item of event.response?.output || []) {
          if (
            item.type !== "function_call" ||
            (item.status && item.status !== "completed") ||
            typeof item.call_id !== "string"
          )
            continue;
          const output = await this.tools.run(
            item,
            (question) => {
              this.stream?.getAudioTracks().forEach((t) => {
                t.enabled = false;
              });
              this.callbacks.state("thinking");
              this.callbacks.question(question);
            },
            this.callbacks.reply,
          );
          if (output !== undefined && !this.stopped) {
            this.send({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: item.call_id,
                output,
              },
            });
            answered = true;
          }
        }
        if (answered) this.send({ type: "response.create" });
      }
    } catch (error) {
      this.fail(
        error instanceof Error
          ? error.message
          : "Respons suara tidak dapat diproses.",
      );
    }
  }
}
