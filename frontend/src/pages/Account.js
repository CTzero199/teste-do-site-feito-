import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CalendarClock, Save, X, LogOut, Plus, Star, Send, Crown } from "lucide-react";
import Layout from "@/components/Layout";
import api, { apiError } from "@/lib/api";
import { formatDateBR, formatCurrency } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";

const statusLabel = { pending: "Pendente", confirmed: "Confirmado", cancelled: "Cancelado", completed: "Concluído" };
const subStatusLabel = { pending: "Aguardando pagamento", pending_cash: "Dinheiro (a confirmar)", active: "Ativo", cancelled: "Cancelado" };
const subStatusClass = { pending: "bg-amber-400/15 text-amber-300", pending_cash: "bg-amber-400/15 text-amber-300", active: "bg-emerald-400/15 text-emerald-300", cancelled: "bg-rose-400/15 text-rose-300" };
const statusClass = {
  pending: "bg-amber-400/15 text-amber-300", confirmed: "bg-gold/15 text-gold",
  cancelled: "bg-rose-400/15 text-rose-300", completed: "bg-sky-400/15 text-sky-300",
};

export default function Account() {
  const navigate = useNavigate();
  const { user, logout, saveProfile } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [subs, setSubs] = useState([]);
  const [form, setForm] = useState({ phone: "", birthday: "", notes: "" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user === false) navigate("/login", { replace: true });
    if (user && user.role) setForm({ phone: user.phone || "", birthday: user.birthday || "", notes: user.notes || "" });
  }, [user, navigate]);

  const load = () => api.get("/appointments/me").then((r) => setAppointments(r.data)).catch(() => {}).finally(() => setLoading(false));
  const loadSubs = () => api.get("/subscriptions/me").then((r) => setSubs(r.data)).catch(() => {});
  const cancelSub = async (id) => {
    try { await api.post(`/subscriptions/${id}/cancel`); toast.success("Assinatura cancelada."); loadSubs(); }
    catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };
  useEffect(() => { if (user && user.role) { load(); loadSubs(); } }, [user]);

  const save = async () => {
    try { await saveProfile(form); toast.success("Perfil atualizado."); }
    catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };
  const cancel = async (id) => {
    try { await api.post(`/appointments/${id}/cancel`); toast.success("Agendamento cancelado."); load(); }
    catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };
  const [reviewing, setReviewing] = useState(null);
  const submitReview = async (id, rating, comment) => {
    try { await api.post(`/appointments/${id}/review`, { rating, comment }); toast.success("Avaliação enviada. Obrigado!"); setReviewing(null); load(); }
    catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };

  if (!user || !user.role) return <Layout><div className="grid min-h-[60vh] place-items-center text-muted-foreground">Carregando…</div></Layout>;

  return (
    <Layout>
      <main className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <section className="card-dark h-fit p-6 sm:p-8" data-testid="profile-card">
            <div className="flex items-center gap-4">
              {user.picture ? <img src={user.picture} alt={user.name} className="size-14 rounded-full object-cover ring-1 ring-gold-soft" /> :
                <span className="grid size-14 place-items-center rounded-full border border-gold bg-gold/10 font-display text-2xl text-gold">{user.name?.[0]?.toUpperCase() || "?"}</span>}
              <div>
                <p className="eyebrow">Seu perfil</p>
                <h1 className="font-display text-3xl text-foreground">{user.name}</h1>
              </div>
            </div>
            <div className="mt-8 space-y-4">
              <input value={user.email} disabled className="field-dark opacity-60" data-testid="profile-email" />
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Telefone / WhatsApp" className="field-dark" data-testid="profile-phone" />
              <input type="date" value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} className="field-dark" data-testid="profile-birthday" />
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Preferências" className="field-dark min-h-24" data-testid="profile-notes" />
              <button onClick={save} className="btn-gold w-full" data-testid="save-profile"><Save className="size-4" /> Salvar perfil</button>
              <button onClick={logout} className="flex w-full items-center justify-center gap-2 py-2 font-cond uppercase tracking-widest text-sm text-muted-foreground hover:text-gold" data-testid="account-logout"><LogOut className="size-4" /> Sair</button>
            </div>
          </section>

          <section>
            {subs.length > 0 && (
              <div className="mb-8" data-testid="my-subscriptions">
                <p className="eyebrow">Minhas assinaturas</p>
                <h2 className="mt-2 font-display text-4xl text-foreground">Seus planos</h2>
                <div className="mt-4 space-y-3">
                  {subs.map((s) => (
                    <div key={s.id} className="card-dark p-5" data-testid={`sub-${s.id}`}>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <span className="grid size-11 shrink-0 place-items-center rounded-sm bg-gold/15 text-gold"><Crown className="size-5" /></span>
                          <div>
                            <p className="font-cond uppercase tracking-wide text-foreground">{s.plan_name}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{formatCurrency(s.price_cents)}/mês · {s.method === "cash" ? "Dinheiro" : "Cartão"}{s.status === "active" && s.next_renewal_date ? ` · renova ${new Date(s.next_renewal_date).toLocaleDateString("pt-BR")}` : ""}</p>
                          </div>
                        </div>
                        <span className={`inline-flex px-2 py-1 font-cond text-xs uppercase tracking-wide ${subStatusClass[s.status] || ""}`}>{subStatusLabel[s.status] || s.status}</span>
                      </div>
                      {s.usage && s.usage.length > 0 && (
                        <div className="mt-4 grid gap-3 border-t border-gold-soft pt-4 sm:grid-cols-3" data-testid={`sub-usage-${s.id}`}>
                          {s.usage.map((u) => {
                            const unlimited = u.limit === null || u.limit === undefined;
                            const remaining = unlimited ? null : Math.max(0, u.limit - u.used);
                            const pct = unlimited ? 100 : Math.min(100, (u.used / (u.limit || 1)) * 100);
                            return (
                              <div key={u.category}>
                                <div className="flex items-baseline justify-between">
                                  <span className="font-cond text-xs uppercase tracking-widest text-muted-foreground">{u.label}</span>
                                  <span className="font-cond text-xs text-gold">{unlimited ? "Ilimitado" : `${remaining} restantes`}</span>
                                </div>
                                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                                  <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="mt-1 block text-[0.65rem] text-muted-foreground">{unlimited ? `${u.used} usados` : `${u.used} de ${u.limit} usados`}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {["active", "pending", "pending_cash"].includes(s.status) && (
                        <div className="mt-4 flex justify-end">
                          <button onClick={() => cancelSub(s.id)} className="btn-outline-gold py-2 text-sm" data-testid={`cancel-sub-${s.id}`}><X className="size-4" /> Cancelar assinatura</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">Meus agendamentos</p>
                <h2 className="mt-2 font-display text-4xl text-foreground">Seus horários</h2>
              </div>
              <button onClick={() => navigate("/agendar")} className="btn-gold py-2 text-sm" data-testid="new-appointment"><Plus className="size-4" /> Novo</button>
            </div>
            <div className="mt-6 space-y-3" data-testid="appointments-list">
              {loading ? <div className="h-28 animate-pulse card-dark" /> :
                appointments.length ? appointments.map((a) => (
                  <article key={a.id} className="card-dark p-5" data-testid={`appointment-${a.id}`}>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex gap-4">
                        <span className="grid size-11 shrink-0 place-items-center rounded-sm bg-gold/15 text-gold"><CalendarClock className="size-5" /></span>
                        <div>
                          <p className="font-cond uppercase tracking-wide text-foreground">{a.service_name} <span className="normal-case text-muted-foreground">com {a.barber_name}</span></p>
                          <p className="mt-1 text-sm text-muted-foreground">{formatDateBR(a.date, a.time)} · {formatCurrency(a.price_cents)}</p>
                          <div className="mt-2 flex gap-2">
                            <span className={`inline-flex px-2 py-1 font-cond text-xs uppercase tracking-wide ${statusClass[a.status]}`}>{statusLabel[a.status]}</span>
                            {a.payment_status === "paid" && <span className="inline-flex px-2 py-1 font-cond text-xs uppercase tracking-wide bg-emerald-400/15 text-emerald-300">Pago</span>}
                            {a.reviewed && <span className="inline-flex items-center gap-1 px-2 py-1 font-cond text-xs uppercase tracking-wide bg-gold/15 text-gold"><Star className="size-3 fill-gold" /> Avaliado</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {a.payment_status === "paid" && !a.reviewed && (
                          <button onClick={() => setReviewing(reviewing === a.id ? null : a.id)} className="btn-gold py-2 text-sm" data-testid={`review-btn-${a.id}`}><Star className="size-4" /> Avaliar</button>
                        )}
                        {["pending", "confirmed"].includes(a.status) && (
                          <button onClick={() => cancel(a.id)} className="btn-outline-gold py-2 text-sm" data-testid={`cancel-${a.id}`}><X className="size-4" /> Cancelar</button>
                        )}
                      </div>
                    </div>
                    {reviewing === a.id && <ReviewForm appointmentId={a.id} barberName={a.barber_name} onSubmit={submitReview} />}
                  </article>
                )) : <div className="border border-dashed border-gold-soft p-8 text-center text-sm text-muted-foreground">Você ainda não tem agendamentos. A cadeira está te esperando.</div>}
            </div>
          </section>
        </div>
      </main>
    </Layout>
  );
}

function ReviewForm({ appointmentId, barberName, onSubmit }) {
  const [rating, setRating] = useState(5);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  return (
    <div className="mt-4 border-t border-gold-soft pt-4" data-testid={`review-form-${appointmentId}`}>
      <p className="font-cond text-xs uppercase tracking-widest text-muted-foreground">Como foi o atendimento com {barberName}?</p>
      <div className="mt-2 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)} onClick={() => setRating(n)} data-testid={`star-${appointmentId}-${n}`} aria-label={`${n} estrelas`}>
            <Star className={`size-6 transition-colors ${(hover || rating) >= n ? "fill-gold text-gold" : "text-muted-foreground"}`} />
          </button>
        ))}
      </div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Deixe um comentário (opcional)" className="field-dark mt-3 min-h-16" data-testid={`review-comment-${appointmentId}`} />
      <button onClick={() => onSubmit(appointmentId, rating, comment)} className="btn-gold mt-3 py-2 text-sm" data-testid={`review-submit-${appointmentId}`}><Send className="size-4" /> Enviar avaliação</button>
    </div>
  );
}
