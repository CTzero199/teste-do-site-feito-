import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Scissors, Users, CalendarClock, DollarSign, Plus, Edit3, Trash2, Check, X, Clock, ShieldCheck, ShieldOff, Crown, Banknote, Crown as CrownIcon } from "lucide-react";
import Layout from "@/components/Layout";
import api, { apiError } from "@/lib/api";
import { formatCurrency, formatDateBR, WEEKDAYS } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";

const statusLabel = { pending: "Pendente", confirmed: "Confirmado", cancelled: "Cancelado", completed: "Concluído" };
const subStatusLabel = { pending: "Aguardando pagamento", pending_cash: "Dinheiro (a confirmar)", active: "Ativo", cancelled: "Cancelado" };
const subStatusClass = { pending: "text-amber-300", pending_cash: "text-amber-300", active: "text-emerald-400", cancelled: "text-rose-300" };
const blankService = { name: "", description: "", category: "Cortes", duration_minutes: 30, price_cents: 0, active: true };
const CATEGORIES = ["Cortes", "Barba", "Sobrancelha", "Pintura", "Extras"];
const blankBarber = { name: "", bio: "", specialties: [], image_url: "", rating: 5, active: true, service_ids: [], availabilities: [] };

export default function Admin() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState("agenda");
  const [data, setData] = useState(null);
  const [users, setUsers] = useState([]);
  const [subs, setSubs] = useState([]);
  const [editService, setEditService] = useState(null);
  const [editBarber, setEditBarber] = useState(null);

  useEffect(() => {
    if (user === false) navigate("/login", { replace: true });
    if (user && user.role && user.role !== "admin") navigate("/minha-conta", { replace: true });
  }, [user, navigate]);

  const load = () => api.get("/admin/overview").then((r) => setData(r.data)).catch((e) => toast.error(apiError(e.response?.data?.detail)));
  const loadUsers = () => api.get("/admin/users").then((r) => setUsers(r.data)).catch(() => {});
  const loadSubs = () => api.get("/admin/subscriptions").then((r) => setSubs(r.data)).catch(() => {});
  useEffect(() => { if (user?.role === "admin") { load(); loadUsers(); loadSubs(); } }, [user]);

  const saveService = async (v) => {
    try { await api.post("/admin/services", v); toast.success("Serviço salvo."); setEditService(null); load(); }
    catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };
  const delService = async (id) => { try { await api.delete(`/admin/services/${id}`); toast.success("Serviço removido."); load(); } catch (e) { toast.error(apiError(e.response?.data?.detail)); } };
  const saveBarber = async (v) => {
    try { await api.post("/admin/barbers", v); toast.success("Barbeiro salvo."); setEditBarber(null); load(); }
    catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };
  const delBarber = async (id) => { try { await api.delete(`/admin/barbers/${id}`); toast.success("Barbeiro removido."); load(); } catch (e) { toast.error(apiError(e.response?.data?.detail)); } };
  const setStatus = async (id, status) => { try { await api.put(`/admin/appointments/${id}/status`, { status }); load(); } catch (e) { toast.error(apiError(e.response?.data?.detail)); } };
  const confirmCash = async (id) => { try { await api.post(`/admin/appointments/${id}/confirm-cash`); toast.success("Pagamento em dinheiro confirmado."); load(); } catch (e) { toast.error(apiError(e.response?.data?.detail)); } };
  const setRole = async (uid, role) => { try { await api.put(`/admin/users/${uid}/role`, { role }); toast.success(role === "admin" ? "Administrador concedido." : "Permissão removida."); loadUsers(); } catch (e) { toast.error(apiError(e.response?.data?.detail)); } };
  const confirmSub = async (id) => { try { await api.post(`/admin/subscriptions/${id}/confirm`); toast.success("Assinatura ativada."); loadSubs(); load(); } catch (e) { toast.error(apiError(e.response?.data?.detail)); } };
  const cancelSub = async (id) => { try { await api.post(`/admin/subscriptions/${id}/cancel`); toast.success("Assinatura cancelada."); loadSubs(); } catch (e) { toast.error(apiError(e.response?.data?.detail)); } };

  if (!user || user.role !== "admin") return <Layout><div className="grid min-h-[60vh] place-items-center text-muted-foreground">Carregando painel…</div></Layout>;
  if (!data) return <Layout><div className="grid min-h-[60vh] place-items-center text-muted-foreground">Carregando dados…</div></Layout>;

  const stats = data.stats;
  const tabs = [["agenda", "Agenda"], ["assinaturas", "Assinaturas"], ["usuarios", "Usuários"], ["servicos", "Serviços"], ["barbeiros", "Barbeiros"]];

  return (
    <Layout>
      <main className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
        <p className="eyebrow">Painel administrativo</p>
        <h1 className="mt-3 font-display text-5xl text-foreground sm:text-6xl">Operação Padrão RD</h1>
        <p className="mt-2 text-muted-foreground">Olá, {user.name?.split(" ")[0]}. Gerencie planos, acessos, serviços, barbeiros e agenda.</p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric icon={DollarSign} label="Faturamento (pago)" value={formatCurrency(stats.revenue_cents)} />
          <Metric icon={CrownIcon} label="Assinaturas ativas" value={stats.active_subscriptions} />
          <Metric icon={CalendarClock} label="Agendamentos" value={stats.appointments} />
          <Metric icon={Users} label="Barbeiros" value={stats.barbers} />
          <Metric icon={Scissors} label="Serviços" value={stats.services} />
        </div>

        <div className="mt-10 flex flex-wrap gap-2 border-b border-gold-soft">
          {tabs.map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} data-testid={`tab-${k}`}
              className={`px-5 py-3 font-cond uppercase tracking-widest text-sm transition-colors ${tab === k ? "border-b-2 border-gold text-gold" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>
          ))}
        </div>

        {tab === "agenda" && (
          <div className="mt-8 card-dark overflow-x-auto p-5 sm:p-6" data-testid="admin-appointments">
            {data.appointments.length ? (
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-gold-soft font-cond text-xs uppercase tracking-widest text-muted-foreground">
                  <tr><th className="pb-3">Cliente</th><th className="pb-3">Horário</th><th className="pb-3">Serviço</th><th className="pb-3">Barbeiro</th><th className="pb-3">Pagamento</th><th className="pb-3">Status</th></tr>
                </thead>
                <tbody>
                  {data.appointments.map((a) => (
                    <tr key={a.id} className="border-b border-white/5" data-testid={`admin-appt-${a.id}`}>
                      <td className="py-4 font-medium text-foreground">{a.customer_name || "—"}</td>
                      <td className="py-4">{formatDateBR(a.date, a.time)}</td>
                      <td className="py-4">{a.service_name}<br /><span className="text-xs text-muted-foreground">{formatCurrency(a.price_cents)}</span></td>
                      <td className="py-4">{a.barber_name}</td>
                      <td className="py-4">
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex items-center gap-1 text-xs">{a.payment_method === "cash" ? <Banknote className="size-3.5 text-amber-300" /> : null}{a.payment_method === "cash" ? "Dinheiro" : "Cartão"}</span>
                          <span className={a.payment_status === "paid" ? "text-emerald-400" : "text-muted-foreground"}>{a.payment_status === "paid" ? "Pago" : "Pendente"}</span>
                          {a.payment_method === "cash" && a.payment_status !== "paid" && (
                            <button onClick={() => confirmCash(a.id)} className="mt-1 inline-flex items-center gap-1 rounded-sm border border-emerald-400/40 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-400/10" data-testid={`confirm-cash-${a.id}`}><Check className="size-3" /> Confirmar dinheiro</button>
                          )}
                        </div>
                      </td>
                      <td className="py-4">
                        <select value={a.status} onChange={(e) => setStatus(a.id, e.target.value)} className="border border-gold-soft bg-ink px-2 py-1.5 text-sm" data-testid={`status-${a.id}`}>
                          {Object.entries(statusLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-sm text-muted-foreground">Nenhum agendamento ainda.</p>}
          </div>
        )}

        {tab === "assinaturas" && (
          <div className="mt-8 card-dark overflow-x-auto p-5 sm:p-6" data-testid="admin-subscriptions">
            {subs.length ? (
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-gold-soft font-cond text-xs uppercase tracking-widest text-muted-foreground">
                  <tr><th className="pb-3">Cliente</th><th className="pb-3">Plano</th><th className="pb-3">Valor/mês</th><th className="pb-3">Forma</th><th className="pb-3">Status</th><th className="pb-3">Ações</th></tr>
                </thead>
                <tbody>
                  {subs.map((s) => (
                    <tr key={s.id} className="border-b border-white/5" data-testid={`sub-row-${s.id}`}>
                      <td className="py-4 text-foreground">{s.customer_name || "—"}<br /><span className="text-xs text-muted-foreground">{s.customer_email}</span></td>
                      <td className="py-4">{s.plan_name}</td>
                      <td className="py-4">{formatCurrency(s.price_cents)}</td>
                      <td className="py-4">{s.method === "cash" ? "Dinheiro" : "Cartão"}</td>
                      <td className="py-4"><span className={subStatusClass[s.status] || "text-muted-foreground"}>{subStatusLabel[s.status] || s.status}</span></td>
                      <td className="py-4">
                        <div className="flex gap-1">
                          {s.status !== "active" && <button onClick={() => confirmSub(s.id)} className="inline-flex items-center gap-1 rounded-sm border border-emerald-400/40 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-400/10" data-testid={`confirm-sub-${s.id}`}><Check className="size-3" /> Ativar</button>}
                          {s.status !== "cancelled" && <button onClick={() => cancelSub(s.id)} className="inline-flex items-center gap-1 rounded-sm border border-rose-400/40 px-2 py-1 text-xs text-rose-300 hover:bg-rose-400/10" data-testid={`cancel-sub-${s.id}`}><X className="size-3" /> Cancelar</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-sm text-muted-foreground">Nenhuma assinatura ainda.</p>}
          </div>
        )}

        {tab === "usuarios" && (
          <div className="mt-8 card-dark overflow-x-auto p-5 sm:p-6" data-testid="admin-users">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-gold-soft font-cond text-xs uppercase tracking-widest text-muted-foreground">
                <tr><th className="pb-3">Nome</th><th className="pb-3">E-mail</th><th className="pb-3">Método</th><th className="pb-3">Papel</th><th className="pb-3">Ação</th></tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.user_id} className="border-b border-white/5" data-testid={`user-row-${u.user_id}`}>
                    <td className="py-4 font-medium text-foreground">{u.name || "—"} {u.is_owner && <Crown className="ml-1 inline size-3.5 text-gold" />}</td>
                    <td className="py-4">{u.email}</td>
                    <td className="py-4 text-muted-foreground">{u.auth_method === "google" ? "Google" : "Senha"}</td>
                    <td className="py-4"><span className={`inline-flex px-2 py-1 font-cond text-xs uppercase tracking-wide ${u.role === "admin" ? "bg-gold/15 text-gold" : "bg-white/5 text-muted-foreground"}`}>{u.role === "admin" ? "Administrador" : "Cliente"}</span></td>
                    <td className="py-4">
                      {u.is_owner ? <span className="text-xs text-muted-foreground">Principal</span> :
                        u.role === "admin"
                          ? <button onClick={() => setRole(u.user_id, "user")} className="inline-flex items-center gap-1 rounded-sm border border-rose-400/40 px-2 py-1 text-xs text-rose-300 hover:bg-rose-400/10" data-testid={`revoke-admin-${u.user_id}`}><ShieldOff className="size-3" /> Remover admin</button>
                          : <button onClick={() => setRole(u.user_id, "admin")} className="inline-flex items-center gap-1 rounded-sm border border-gold/40 px-2 py-1 text-xs text-gold hover:bg-gold/10" data-testid={`grant-admin-${u.user_id}`}><ShieldCheck className="size-3" /> Tornar admin</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "servicos" && (
          <div className="mt-8 card-dark p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-cond text-xl uppercase tracking-wide text-foreground">Serviços</h2>
              <button onClick={() => setEditService(blankService)} className="btn-gold py-2 text-sm" data-testid="new-service"><Plus className="size-4" /> Novo</button>
            </div>
            {editService && <ServiceEditor initial={editService} onCancel={() => setEditService(null)} onSave={saveService} />}
            <div className="mt-5 space-y-2">
              {data.services.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-4 border border-gold-soft bg-ink p-3" data-testid={`service-row-${s.id}`}>
                  <div><strong className="text-foreground">{s.name}</strong><p className="text-xs text-muted-foreground">{s.category || "Cortes"} · {s.duration_minutes}min · {formatCurrency(s.price_cents)} · {s.active ? "Ativo" : "Pausado"}</p></div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditService(s)} className="p-2 text-muted-foreground hover:text-gold" data-testid={`edit-service-${s.id}`}><Edit3 className="size-4" /></button>
                    <button onClick={() => delService(s.id)} className="p-2 text-muted-foreground hover:text-rose-400" data-testid={`del-service-${s.id}`}><Trash2 className="size-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "barbeiros" && (
          <div className="mt-8 card-dark p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-cond text-xl uppercase tracking-wide text-foreground">Barbeiros</h2>
              <button onClick={() => setEditBarber(blankBarber)} className="btn-gold py-2 text-sm" data-testid="new-barber"><Plus className="size-4" /> Novo</button>
            </div>
            {editBarber && <BarberEditor initial={editBarber} services={data.services} onCancel={() => setEditBarber(null)} onSave={saveBarber} />}
            <div className="mt-5 space-y-2">
              {data.barbers.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-4 border border-gold-soft bg-ink p-3" data-testid={`barber-row-${b.id}`}>
                  <div className="flex items-center gap-3">
                    {b.image_url ? <img src={b.image_url} alt={b.name} className="size-10 rounded-sm object-cover" /> : <span className="grid size-10 place-items-center border border-gold text-gold">{b.name[0]}</span>}
                    <div><strong className="text-foreground">{b.name}</strong><p className="text-xs text-muted-foreground">{b.active ? "Ativo" : "Pausado"} · {b.specialties.join(", ") || "Sem especialidades"} · {b.availabilities.length} horários</p></div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditBarber({ ...b })} className="p-2 text-muted-foreground hover:text-gold" data-testid={`edit-barber-${b.id}`}><Edit3 className="size-4" /></button>
                    <button onClick={() => delBarber(b.id)} className="p-2 text-muted-foreground hover:text-rose-400" data-testid={`del-barber-${b.id}`}><Trash2 className="size-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </Layout>
  );
}

function Metric({ icon: Icon, label, value }) {
  return <div className="card-dark p-5"><Icon className="size-5 text-gold" /><strong className="mt-4 block font-display text-3xl text-foreground">{value}</strong><span className="font-cond text-xs uppercase tracking-widest text-muted-foreground">{label}</span></div>;
}

function ServiceEditor({ initial, onCancel, onSave }) {
  const [f, setF] = useState({ ...blankService, ...initial });
  return (
    <div className="mt-5 grid gap-3 border-y border-gold-soft py-5 sm:grid-cols-2" data-testid="service-editor">
      <input value={f.name} placeholder="Nome" onChange={(e) => setF({ ...f, name: e.target.value })} className="field-dark" data-testid="svc-name" />
      <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className="field-dark" data-testid="svc-category">{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
      <input type="number" value={f.duration_minutes} min={10} step={5} onChange={(e) => setF({ ...f, duration_minutes: Number(e.target.value) })} placeholder="Duração (min)" className="field-dark" data-testid="svc-duration" />
      <input type="number" value={f.price_cents / 100} min={0} step="0.01" onChange={(e) => setF({ ...f, price_cents: Math.round(Number(e.target.value) * 100) })} placeholder="Preço R$" className="field-dark" data-testid="svc-price" />
      <select value={f.active ? "yes" : "no"} onChange={(e) => setF({ ...f, active: e.target.value === "yes" })} className="field-dark sm:col-span-2"><option value="yes">Ativo</option><option value="no">Pausado</option></select>
      <textarea value={f.description} placeholder="Descrição" onChange={(e) => setF({ ...f, description: e.target.value })} className="field-dark sm:col-span-2" data-testid="svc-desc" />
      <div className="flex gap-2 sm:col-span-2">
        <button onClick={() => onSave(f)} disabled={!f.name} className="btn-gold py-2 text-sm" data-testid="svc-save"><Check className="size-4" /> Salvar</button>
        <button onClick={onCancel} className="btn-outline-gold py-2 text-sm">Cancelar</button>
      </div>
    </div>
  );
}

function BarberEditor({ initial, services, onCancel, onSave }) {
  const [f, setF] = useState({ ...blankBarber, ...initial });
  const [av, setAv] = useState({ weekday: 1, start_time: "09:00", end_time: "18:00" });
  const toggleService = (id) => setF((c) => ({ ...c, service_ids: c.service_ids.includes(id) ? c.service_ids.filter((x) => x !== id) : [...c.service_ids, id] }));
  const addAv = () => setF((c) => ({ ...c, availabilities: [...c.availabilities, { ...av, weekday: Number(av.weekday) }] }));
  const removeAv = (i) => setF((c) => ({ ...c, availabilities: c.availabilities.filter((_, idx) => idx !== i) }));
  return (
    <div className="mt-5 grid gap-3 border-y border-gold-soft py-5 sm:grid-cols-2" data-testid="barber-editor">
      <input value={f.name} placeholder="Nome" onChange={(e) => setF({ ...f, name: e.target.value })} className="field-dark" data-testid="barber-name" />
      <input value={f.image_url} placeholder="URL da foto" onChange={(e) => setF({ ...f, image_url: e.target.value })} className="field-dark" data-testid="barber-image" />
      <input type="number" value={f.rating} min={0} max={5} step="0.1" onChange={(e) => setF({ ...f, rating: Number(e.target.value) })} placeholder="Avaliação" className="field-dark" data-testid="barber-rating" />
      <select value={f.active ? "yes" : "no"} onChange={(e) => setF({ ...f, active: e.target.value === "yes" })} className="field-dark"><option value="yes">Ativo</option><option value="no">Pausado</option></select>
      <textarea value={f.bio} placeholder="Bio" onChange={(e) => setF({ ...f, bio: e.target.value })} className="field-dark sm:col-span-2" data-testid="barber-bio" />
      <input value={f.specialties.join(", ")} placeholder="Especialidades (vírgula)" onChange={(e) => setF({ ...f, specialties: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} className="field-dark sm:col-span-2" data-testid="barber-specialties" />
      <div className="sm:col-span-2">
        <p className="mb-2 font-cond text-xs uppercase tracking-widest text-muted-foreground">Serviços que atende</p>
        <div className="flex flex-wrap gap-2">
          {services.map((s) => (
            <button key={s.id} type="button" onClick={() => toggleService(s.id)} data-testid={`barber-svc-${s.id}`}
              className={`border px-3 py-2 font-cond text-sm uppercase tracking-wide ${f.service_ids.includes(s.id) ? "border-gold bg-gold/10 text-gold" : "border-gold-soft text-muted-foreground"}`}>{s.name}</button>
          ))}
        </div>
      </div>
      <div className="sm:col-span-2">
        <p className="mb-2 font-cond text-xs uppercase tracking-widest text-muted-foreground">Horários de trabalho</p>
        <div className="grid gap-2 sm:grid-cols-4">
          <select value={av.weekday} onChange={(e) => setAv({ ...av, weekday: e.target.value })} className="field-dark" data-testid="av-weekday">{WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
          <input type="time" value={av.start_time} onChange={(e) => setAv({ ...av, start_time: e.target.value })} className="field-dark" data-testid="av-start" />
          <input type="time" value={av.end_time} onChange={(e) => setAv({ ...av, end_time: e.target.value })} className="field-dark" data-testid="av-end" />
          <button type="button" onClick={addAv} className="btn-gold py-2 text-sm" data-testid="av-add"><Plus className="size-4" /> Add</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {f.availabilities.map((a, i) => (
            <span key={i} className="inline-flex items-center gap-2 border border-gold-soft px-3 py-2 text-sm text-foreground">
              <Clock className="size-3.5 text-gold" /> {WEEKDAYS[a.weekday]} {a.start_time}–{a.end_time}
              <button type="button" onClick={() => removeAv(i)} className="text-muted-foreground hover:text-rose-400"><X className="size-3.5" /></button>
            </span>
          ))}
        </div>
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <button onClick={() => onSave(f)} disabled={!f.name} className="btn-gold py-2 text-sm" data-testid="barber-save"><Check className="size-4" /> Salvar</button>
        <button onClick={onCancel} className="btn-outline-gold py-2 text-sm">Cancelar</button>
      </div>
    </div>
  );
}
