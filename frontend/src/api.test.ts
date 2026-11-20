import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseChat,
  parseEvaluation,
  parseOrders,
  parseQuestions,
  request,
  sendChat,
} from "./api";
import { loadConversation, saveConversation, STORAGE_KEY } from "./session";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("n8n response contracts", () => {
  it("normalizes PostgreSQL numeric strings without losing large IDs", () => {
    const [order] = parseOrders({
      data: [
        {
          id: "9007199254740993",
          created_at: "2026-11-18T10:00:00Z",
          session_id: "web-test",
          nama_pembeli: "Test",
          alamat: null,
          sku: "TR-001",
          produk: "Ransel",
          qty: "2",
          total: "378000",
          status: "baru",
        },
      ],
    });
    expect(order.id).toBe("9007199254740993");
    expect(order.qty).toBe(2);
    expect(order.total).toBe(378000);
  });
  it("supports empty lists and evaluation before the first run", () => {
    expect(parseOrders({ data: [] })).toEqual([]);
    expect(parseQuestions({ data: [] })).toEqual([]);
    expect(
      parseEvaluation({
        data: {
          run_id: null,
          ringkasan: {
            total: 0,
            benar_pct: null,
            bersumber_pct: null,
            halusinasi_pct: null,
          },
          detail: [],
        },
      }).ringkasan.benar_pct,
    ).toBeNull();
  });
  it("preserves partial evaluation instead of claiming all 20 are complete", () => {
    const result = parseEvaluation({
      data: {
        run_id: "run-1",
        ringkasan: {
          total: "1",
          benar_pct: "100.0",
          bersumber_pct: "0.0",
          halusinasi_pct: null,
        },
        detail: [
          {
            qid: 1,
            pertanyaan: "Test",
            benar: true,
            bersumber: false,
            halusinasi: null,
            catatan: null,
          },
        ],
      },
    });
    expect(result.ringkasan.total).toBe(1);
    expect(result.ringkasan.bersumber_pct).toBe(0);
    expect(result.detail[0].halusinasi).toBeNull();
  });
  it("accepts the actual agent-error fallback with no sources", () => {
    expect(
      parseChat({
        session_id: "web-1",
        jawaban: "Maaf",
        ditolak: true,
        eskalasi: false,
        validasi: "agent_error",
      }).sumber,
    ).toEqual([]);
  });
  it("rejects malformed successes rather than displaying false metrics", () => {
    expect(() => parseOrders({ data: "not an array" })).toThrow();
    expect(() =>
      parseChat({
        session_id: "a",
        jawaban: "b",
        ditolak: "false",
        eskalasi: false,
        validasi: "ok",
      }),
    ).toThrow();
    expect(() =>
      parseEvaluation({
        data: {
          run_id: "r",
          ringkasan: { total: 20, benar_pct: 200 },
          detail: [],
        },
      }),
    ).toThrow();
  });
});
describe("network and order safety", () => {
  it("reports owner authentication errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 401 })),
    );
    await expect(request("/webhook/pesanan")).rejects.toMatchObject({
      status: 401,
    });
  });
  it("rejects the n8n editor HTML if routing is wrong", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("<html/>", { headers: { "Content-Type": "text/html" } }),
        ),
    );
    await expect(request("/webhook/pesanan")).rejects.toThrow("bukan data");
  });
  it("sends exactly one POST and retains the caller session on failure", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetch);
    await expect(
      sendChat({ message: "ya", session_id: "web-stable" }),
    ).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      message: "ya",
      session_id: "web-stable",
    });
  });
  it("aborts a slow request with an uncertain-outcome message", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_path: string, options: RequestInit) =>
          new Promise((_resolve, reject) =>
            options.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            ),
          ),
      ),
    );
    const result = expect(request("/webhook/chat", {}, 100)).rejects.toThrow(
      "mungkin masih berjalan",
    );
    await vi.advanceTimersByTimeAsync(101);
    await result;
  });
});
describe("browser session recovery", () => {
  it("preserves session, transcript and sources but never stores photo bytes", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const id = "web-00000000-0000-4000-8000-000000000001";
    saveConversation(storage, {
      id,
      messages: [
        {
          id: "a",
          role: "user",
          text: "foto",
          image: "data:image/jpeg;base64,secret",
          time: "2026-11-18T10:00:00Z",
        },
        {
          id: "b",
          role: "assistant",
          text: "Tas",
          time: "2026-11-18T10:00:01Z",
          reply: {
            session_id: id,
            jawaban: "Tas",
            sumber: ["Katalog"],
            ditolak: false,
            eskalasi: false,
            validasi: "ok",
          },
        },
      ],
    });
    expect(values.get(STORAGE_KEY)).not.toContain("base64");
    const restored = loadConversation(storage);
    expect(restored.id).toBe(id);
    expect(restored.messages[0].hadImage).toBe(true);
    expect(restored.messages[1].text).toContain("Sumber: Katalog");
  });
  it("recovers from malformed or inaccessible storage with a unique web session", () => {
    const c = loadConversation({ getItem: () => "{broken" });
    expect(c.id).toMatch(/^web-/);
    expect(c.messages).toEqual([]);
    expect(
      saveConversation(
        {
          setItem: () => {
            throw new Error("quota");
          },
        },
        c,
      ),
    ).toBe(false);
  });
});
