import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Scissors, User as UserIcon, CalendarDays, Clock, Check, ArrowLeft, CreditCard, Banknote, Star } from "lucide-react";
import Layout from "@/components/Layout";
import api, { apiError } from "@/lib/api";
import { formatCurrency, formatDateBR } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";

const today = new Date().toISOString().slice(0, 10);
const CATEGORY_ORDER = ["Cortes", "Barba", "Sobrancelha", "Pintura", "Extras"];

export default function Booking() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [catalog, setCatalog] = useState({ services: [], barbers: [] });
  const [serviceIds, setServiceIds] = useState([]);
  const [barbers, setBarbers] = useState([]);
  const [barberId, setBarberId] = useState(location.state?.barberId || null);
  const [date, setDate] = useState(today);
  const [slots, setSlots] = useState([]);
  const [time, setTime] = useState(null);
  const [note, setNote] = useState("");
  const [phone, setPhone] = useState("");
  const [method, setMethod] = useState("online");
  const [busy, setBusy] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => { if (user && user.phone) setPhone(user.phone); }, [user]);
  useEffect(() => { api.get("/catalog").then((r) => setCatalog(r.data)).catch(() => {}); }, []);

  const idsKey = serviceIds.join(",");
  useEffect(() => {
    if (!serviceIds.length) { setBarbers([]); return; }
    api.get("/barbers/for-services", { params: { service_ids: idsKey } }).then((r) => setBarbers(r.data)).catch(() => setBarbers([]));
  }, [idsKey]);

  useEffect(() => {
    if (!serviceIds.length || !barberId || !date) { setSlots([]); return; }
    setLoadingSlots(true);
    api.get("/availability/slots", { params: { barber_id: barberId, service_ids: idsKey, date } })
      .then((r) => setSlots(r.data)).catch(() => setSlots([])).finally(() => setLoadingSlots(false));
  }, [idsKey, barberId, date]);

  const chosen = useMemo(() => catalog.services.filter((s) => serviceIds.includes(s.id)), [catalog, serviceIds]);
  const total = useMemo(() => chosen.reduce((sum, s) => sum + s.price_cents, 0), [chosen]);
  const barber = useMemo(() => barbers.find((b) => b.id === barberId) || catalog.barbers.find((b) => b.id === barberId), [barbers, catalog, barberId]);

  const toggleService = (id) => {
    setServiceIds((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
    setBarberId(null); setTime(null);
  };
  const chooseBarber = (id) => { setBarberId(id); setTime(null); };

  const submit = async () => {
    if (!user) { toast.info("Entre para finalizar o agendamento."); navigate("/login"); return; }
    if (!serviceIds.length || !barberId || !time) { toast.error("Escolha serviço(s), barbeiro, data e horário."); return; }
    if (!phone.trim()) { toast.error("Informe seu WhatsApp para receber a confirmação."); return; }
    setBusy(true);
    try {
      const { data: appt } = await api.post("/appointments", { barber_id: barberId, service_ids: serviceIds, date, time, customer_note: note, phone, payment_method: method });
      if (method === "cash") {
        toast.success("Agendamento criado! Pague em dinheiro na barbearia. O administrador confirmará.");
        navigate("/minha-conta");
        return;
      }
      const { data } = await api.post("/payments/checkout", { appointment_id: appt.id, origin_url: window.location.origin });
      window.location.href = data.checkout_url;
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail) || err.message);
      setBusy(false);
    }
  };

  return (
    <Layout>
      <main className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
        <button onClick={() => navigate("/")} className="mb-8 inline-flex items-center gap-2 font-cond uppercase tracking-widest text-sm text-muted-foreground hover:text-gold" data-testid="booking-back"><ArrowLeft className="size-4" /> Voltar</button>
        <div className="grid gap-12 lg:grid-cols-[1fr_380px]">
          <section>
            <p className="eyebrow">Agenda online</p>
            <h1 className="mt-3 font-display text-5xl text-foreground sm:text-6xl">Marque seu horário</h1>
            <p className="mt-4 max-w-xl text-muted-foreground">Você pode escolher mais de um serviço. Só aparecem os horários realmente livres do barbeiro escolhido.</p>

            <div className="mt-12 space-y-12">
              <Step n="01" icon={Scissors} title="Escolha o(s) serviço(s)">
                <div className="space-y-6">
                  {CATEGORY_ORDER.filter((cat) => catalog.services.some((s) => (s.category || "Cortes") === cat)).map((cat) => (
                    <div key={cat}>
                      <p className="mb-2 font-cond text-xs uppercase tracking-[0.2em] text-gold">{cat}</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {catalog.services.filter((s) => (s.category || "Cortes") === cat).map((s) => {
                          const on = serviceIds.includes(s.id);
                          return (
                            <button key={s.id} onClick={() => toggleService(s.id)} data-testid={`select-service-${s.id}`}
                              className={`card-dark flex items-center justify-between gap-3 p-4 text-left transition-colors hover:border-gold ${on ? "border-gold bg-gold/10" : ""}`}>
                              <span className="flex items-center gap-3">
                                <span className={`grid size-5 shrink-0 place-items-center rounded-sm border ${on ? "border-gold bg-gold text-ink" : "border-gold-soft"}`}>{on && <Check className="size-3.5" />}</span>
                                <span>
                                  <span className="block font-cond uppercase tracking-wide text-foreground">{s.name}</span>
                                  <span className="mt-0.5 block text-xs text-muted-foreground">{s.duration_minutes}min</span>
                                </span>
                              </span>
                              <strong className="whitespace-nowrap font-display text-xl text-gold">{formatCurrency(s.price_cents)}</strong>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </Step>

              <Step n="02" icon={UserIcon} title="Qual barbeiro?">
                {!serviceIds.length ? <Notice text="Escolha ao menos um serviço primeiro." /> :
                  barbers.length ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {barbers.map((b) => (
                        <button key={b.id} onClick={() => chooseBarber(b.id)} data-testid={`select-barber-${b.id}`}
                          className={`card-dark flex items-center gap-4 p-4 text-left transition-colors hover:border-gold ${barberId === b.id ? "border-gold bg-gold/10" : ""}`}>
                          <img src={b.image_url} alt={b.name} className="size-14 rounded-sm object-cover" />
                          <div>
                            <strong className="block font-cond uppercase tracking-wide text-foreground">{b.name}</strong>
                            <span className="flex items-center gap-1 text-xs text-gold"><Star className="size-3 fill-gold" /> {b.rating.toFixed(1)}</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">{b.specialties.join(" · ")}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : <Notice text="Nenhum barbeiro atende todos os serviços selecionados. Ajuste a seleção." />}
              </Step>

              <Step n="03" icon={CalendarDays} title="Escolha a data">
                <input type="date" min={today} value={date} onChange={(e) => { setDate(e.target.value); setTime(null); }} className="field-dark max-w-xs" data-testid="select-date" />
              </Step>

              <Step n="04" icon={Clock} title="Escolha o horário">
                {!barberId ? <Notice text="Escolha um barbeiro para ver a agenda." /> :
                  loadingSlots ? <Notice text="Carregando horários…" /> :
                    slots.length ? (
                      <div className="flex flex-wrap gap-2" data-testid="slots-list">
                        {slots.map((s) => (
                          <button key={s.time} onClick={() => setTime(s.time)} data-testid={`slot-${s.time}`}
                            className={`slot-chip ${time === s.time ? "slot-chip--active" : ""}`}>
                            {time === s.time && <Check className="size-3.5" />}{s.time}
                          </button>
                        ))}
                      </div>
                    ) : <Notice text="Sem horários livres nesse dia. Tente outra data ou barbeiro." />}
              </Step>
            </div>
          </section>

          <aside className="card-dark h-fit p-6 lg:sticky lg:top-28" data-testid="booking-summary">
            <p className="eyebrow">Resumo</p>
            <div className="mt-6 space-y-5 text-sm">
              <div>
                <p className="font-cond text-xs uppercase tracking-widest text-muted-foreground">Serviços</p>
                {chosen.length ? (
                  <ul className="mt-1 space-y-1">
                    {chosen.map((s) => <li key={s.id} className="flex justify-between text-foreground"><span>{s.name}</span><span className="text-muted-foreground">{formatCurrency(s.price_cents)}</span></li>)}
                  </ul>
                ) : <p className="mt-1 font-medium text-foreground">—</p>}
              </div>
              <Row label="Barbeiro" value={barber ? barber.name : "—"} />
              <Row label="Data e hora" value={time ? formatDateBR(date, time) : "—"} />
              <div className="flex items-center justify-between border-t border-gold-soft pt-4">
                <span className="font-cond uppercase tracking-widest text-muted-foreground">Total</span>
                <strong className="font-display text-3xl text-gold">{formatCurrency(total)}</strong>
              </div>
            </div>

            <p className="mt-6 font-cond text-xs uppercase tracking-widest text-muted-foreground">Forma de pagamento</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button onClick={() => setMethod("online")} data-testid="method-online"
                className={`flex flex-col items-center gap-1 rounded-sm border px-3 py-3 text-xs font-cond uppercase tracking-wide transition-colors ${method === "online" ? "border-gold bg-gold/10 text-gold" : "border-gold-soft text-muted-foreground"}`}>
                <CreditCard className="size-4" /> Cartão
              </button>
              <button onClick={() => setMethod("cash")} data-testid="method-cash"
                className={`flex flex-col items-center gap-1 rounded-sm border px-3 py-3 text-xs font-cond uppercase tracking-wide transition-colors ${method === "cash" ? "border-gold bg-gold/10 text-gold" : "border-gold-soft text-muted-foreground"}`}>
                <Banknote className="size-4" /> Dinheiro
              </button>
            </div>

            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="WhatsApp (DDD + número)" className="field-dark mt-4" data-testid="booking-phone" />
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observação para o barbeiro (opcional)" className="field-dark mt-3 min-h-20" data-testid="booking-note" />
            <button onClick={submit} disabled={busy || !time} className="btn-gold mt-4 w-full" data-testid="pay-button">
              {method === "cash" ? <Banknote className="size-4" /> : <CreditCard className="size-4" />}
              {busy ? "Processando…" : method === "cash" ? "Agendar e pagar em dinheiro" : user ? "Pagar e confirmar" : "Entrar e pagar"}
            </button>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{method === "cash" ? "Pagamento em dinheiro na barbearia — o administrador confirma presencialmente." : "Pagamento seguro via Stripe. Confirmação enviada no seu WhatsApp."}</p>
          </aside>
        </div>
      </main>
    </Layout>
  );
}

function Step({ n, icon: Icon, title, children }) {
  return (
    <section className="border-t border-gold-soft pt-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="font-display text-3xl text-gold">{n}</span>
        <span className="grid size-8 place-items-center rounded-sm border border-gold-soft text-gold"><Icon className="size-4" /></span>
        <h2 className="font-cond text-lg uppercase tracking-wide text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  );
}
function Notice({ text }) { return <div className="border border-dashed border-gold-soft bg-ink-surface/40 p-4 text-sm text-muted-foreground">{text}</div>; }
function Row({ label, value }) { return <div><p className="font-cond text-xs uppercase tracking-widest text-muted-foreground">{label}</p><p className="mt-1 font-medium text-foreground">{value}</p></div>; }
