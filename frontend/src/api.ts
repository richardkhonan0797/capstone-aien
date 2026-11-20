export interface Order {
  id: string;
  created_at: string;
  session_id: string;
  nama_pembeli: string;
  alamat: string | null;
  sku: string;
  produk: string;
  qty: number;
  total: number;
  status: string;
}
export interface Question {
  id: string;
  created_at: string;
  session_id: string | null;
  pertanyaan: string;
  alasan: string | null;
}
export interface EvaluationDetail {
  qid: string;
  pertanyaan: string;
  benar: boolean | null;
  bersumber: boolean | null;
  halusinasi: boolean | null;
  catatan: string | null;
}
export interface Evaluation {
  run_id: string | null;
  ringkasan: {
    total: number;
    benar_pct: number | null;
    bersumber_pct: number | null;
    halusinasi_pct: number | null;
  };
  detail: EvaluationDetail[];
}
export interface ChatReply {
  session_id: string;
  jawaban: string;
  sumber: string[];
  ditolak: boolean;
  eskalasi: boolean;
  eskalasi_dicatat?: boolean;
  validasi: string;
  ada_foto?: boolean;
}
export interface ChatInput {
  message: string;
  session_id: string;
  image_base64?: string;
  image_mime?: string;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
type ObjectValue = Record<string, unknown>;
function object(value: unknown): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ApiError("Format respons server tidak sesuai.");
  return value as ObjectValue;
}
function text(value: unknown): string {
  if (typeof value !== "string")
    throw new ApiError("Format teks pada respons server tidak sesuai.");
  return value;
}
function nullableText(value: unknown): string | null {
  return value == null ? null : text(value);
}
function number(value: unknown): number {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    value === "" ||
    !Number.isFinite(Number(value))
  )
    throw new ApiError("Format angka pada respons server tidak sesuai.");
  return Number(value);
}
function id(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number")
    throw new ApiError("ID pada respons server tidak sesuai.");
  return String(value);
}
function flag(value: unknown): boolean {
  if (typeof value !== "boolean")
    throw new ApiError("Format status pada respons server tidak sesuai.");
  return value;
}
function nullableFlag(value: unknown): boolean | null {
  return value == null ? null : flag(value);
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value))
    throw new ApiError("Format daftar pada respons server tidak sesuai.");
  return value;
}
function date(value: unknown): string {
  const s = text(value);
  if (!Number.isFinite(Date.parse(s)))
    throw new ApiError("Format tanggal pada respons server tidak sesuai.");
  return s;
}
export function parseOrders(raw: unknown): Order[] {
  return array(object(raw).data).map((value) => {
    const r = object(value);
    return {
      id: id(r.id),
      created_at: date(r.created_at),
      session_id: text(r.session_id),
      nama_pembeli: text(r.nama_pembeli),
      alamat: nullableText(r.alamat),
      sku: text(r.sku),
      produk: text(r.produk),
      qty: number(r.qty),
      total: number(r.total),
      status: text(r.status),
    };
  });
}
export function parseQuestions(raw: unknown): Question[] {
  return array(object(raw).data).map((value) => {
    const r = object(value);
    return {
      id: id(r.id),
      created_at: date(r.created_at),
      session_id: nullableText(r.session_id),
      pertanyaan: text(r.pertanyaan),
      alasan: nullableText(r.alasan),
    };
  });
}
export function parseEvaluation(raw: unknown): Evaluation {
  const r = object(object(raw).data);
  const s = object(r.ringkasan);
  const pct = (value: unknown) => {
    if (value == null) return null;
    const n = number(value);
    if (n < 0 || n > 100)
      throw new ApiError("Persentase evaluasi tidak valid.");
    return n;
  };
  return {
    run_id: nullableText(r.run_id),
    ringkasan: {
      total: number(s.total),
      benar_pct: pct(s.benar_pct),
      bersumber_pct: pct(s.bersumber_pct),
      halusinasi_pct: pct(s.halusinasi_pct),
    },
    detail: array(r.detail).map((value) => {
      const d = object(value);
      return {
        qid: id(d.qid),
        pertanyaan: text(d.pertanyaan),
        benar: nullableFlag(d.benar),
        bersumber: nullableFlag(d.bersumber),
        halusinasi: nullableFlag(d.halusinasi),
        catatan: nullableText(d.catatan),
      };
    }),
  };
}
export function parseChat(raw: unknown): ChatReply {
  const r = object(raw);
  return {
    session_id: text(r.session_id),
    jawaban: text(r.jawaban),
    sumber: r.sumber == null ? [] : array(r.sumber).map(text),
    ditolak: flag(r.ditolak),
    eskalasi: flag(r.eskalasi),
    validasi: text(r.validasi),
    eskalasi_dicatat:
      r.eskalasi_dicatat == null ? undefined : flag(r.eskalasi_dicatat),
    ada_foto: r.ada_foto == null ? undefined : flag(r.ada_foto),
  };
}
export async function request(
  path: string,
  options: RequestInit = {},
  timeout = 20000,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(path, {
      ...options,
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      const messages: Record<number, string> = {
        401: "Akses owner memerlukan login. Muat ulang halaman dan masukkan akun owner.",
        403: "Akses endpoint ini dibatasi. Hubungi pengelola toko.",
        404: "Endpoint tidak ditemukan. Pastikan workflow n8n sudah aktif.",
        413: "Foto terlalu besar. Pilih foto dengan ukuran lebih kecil.",
        429: "Terlalu banyak permintaan. Tunggu sebentar sebelum mencoba kembali.",
      };
      throw new ApiError(
        messages[response.status] ||
          `Server tidak dapat memproses permintaan (HTTP ${response.status}).`,
        response.status,
      );
    }
    if (!response.headers.get("content-type")?.includes("application/json"))
      throw new ApiError(
        "Server mengembalikan halaman, bukan data. Periksa routing webhook.",
      );
    try {
      return await response.json();
    } catch {
      throw new ApiError("Respons server bukan JSON yang valid.");
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted)
      throw new ApiError(
        "Respons terlalu lama. Koneksi dihentikan; proses di server mungkin masih berjalan.",
      );
    throw new ApiError(
      "Tidak dapat terhubung ke server. Periksa koneksi internet.",
    );
  } finally {
    clearTimeout(timer);
  }
}
export const getOrders = async () =>
  parseOrders(await request("/webhook/pesanan"));
export const getQuestions = async () =>
  parseQuestions(await request("/webhook/tanpa-jawaban"));
export const getEvaluation = async () =>
  parseEvaluation(await request("/webhook/skor"));
export const sendChat = async (input: ChatInput) =>
  parseChat(
    await request(
      "/webhook/chat",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
      120000,
    ),
  );
