import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LayoutDashboard,
  ListFilter,
  LoaderCircle,
  MessageCircleQuestion,
  MessagesSquare,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import {
  getEvaluation,
  getOrders,
  getQuestions,
  type Evaluation,
  type Order,
  type Question,
} from "./api";
import { clock, dateTime, money, percent } from "./format";
import { Brand, Empty, ErrorNotice, More, Panel, Stat, Status } from "./ui";

type Page = "overview" | "orders" | "questions" | "evaluation";
function currentPage(): Page {
  const hash = location.hash.slice(1);
  return ["orders", "questions", "evaluation"].includes(hash)
    ? (hash as Page)
    : "overview";
}
function useResource<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState<Date>();
  const busy = useRef(false);
  const active = useRef(true);
  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const next = await loader();
      if (active.current) {
        setData(next);
        setError("");
        setUpdated(new Date());
      }
    } catch (e) {
      if (active.current)
        setError(e instanceof Error ? e.message : "Data tidak dapat dimuat.");
    } finally {
      busy.current = false;
      if (active.current) setLoading(false);
    }
  }, [loader]);
  useEffect(() => {
    active.current = true;
    void refresh();
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = setInterval(tick, 30000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      active.current = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);
  return { data, error, loading, updated, refresh };
}
const navigation = [
  { id: "overview", label: "Ringkasan", icon: LayoutDashboard },
  { id: "orders", label: "Pesanan", icon: ShoppingBag },
  { id: "questions", label: "Belum terjawab", icon: MessageCircleQuestion },
  { id: "evaluation", label: "Evaluasi AI", icon: Sparkles },
] as const;
const headings: Record<Page, [string, string, string]> = {
  overview: [
    "OPERASIONAL TOKO",
    "Ringkasan toko",
    "Setiap percakapan, selangkah lebih dekat dengan pelanggan.",
  ],
  orders: [
    "OPERASIONAL TOKO",
    "Pesanan",
    "Pesanan dari web dan Telegram, tercatat di satu tempat.",
  ],
  questions: [
    "TINJAUAN OWNER",
    "Belum terjawab",
    "Kenali informasi yang masih dibutuhkan pelangganmu.",
  ],
  evaluation: [
    "KUALITAS ASISTEN",
    "Evaluasi AI",
    "Lihat seberapa baik asisten menjawab berdasarkan sumber toko.",
  ],
};
export function Dashboard() {
  const [page, setPage] = useState<Page>(currentPage);
  const [selected, setSelected] = useState<Order | null>(null);
  const orders = useResource(getOrders);
  const questions = useResource(getQuestions);
  const evaluation = useResource(getEvaluation);
  useEffect(() => {
    const change = () => setPage(currentPage());
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const resources = [orders, questions, evaluation];
  const loading = resources.some((r) => r.loading);
  const refresh = () => {
    resources.forEach((r) => {
      void r.refresh();
    });
  };
  const [eyebrow, title, description] = headings[page];
  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <a
          className="brand-link"
          href="#overview"
          aria-label="Senja Tas, ringkasan"
        >
          <Brand />
        </a>
        <div className="nav-label">TOKO SAYA</div>
        <nav aria-label="Menu owner">
          {navigation.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={"#" + id}
              className={"nav-link " + (page === id ? "active" : "")}
              aria-current={page === id ? "page" : undefined}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === "questions" && !!questions.data?.length && (
                <span className="nav-count">{questions.data.length}</span>
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <a
            className="chat-shortcut"
            href="/chat/"
            target="_blank"
            rel="noreferrer"
          >
            <MessagesSquare size={19} />
            <span>Buka chat toko</span>
            <ArrowUpRight size={15} />
          </a>
          <div className="owner-profile">
            <span className="avatar">O</span>
            <div>
              <strong>Owner</strong>
              <small>Toko Senja Tas</small>
            </div>
            <ShieldCheck size={17} />
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            Toko Senja Tas <span className="breadcrumb-divider">/</span>{" "}
            <strong>{title}</strong>
          </span>
          <span className="owner-only">
            <ShieldCheck size={14} /> Area owner
          </span>
        </header>
        <main className="dashboard-main" id="main-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">{eyebrow}</p>
              <h1>{title}</h1>
              <p className="page-description">{description}</p>
            </div>
            <button
              className="button refresh-button"
              onClick={refresh}
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? "spinning" : ""} />
              {loading ? "Memuat" : "Refresh"}
            </button>
          </div>
          <div aria-live="polite">
            {resources.map(
              (r, i) =>
                r.error && (
                  <ErrorNotice key={i}>
                    <strong>
                      {["Pesanan", "Pertanyaan", "Evaluasi"][i]}:{" "}
                    </strong>
                    {r.error}
                    {r.data !== undefined && (
                      <span className="stale-note">
                        {" "}
                        Data sebelumnya tetap ditampilkan; mungkin belum
                        mutakhir.
                      </span>
                    )}
                  </ErrorNotice>
                ),
            )}
          </div>
          {page === "overview" && (
            <>
              <div className="stats-grid">
                <Stat
                  label="Pesanan dimuat"
                  value={orders.data?.length ?? "—"}
                  caption="Maks. 100 pesanan terbaru"
                  icon={<ShoppingBag />}
                />
                <Stat
                  label="Nilai pesanan"
                  value={
                    orders.data
                      ? money(orders.data.reduce((sum, o) => sum + o.total, 0))
                      : "—"
                  }
                  caption="Total dari pesanan yang dimuat"
                  icon={<Wallet />}
                />
                <Stat
                  label="Belum terjawab"
                  value={questions.data?.length ?? "—"}
                  caption="Maks. 100 pertanyaan terbaru"
                  icon={<MessageCircleQuestion />}
                />
              </div>
              <Panel
                title="Pesanan terbaru"
                action={<More href="#orders">Lihat semua</More>}
              >
                <OrdersTable
                  orders={orders.data?.slice(0, 5)}
                  loading={orders.loading}
                  onSelect={setSelected}
                />
              </Panel>
              <div className="overview-bottom">
                <Panel
                  title="Kualitas jawaban AI"
                  action={
                    evaluation.data?.ringkasan.total ? (
                      <span className="badge neutral">
                        {evaluation.data.ringkasan.total} diuji
                      </span>
                    ) : undefined
                  }
                >
                  {evaluation.data?.run_id ? (
                    <div className="panel-body">
                      <Metric
                        label="Jawaban benar"
                        value={evaluation.data.ringkasan.benar_pct}
                      />
                      <Metric
                        label="Bersumber"
                        value={evaluation.data.ringkasan.bersumber_pct}
                      />
                      <Metric
                        label="Halusinasi"
                        value={evaluation.data.ringkasan.halusinasi_pct}
                        negative
                      />
                      <div className="panel-footer-link">
                        <More href="#evaluation">Lihat hasil evaluasi</More>
                      </div>
                    </div>
                  ) : (
                    <DataEmpty
                      loading={evaluation.loading}
                      title="Belum ada evaluasi"
                    >
                      Hasil pengujian akan muncul setelah evaluasi dijalankan di
                      n8n.
                    </DataEmpty>
                  )}
                </Panel>
                <Panel
                  title="Perlu ditinjau"
                  action={
                    questions.data?.length ? (
                      <span className="badge">
                        {questions.data.length} pertanyaan
                      </span>
                    ) : undefined
                  }
                >
                  {questions.data?.length ? (
                    <div className="panel-body question-preview">
                      {questions.data.slice(0, 3).map((q) => (
                        <a
                          key={q.id}
                          className="question-preview-item"
                          href="#questions"
                        >
                          <span className="question-indicator">
                            <ArrowDownLeft size={14} />
                          </span>
                          <div>
                            <p>{q.pertanyaan}</p>
                            <small>
                              {q.alasan || "Alasan tidak dicantumkan"} ·{" "}
                              {clock(q.created_at)}
                            </small>
                          </div>
                          <ChevronRight size={15} />
                        </a>
                      ))}
                      <div className="panel-footer-link">
                        <More href="#questions">Tinjau pertanyaan</More>
                      </div>
                    </div>
                  ) : (
                    <DataEmpty
                      loading={questions.loading}
                      title="Semua tenang di sini"
                    >
                      Pertanyaan yang belum terjawab akan muncul di sini.
                    </DataEmpty>
                  )}
                </Panel>
              </div>
            </>
          )}
          {page === "orders" && (
            <Orders
              orders={orders.data}
              loading={orders.loading}
              onSelect={setSelected}
            />
          )}
          {page === "questions" && (
            <Questions questions={questions.data} loading={questions.loading} />
          )}
          {page === "evaluation" && (
            <Evaluations
              evaluation={evaluation.data}
              loading={evaluation.loading}
            />
          )}
          <footer className="dashboard-footer">
            <span>
              <Clock3 size={13} />{" "}
              {resources.some((r) => r.updated)
                ? "Terakhir diperbarui " +
                  clock(
                    new Date(
                      Math.min(
                        ...resources
                          .filter((r) => r.updated)
                          .map((r) => r.updated!.getTime()),
                      ),
                    ),
                  )
                : "Menunggu data dari toko"}
            </span>
            <span>Otomatis setiap 30 detik saat halaman aktif · WIB</span>
          </footer>
        </main>
      </div>
      {selected && (
        <OrderDialog order={selected} close={() => setSelected(null)} />
      )}
    </div>
  );
}
function Metric({
  label,
  value,
  negative = false,
}: {
  label: string;
  value: number | null;
  negative?: boolean;
}) {
  return (
    <div className="metric">
      <div>
        <span>{label}</span>
        <strong>{percent(value)}</strong>
      </div>
      <div
        className="metric-track"
        role="meter"
        aria-label={label}
        aria-valuenow={value ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span
          className={negative ? "negative" : ""}
          style={{ width: `${value ?? 0}%` }}
        />
      </div>
    </div>
  );
}
function DataEmpty({
  loading,
  title,
  children,
}: {
  loading: boolean;
  title: string;
  children: string;
}) {
  return loading ? (
    <div className="loading-state" role="status">
      <LoaderCircle className="spinning" />
      Memuat data toko…
    </div>
  ) : (
    <Empty title={title}>{children}</Empty>
  );
}
function OrdersTable({
  orders,
  loading,
  onSelect,
}: {
  orders?: Order[];
  loading: boolean;
  onSelect: (o: Order) => void;
}) {
  if (!orders?.length)
    return (
      <DataEmpty
        loading={loading}
        title={orders ? "Belum ada pesanan" : "Data belum tersedia"}
      >
        {orders
          ? "Pesanan yang dikonfirmasi melalui asisten akan tercatat di sini."
          : "Gunakan Refresh untuk mencoba memuat pesanan kembali."}
      </DataEmpty>
    );
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Pesanan / pembeli</th>
            <th>Produk</th>
            <th>Total</th>
            <th>Status</th>
            <th>
              <span className="sr-only">Detail</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>
                <button className="order-id" onClick={() => onSelect(o)}>
                  #{o.id}
                </button>
                <span className="cell-secondary">{o.nama_pembeli}</span>
              </td>
              <td>
                <span className="product-name">{o.produk}</span>
                <span className="cell-secondary">
                  {o.qty} unit · {o.sku}
                </span>
              </td>
              <td className="numeric">{money(o.total)}</td>
              <td>
                <Status value={o.status} />
              </td>
              <td>
                <button
                  className="icon-button"
                  onClick={() => onSelect(o)}
                  aria-label={"Lihat pesanan #" + o.id}
                >
                  <ChevronRight size={17} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Pagination({
  page,
  total,
  setPage,
}: {
  page: number;
  total: number;
  setPage: (n: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / 10));
  return (
    <div className="pagination">
      <span>
        {total
          ? `${(page - 1) * 10 + 1}–${Math.min(page * 10, total)} dari ${total}`
          : "0 hasil"}
      </span>
      <div>
        <button
          className="icon-button"
          aria-label="Halaman sebelumnya"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft size={17} />
        </button>
        <span>
          {page} / {pages}
        </span>
        <button
          className="icon-button"
          aria-label="Halaman berikutnya"
          disabled={page >= pages}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </div>
  );
}
function Orders({
  orders,
  loading,
  onSelect,
}: {
  orders?: Order[];
  loading: boolean;
  onSelect: (o: Order) => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const filtered = orders?.filter(
    (o) =>
      (!status || o.status === status) &&
      `${o.id} ${o.nama_pembeli} ${o.produk} ${o.sku}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const current = Math.min(
    page,
    Math.max(1, Math.ceil((filtered?.length || 0) / 10)),
  );
  return (
    <>
      <div className="list-toolbar">
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="Cari pesanan"
            placeholder="Cari pembeli, produk, atau ID pesanan…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="filter-field">
          <ListFilter size={16} />
          <select
            aria-label="Filter status pesanan"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Semua status</option>
            {[...new Set(orders?.map((o) => o.status))].sort().map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <Panel
        title="Daftar pesanan"
        action={<span className="muted small">100 terbaru</span>}
      >
        {filtered?.length === 0 && (search || status) ? (
          <Empty title="Tidak ada yang cocok">
            Coba kata kunci atau status lain.
          </Empty>
        ) : (
          <OrdersTable
            orders={filtered?.slice((current - 1) * 10, current * 10)}
            loading={loading}
            onSelect={onSelect}
          />
        )}
        <Pagination
          page={current}
          total={filtered?.length || 0}
          setPage={setPage}
        />
      </Panel>
      <p className="section-note">
        Pesanan ditampilkan untuk ditinjau. Perubahan status belum tersedia di
        versi ini.
      </p>
    </>
  );
}
function Questions({
  questions,
  loading,
}: {
  questions?: Question[];
  loading: boolean;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const filtered = questions?.filter((q) =>
    `${q.pertanyaan} ${q.alasan || ""} ${q.session_id || ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const current = Math.min(
    page,
    Math.max(1, Math.ceil((filtered?.length || 0) / 10)),
  );
  return (
    <>
      <div className="list-toolbar">
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="Cari pertanyaan"
            placeholder="Cari pertanyaan, alasan, atau sesi…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>
      <Panel
        title="Pertanyaan pelanggan"
        action={<span className="muted small">100 terbaru</span>}
      >
        {filtered?.length ? (
          <div className="question-list">
            {filtered.slice((current - 1) * 10, current * 10).map((q) => (
              <article key={q.id}>
                <span className="question-indicator">
                  <MessageCircleQuestion size={18} />
                </span>
                <div>
                  <h3>{q.pertanyaan}</h3>
                  <p>{q.alasan || "Alasan tidak dicantumkan"}</p>
                  <small>{dateTime(q.created_at)}</small>
                  <details>
                    <summary>Detail sesi</summary>
                    <dl>
                      <dt>ID pertanyaan</dt>
                      <dd>#{q.id}</dd>
                      <dt>Sesi</dt>
                      <dd>{q.session_id || "Tidak tersedia"}</dd>
                    </dl>
                  </details>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <DataEmpty
            loading={loading}
            title={
              search
                ? "Tidak ada yang cocok"
                : questions
                  ? "Belum ada pertanyaan tertunda"
                  : "Data belum tersedia"
            }
          >
            {search
              ? "Coba kata kunci lain."
              : "Pertanyaan yang belum bisa dijawab asisten akan muncul di sini."}
          </DataEmpty>
        )}
        <Pagination
          page={current}
          total={filtered?.length || 0}
          setPage={setPage}
        />
      </Panel>
    </>
  );
}
function Judgement({
  value,
  negative = false,
}: {
  value: boolean | null;
  negative?: boolean;
}) {
  return (
    <span
      className={
        "judgement " +
        (value == null ? "" : value !== negative ? "positive" : "negative")
      }
    >
      {value === null ? (
        "—"
      ) : value ? (
        <>
          <Check size={13} />
          Ya
        </>
      ) : (
        "Tidak"
      )}
    </span>
  );
}
function Evaluations({
  evaluation: e,
  loading,
}: {
  evaluation?: Evaluation;
  loading: boolean;
}) {
  const [filter, setFilter] = useState("all");
  if (!e?.run_id)
    return (
      <Panel title="Hasil evaluasi">
        <DataEmpty loading={loading} title="Belum ada hasil evaluasi">
          Jalankan workflow Evaluasi di n8n. Hasilnya akan muncul di halaman
          ini.
        </DataEmpty>
      </Panel>
    );
  const s = e.ringkasan;
  const rows = e.detail.filter(
    (d) =>
      filter === "all" ||
      d.benar === false ||
      d.halusinasi === true ||
      d.bersumber === false,
  );
  return (
    <>
      <div className="stats-grid">
        <Stat
          label="Jawaban benar"
          value={percent(s.benar_pct)}
          caption="Proporsi jawaban yang dinilai benar"
          icon={<Check />}
        />
        <Stat
          label="Bersumber"
          value={percent(s.bersumber_pct)}
          caption="Proporsi jawaban dengan sumber"
          icon={<ShieldCheck />}
        />
        <Stat
          label="Halusinasi"
          value={percent(s.halusinasi_pct)}
          caption="Semakin rendah, semakin baik"
          icon={<MessageCircleQuestion />}
        />
      </div>
      <div className="eval-run">
        <div>
          <span className="eyebrow">RUN TERBARU</span>
          <p>{e.run_id}</p>
        </div>
        <span className={"badge " + (s.total >= 20 ? "green" : "")}>
          {s.total} / 20 hasil tersedia
        </span>
      </div>
      {s.total < 20 && (
        <div className="notice">
          <Clock3 size={18} />
          <p>
            Hasil belum lengkap. Evaluasi mungkin masih berjalan atau berhenti
            sebelum selesai; persentase berdasarkan {s.total} hasil yang
            tersimpan.
          </p>
        </div>
      )}
      <div className="list-toolbar">
        <label className="filter-field">
          <ListFilter size={16} />
          <select
            aria-label="Filter hasil evaluasi"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">Semua pertanyaan</option>
            <option value="review">Perlu ditinjau</option>
          </select>
        </label>
      </div>
      <Panel
        title="Hasil per pertanyaan"
        action={<span className="muted small">{rows.length} hasil</span>}
      >
        {rows.length ? (
          <div className="evaluation-list">
            {rows.map((d) => (
              <article key={d.qid}>
                <div className="evaluation-question">
                  <span className="question-number">
                    {d.qid.padStart(2, "0")}
                  </span>
                  <div>
                    <h3>{d.pertanyaan}</h3>
                    <div className="judgements">
                      <span>
                        Benar <Judgement value={d.benar} />
                      </span>
                      <span>
                        Bersumber <Judgement value={d.bersumber} />
                      </span>
                      <span>
                        Halusinasi <Judgement value={d.halusinasi} negative />
                      </span>
                    </div>
                    <details>
                      <summary>Catatan penilai</summary>
                      <p className="judge-notes">
                        {d.catatan || "Tidak ada catatan tambahan."}
                      </p>
                    </details>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty title="Tidak ada hasil untuk ditinjau">
            Semua hasil yang dimuat memenuhi filter ini.
          </Empty>
        )}
      </Panel>
      <p className="section-note">
        Skor berasal dari workflow Evaluasi. Jalankan pengujian melalui n8n
        untuk memperbaruinya.
      </p>
    </>
  );
}
function OrderDialog({ order: o, close }: { order: Order; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      className="order-dialog"
      ref={ref}
      onCancel={close}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      aria-labelledby="order-title"
    >
      <div className="dialog-heading">
        <div>
          <p className="eyebrow">DETAIL PESANAN</p>
          <h2 id="order-title">Pesanan #{o.id}</h2>
        </div>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Tutup detail"
        >
          <X size={20} />
        </button>
      </div>
      <div className="dialog-content">
        <div className="order-product">
          <span className="product-icon">
            <ShoppingBag />
          </span>
          <div>
            <h3>{o.produk}</h3>
            <p>
              {o.sku} · {o.qty} unit
            </p>
          </div>
          <Status value={o.status} />
        </div>
        <dl className="order-fields">
          <dt>Pembeli</dt>
          <dd>{o.nama_pembeli}</dd>
          <dt>Alamat pengiriman</dt>
          <dd>{o.alamat || "Tidak dicantumkan"}</dd>
          <dt>Dicatat</dt>
          <dd>{dateTime(o.created_at)}</dd>
          <dt>Sesi</dt>
          <dd>{o.session_id}</dd>
        </dl>
        <div className="order-total">
          <span>Total pesanan</span>
          <strong>{money(o.total)}</strong>
        </div>
      </div>
      <div className="dialog-footer">
        <button className="button" onClick={close}>
          Tutup
        </button>
      </div>
    </dialog>
  );
}
