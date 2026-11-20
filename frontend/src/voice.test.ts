import { afterEach, describe, expect, it, vi } from "vitest";
import { parseToken, VoiceCall, VoiceTools } from "./voice";
import type { ChatReply } from "./api";

const reply: ChatReply = {
  session_id: "voice-test",
  jawaban: "Stok 5",
  sumber: ["Tas"],
  ditolak: false,
  eskalasi: false,
  validasi: "ok",
};
const call = {
  call_id: "call-1",
  name: "tanya_toko",
  arguments: JSON.stringify({ pesan: "Berapa stok tas?" }),
};
afterEach(() => {
  vi.unstubAllGlobals();
});
describe("voice integration", () => {
  it("rejects missing, malformed and expired credentials", () => {
    for (const raw of [
      null,
      {},
      { value: "token", expires_at: 1, model: "test" },
    ])
      expect(() => parseToken(raw)).toThrow();
    expect(
      parseToken({
        value: "token",
        expires_at: Date.now() / 1000 + 60,
        model: "test",
      }).value,
    ).toBe("token");
  });
  it("maps the tool to the existing chat contract and executes duplicate events once", async () => {
    const ask = vi.fn().mockResolvedValue(reply);
    const tools = new VoiceTools("voice-test", ask);
    const question = vi.fn();
    const answer = vi.fn();
    expect(JSON.parse((await tools.run(call, question, answer))!)).toEqual(
      reply,
    );
    await tools.run(call, question, answer);
    expect(ask).toHaveBeenCalledExactlyOnceWith({
      message: "Berapa stok tas?",
      session_id: "voice-test",
    });
    expect(answer).toHaveBeenCalledExactlyOnceWith(reply);
  });
  it("does not forward malformed arguments or unknown tools", async () => {
    const ask = vi.fn();
    const tools = new VoiceTools("voice-test", ask);
    await tools.run({ ...call, arguments: "{" }, vi.fn(), vi.fn());
    await tools.run(
      { ...call, call_id: "2", name: "buat_pesanan" },
      vi.fn(),
      vi.fn(),
    );
    expect(ask).not.toHaveBeenCalled();
  });
  it("does not run concurrent requests or deliver late replies after hang-up", async () => {
    let resolve!: (reply: ChatReply) => void;
    const ask = vi.fn(
      () =>
        new Promise<ChatReply>((done) => {
          resolve = done;
        }),
    );
    const tools = new VoiceTools("voice-test", ask);
    const answer = vi.fn();
    const first = tools.run(call, vi.fn(), answer);
    await tools.run({ ...call, call_id: "second" }, vi.fn(), answer);
    tools.stop();
    resolve(reply);
    expect(await first).toBeUndefined();
    expect(answer).not.toHaveBeenCalled();
    expect(ask).toHaveBeenCalledTimes(1);
  });
  it("never retries a failed backend request", async () => {
    const ask = vi.fn().mockRejectedValue(new Error("offline"));
    const tools = new VoiceTools("voice-test", ask);
    await expect(tools.run(call, vi.fn(), vi.fn())).rejects.toThrow(
      "mungkin sudah diproses",
    );
    await tools.run(call, vi.fn(), vi.fn());
    expect(ask).toHaveBeenCalledTimes(1);
  });
  it("releases a microphone permission request that completes after hang-up", async () => {
    let grant!: (stream: MediaStream) => void;
    vi.stubGlobal(
      "Audio",
      class {
        pause() {}
      },
    );
    vi.stubGlobal("window", {
      isSecureContext: true,
      RTCPeerConnection: class {},
    });
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: () =>
          new Promise<MediaStream>((done) => {
            grant = done;
          }),
      },
    });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const error = vi.fn();
    const stop = vi.fn();
    const voice = new VoiceCall({
      state: vi.fn(),
      question: vi.fn(),
      reply: vi.fn(),
      error,
    });
    const started = voice.start();
    voice.stop();
    grant({ getTracks: () => [{ stop }] } as unknown as MediaStream);
    await started;
    expect(stop).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
  it("releases the microphone when token creation fails", async () => {
    vi.stubGlobal(
      "Audio",
      class {
        pause() {}
      },
    );
    vi.stubGlobal("window", {
      isSecureContext: true,
      RTCPeerConnection: class {},
    });
    const stop = vi.fn();
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: async () => ({ getTracks: () => [{ stop }] }),
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 401 })),
    );
    const error = vi.fn();
    await new VoiceCall({
      state: vi.fn(),
      question: vi.fn(),
      reply: vi.fn(),
      error,
    }).start();
    expect(stop).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
  });
});
