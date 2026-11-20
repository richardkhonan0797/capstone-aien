import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  ImagePlus,
  LoaderCircle,
  MessageCircle,
  Plus,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  X,
} from "lucide-react";
import { sendChat } from "./api";
import { clock } from "./format";
import { prepareImage, type Attachment } from "./image";
import {
  freshConversation,
  loadConversation,
  saveConversation,
  type Conversation,
  type Message,
} from "./session";
import { Brand, ErrorNotice } from "./ui";
import { VoicePanel } from "./VoicePanel";

const starters = [
  {
    icon: ShoppingBag,
    text: "Cari tas untuk kuliah",
    prompt: "Rekomendasikan tas untuk kuliah dari katalog toko.",
  },
  {
    icon: ShieldCheck,
    text: "Pengiriman & retur",
    prompt: "Bagaimana kebijakan pengiriman dan retur toko?",
  },
  {
    icon: MessageCircle,
    text: "Tanya harga & stok",
    prompt: "Berapa harga dan stok Tas Ransel Harian Hitam?",
  },
];
function initialConversation() {
  try {
    return loadConversation(sessionStorage);
  } catch {
    return freshConversation();
  }
}
export function Chat() {
  const [conversation, setConversation] =
    useState<Conversation>(initialConversation);
  const [voiceActive, setVoiceActive] = useState(false);
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<Attachment>();
  const [pending, setPending] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [imageError, setImageError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const lock = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    try {
      setStorageError(!saveConversation(sessionStorage, conversation));
    } catch {
      setStorageError(true);
    }
  }, [conversation]);
  useEffect(() => {
    if (conversation.messages.length || pending)
      end.current?.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "end",
      });
  }, [conversation.messages.length, pending]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      voiceActive ||
      lock.current ||
      processing ||
      (!draft.trim() && !attachment)
    )
      return;
    lock.current = true;
    setPending(true);
    setError("");
    const message = draft.trim();
    const photo = attachment;
    const messageId = crypto.randomUUID();
    setConversation((c) => ({
      ...c,
      messages: [
        ...c.messages,
        {
          id: messageId,
          role: "user",
          text: message,
          time: new Date().toISOString(),
          image: photo?.preview,
          hadImage: !!photo,
        },
      ],
    }));
    setDraft("");
    setAttachment(undefined);
    try {
      const reply = await sendChat({
        message,
        session_id: conversation.id,
        ...(photo
          ? { image_base64: photo.base64, image_mime: photo.mime }
          : {}),
      });
      setConversation((c) => ({
        ...c,
        messages: [
          ...c.messages,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: reply.jawaban,
            time: new Date().toISOString(),
            reply,
          },
        ],
      }));
    } catch (e) {
      setError(
        (e instanceof Error ? e.message : "Pesan belum mendapat respons.") +
          " Pesan mungkin sudah diproses. Jika terkait pesanan, cek status ke owner sebelum mengirim ulang konfirmasi.",
      );
      setConversation((c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === messageId ? { ...m, uncertain: true } : m,
        ),
      }));
      setDraft(message);
      setAttachment(photo);
    } finally {
      lock.current = false;
      setPending(false);
      requestAnimationFrame(() => input.current?.focus());
    }
  }
  async function selectPhoto(selected?: File) {
    if (!selected) return;
    setProcessing(true);
    setImageError("");
    try {
      setAttachment(await prepareImage(selected));
    } catch (e) {
      setImageError(
        e instanceof Error ? e.message : "Foto tidak dapat diproses.",
      );
    } finally {
      setProcessing(false);
      if (file.current) file.current.value = "";
    }
  }
  function reset() {
    if (voiceActive || lock.current) return;
    setConversation(freshConversation());
    setDraft("");
    setAttachment(undefined);
    setError("");
    setImageError("");
    setConfirmNew(false);
    input.current?.focus();
  }
  return (
    <div className="chat-page">
      <header className="chat-header">
        <a href="/chat/" className="brand-link" aria-label="Toko Senja Tas">
          <Brand chat />
        </a>
        <button
          className="button"
          disabled={voiceActive || pending || processing}
          onClick={() =>
            conversation.messages.length ? setConfirmNew(true) : reset()
          }
        >
          <Plus size={16} />
          <span>Percakapan baru</span>
        </button>
      </header>
      <main className="chat-main">
        <div className="chat-store-line">
          <span className="store-dot" /> Toko tas & pouch · Yogyakarta{" "}
          <span className="store-line-end">Dibantu AI</span>
        </div>
        {storageError && (
          <div className="notice">
            Browser tidak dapat menyimpan sesi. Percakapan ini akan hilang jika
            halaman dimuat ulang.
          </div>
        )}
        {!conversation.messages.length && (
          <section className="chat-welcome">
            <div className="welcome-symbol">
              <ShoppingBag size={30} />
              <span>
                <Sparkles size={16} />
              </span>
            </div>
            <p className="eyebrow">TEMAN BELANJA, SETIAP SAAT</p>
            <h1>
              Tas yang pas,
              <br />
              <span>untuk harimu.</span>
            </h1>
            <p>
              Aku bantu cari tas, cek stok, dan catat pesananmu.
              <br className="desktop-only" /> Punya referensi? Kirim fotonya,
              kita cari yang mirip.
            </p>
            <div className="starter-grid">
              {starters.map(({ icon: Icon, text, prompt }) => (
                <button
                  key={text}
                  className="starter"
                  onClick={() => {
                    setDraft(prompt);
                    input.current?.focus();
                  }}
                >
                  <Icon size={18} />
                  <span>{text}</span>
                  <ArrowRight size={15} />
                </button>
              ))}
            </div>
            <div className="source-promise">
              <ShieldCheck size={15} /> Jawaban berdasarkan katalog & kebijakan
              toko
            </div>
          </section>
        )}
        <div
          className="messages"
          role="log"
          aria-label="Percakapan dengan asisten"
          aria-live="polite"
        >
          {conversation.messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {pending && (
            <div className="message-row assistant">
              <span className="message-avatar">s.</span>
              <div className="message-content">
                <div className="bubble thinking">
                  <LoaderCircle size={16} className="spinning" />
                  Asisten sedang memeriksa katalog…
                </div>
                <p className="message-meta">
                  Mohon tunggu, bisa memerlukan beberapa saat.
                </p>
              </div>
            </div>
          )}
        </div>
        <div ref={end} />
        {error && <ErrorNotice>{error}</ErrorNotice>}
        {imageError && <ErrorNotice>{imageError}</ErrorNotice>}
        <VoicePanel
          disabled={pending || processing}
          onActive={setVoiceActive}
          onMessage={(message) =>
            setConversation((c) => ({
              ...c,
              messages: [...c.messages, message],
            }))
          }
        />
        <form className="chat-composer" onSubmit={submit}>
          <div className="composer-box">
            {attachment && (
              <div className="attachment">
                <img src={attachment.preview} alt="Foto yang akan dikirim" />
                <div>
                  <strong>{attachment.name}</strong>
                  <small>Foto siap dikirim</small>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  disabled={voiceActive || pending}
                  onClick={() => setAttachment(undefined)}
                  aria-label="Hapus foto"
                >
                  <X size={17} />
                </button>
              </div>
            )}
            <label className="sr-only" htmlFor="chat-message">
              Pesan untuk asisten toko
            </label>
            <textarea
              id="chat-message"
              ref={input}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Tulis pesan atau kirim foto produk…"
              rows={2}
              maxLength={4000}
              disabled={voiceActive || pending}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing &&
                  !matchMedia("(pointer: coarse)").matches
                ) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className="composer-actions">
              <input
                ref={file}
                className="sr-only"
                tabIndex={-1}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  void selectPhoto(e.target.files?.[0]);
                }}
              />
              <button
                type="button"
                className="attach-button"
                disabled={voiceActive || pending || processing}
                onClick={() => file.current?.click()}
              >
                {processing ? (
                  <LoaderCircle className="spinning" size={18} />
                ) : (
                  <ImagePlus size={18} />
                )}
                <span>{processing ? "Memproses…" : "Tambah foto"}</span>
              </button>
              <span className="composer-hint">
                JPEG, PNG, WebP · Maks. 5 MB
              </span>
              <button
                className="button primary send-button"
                type="submit"
                disabled={
                  voiceActive ||
                  pending ||
                  processing ||
                  (!draft.trim() && !attachment)
                }
              >
                {pending ? (
                  <LoaderCircle className="spinning" size={16} />
                ) : (
                  <Send size={16} />
                )}
                Kirim
              </button>
            </div>
          </div>
          <p className="chat-disclaimer">
            Asisten dapat membuat kesalahan. Periksa ringkasan pesanan sebelum
            mengonfirmasi.
          </p>
        </form>
      </main>
      <footer className="chat-footer">
        senja tas <span>·</span> Pilihan kecil, teman perjalanan besar.
      </footer>
      {confirmNew && (
        <NewConversationDialog
          cancel={() => setConfirmNew(false)}
          confirm={reset}
        />
      )}
    </div>
  );
}
function SafeMessageText({ text }: { text: string }) {
  // The agent sometimes returns Markdown emphasis. Render only that subset as
  // React text nodes; links, raw HTML, and other markup are never executed.
  return (
    <>
      {text
        .split(/(\*\*[^*\n]+\*\*)/g)
        .map((part, index) =>
          part.startsWith("**") && part.endsWith("**") ? (
            <strong key={index}>{part.slice(2, -2)}</strong>
          ) : (
            part
          ),
        )}
    </>
  );
}
function MessageBubble({ message: m }: { message: Message }) {
  const reply = m.reply;
  return (
    <article className={"message-row " + m.role}>
      {m.role === "assistant" && (
        <span className="message-avatar" aria-hidden="true">
          s.
        </span>
      )}
      <div className="message-content">
        <div className={"bubble " + (m.uncertain ? "uncertain" : "")}>
          {m.image ? (
            <img
              className="message-photo"
              src={m.image}
              alt="Foto referensi produk yang dikirim"
            />
          ) : m.hadImage ? (
            <p className="restored-photo">
              <ImagePlus size={16} />
              Foto dikirim sebelumnya
            </p>
          ) : null}
          {m.text && (
            <p className="message-text">
              <SafeMessageText text={m.text} />
            </p>
          )}
          {reply?.sumber.length ? (
            <div className="sources">
              <span>
                <ShieldCheck size={13} />
                Sumber jawaban
              </span>
              <div>
                {reply.sumber.map((s, i) => (
                  <span className="source-label" key={i}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {reply?.validasi === "agent_error" ? (
            <div className="reply-status">
              Asisten mengalami kendala. Hubungi owner jika perlu bantuan;
              penerusan belum terverifikasi.
            </div>
          ) : reply?.eskalasi ? (
            <div className="reply-status">
              <Check size={14} />
              {reply.eskalasi_dicatat
                ? "Permintaan dicatat untuk owner"
                : "Permintaan membutuhkan tindak lanjut owner"}
            </div>
          ) : reply?.ditolak ? (
            <div className="reply-status">
              Informasi belum dapat dipastikan dari sumber toko.
            </div>
          ) : null}
        </div>
        <p className="message-meta">
          {clock(m.time)}
          {m.uncertain && " · Status respons belum diketahui"}
        </p>
      </div>
    </article>
  );
}
function NewConversationDialog({
  cancel,
  confirm,
}: {
  cancel: () => void;
  confirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="order-dialog compact-dialog"
      aria-labelledby="new-chat-title"
      onCancel={cancel}
    >
      <div className="dialog-heading">
        <h2 id="new-chat-title">Mulai percakapan baru?</h2>
        <button className="icon-button" onClick={cancel} aria-label="Tutup">
          <X size={19} />
        </button>
      </div>
      <div className="dialog-content">
        <p>
          Riwayat di halaman ini akan dikosongkan. Pesanan yang sudah tercatat
          tetap tersimpan.
        </p>
        <p className="muted small">
          Jangan gunakan sesi baru untuk mengulang konfirmasi pesanan yang
          statusnya belum jelas.
        </p>
      </div>
      <div className="dialog-footer">
        <button className="button" onClick={cancel}>
          Kembali
        </button>
        <button className="button primary" onClick={confirm}>
          Mulai baru
        </button>
      </div>
    </dialog>
  );
}
