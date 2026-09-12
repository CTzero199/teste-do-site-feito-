import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, Star, Scissors, Clock, ShieldCheck, MapPin, Crown } from "lucide-react";
import Layout from "@/components/Layout";
import api from "@/lib/api";
import { formatCurrency } from "@/lib/format";

const CATEGORY_ORDER = ["Cortes", "Barba", "Sobrancelha", "Pintura", "Extras"];

export default function Home() {
  const navigate = useNavigate();
  const [data, setData] = useState({ services: [], barbers: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/catalog").then((r) => setData(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-gold-soft">
        <img
          src="https://images.unsplash.com/photo-1585747860715-2ba37e788b70?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODh8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBiYXJiZXJzaG9wJTIwZGFyayUyMGludGVyaW9yfGVufDB8fHx8MTc4ODY0MDk4OXww&ixlib=rb-4.1.0&q=85"
          alt="Barbearia Padrão RD" className="absolute inset-0 h-full w-full object-cover opacity-25" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/80 to-ink/40" />
        <div className="relative mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32 lg:py-40">
          <div className="max-w-2xl animate-fade-up">
            <div className="inline-flex items-center gap-2 border border-gold-soft px-4 py-1.5">
              <Crown className="size-3.5 text-gold" />
              <span className="eyebrow">Tradição & Padrão de elite</span>
            </div>
            <h1 className="mt-8 font-display text-6xl leading-[0.92] tracking-tight text-foreground sm:text-7xl lg:text-8xl">
              O corte que <span className="text-gold italic">define</span> o seu padrão.
            </h1>
            <p className="mt-8 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
              Na Padrão RD, cada detalhe é milimetricamente cuidado. Escolha seu barbeiro, marque seu horário e finalize com pagamento seguro — tudo em minutos.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <button onClick={() => navigate("/agendar")} className="btn-gold" data-testid="hero-book-button">
                Agendar horário <ArrowUpRight className="size-4" />
              </button>
              <button onClick={() => navigate("/planos")} className="btn-outline-gold" data-testid="hero-plans-button">
                <Crown className="size-4" /> Ver planos
              </button>
            </div>
            <div className="mt-14 flex gap-10 border-l-2 border-gold pl-5">
              <div><p className="font-display text-3xl text-foreground">+12k</p><p className="eyebrow mt-1">cortes feitos</p></div>
              <div><p className="font-display text-3xl text-foreground">4.9<Star className="mb-1 ml-1 inline size-4 fill-gold text-gold" /></p><p className="eyebrow mt-1">avaliação</p></div>
              <div><p className="font-display text-3xl text-foreground">100%</p><p className="eyebrow mt-1">online</p></div>
            </div>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="servicos" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28">
        <div className="grid gap-5 md:grid-cols-2 md:items-end">
          <div>
            <p className="eyebrow">O menu da casa</p>
            <h2 className="mt-3 font-display text-5xl text-foreground sm:text-6xl">Serviços premium</h2>
          </div>
          <p className="max-w-lg text-muted-foreground">Cada serviço é executado com técnica, produtos de alta linha e o padrão RD de acabamento.</p>
        </div>
        <div className="mt-12 space-y-12">
          {loading ? <div className="grid gap-px border border-gold-soft bg-gold-soft md:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-40 animate-pulse bg-ink-surface" />)}</div> :
            CATEGORY_ORDER.filter((cat) => data.services.some((s) => (s.category || "Cortes") === cat)).map((cat) => (
              <div key={cat} data-testid={`menu-category-${cat}`}>
                <div className="mb-5 flex items-center gap-4">
                  <h3 className="font-cond text-lg uppercase tracking-[0.2em] text-gold">{cat}</h3>
                  <div className="h-px flex-1 gold-line opacity-40" />
                </div>
                <div className="grid gap-px overflow-hidden border border-gold-soft bg-gold-soft sm:grid-cols-2 lg:grid-cols-3">
                  {data.services.filter((s) => (s.category || "Cortes") === cat).map((s) => (
                    <article key={s.id} className="group flex items-center justify-between gap-4 bg-ink-surface p-5 transition-colors hover:bg-ink-elevated" data-testid={`service-card-${s.id}`}>
                      <div>
                        <h4 className="font-cond text-base uppercase tracking-wide text-foreground">{s.name}</h4>
                        <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock className="size-3" /> {s.duration_minutes}min</span>
                      </div>
                      <strong className="whitespace-nowrap font-display text-2xl text-gold">{formatCurrency(s.price_cents)}</strong>
                    </article>
                  ))}
                </div>
              </div>
            ))}
        </div>
      </section>

      {/* BARBERS */}
      <section id="time" className="border-y border-gold-soft bg-ink-surface/60 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="grid gap-5 md:grid-cols-2 md:items-end">
            <div>
              <p className="eyebrow">Mestres da navalha</p>
              <h2 className="mt-3 font-display text-5xl text-foreground sm:text-6xl">Nosso time</h2>
            </div>
            <p className="max-w-lg text-muted-foreground">Profissionais selecionados, cada um com sua especialidade. Escolha quem combina com o seu estilo.</p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {loading ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-96 animate-pulse card-dark" />) :
              data.barbers.map((b) => (
                <article key={b.id} className="group overflow-hidden card-dark transition-transform hover:-translate-y-1" data-testid={`barber-card-${b.id}`}>
                  <div className="relative h-64 overflow-hidden">
                    <img src={b.image_url} alt={b.name} className="h-full w-full object-cover grayscale transition-all duration-500 group-hover:grayscale-0" />
                    <div className="absolute inset-0 bg-gradient-to-t from-ink-surface to-transparent" />
                    <span className="absolute right-3 top-3 flex items-center gap-1 border border-gold-soft bg-ink/70 px-2 py-1 text-xs text-gold"><Star className="size-3 fill-gold" /> {b.rating.toFixed(1)}</span>
                  </div>
                  <div className="p-6">
                    <h3 className="font-display text-3xl text-foreground">{b.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{b.bio}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {b.specialties.map((sp) => (
                        <span key={sp} className="border border-gold-soft px-2 py-1 font-cond text-xs uppercase tracking-wide text-gold">{sp}</span>
                      ))}
                    </div>
                    <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground"><Star className="size-3 fill-gold text-gold" /> {b.rating.toFixed(1)} · {b.review_count} {b.review_count === 1 ? "avaliação" : "avaliações"}</p>
                    <button onClick={() => navigate("/agendar", { state: { barberId: b.id } })} data-testid={`barber-book-${b.id}`} className="btn-outline-gold mt-6 w-full py-2 text-sm">Agendar com {b.name.split(" ")[0]}</button>
                  </div>
                </article>
              ))}
          </div>
        </div>
      </section>

      {/* VALUES */}
      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28">
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            { icon: ShieldCheck, t: "Pagamento seguro", d: "Finalize o agendamento com pagamento integrado e criptografado." },
            { icon: Clock, t: "Agenda em tempo real", d: "Só aparecem os horários realmente livres do barbeiro escolhido." },
            { icon: MapPin, t: "Padrão de elite", d: "Ambiente premium, atendimento cavalheiro e acabamento impecável." },
          ].map((v) => (
            <div key={v.t} className="card-dark p-8">
              <v.icon className="size-6 text-gold" />
              <h3 className="mt-6 font-display text-2xl text-foreground">{v.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{v.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-gold-soft bg-gold py-16">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-5 sm:flex-row sm:items-end sm:px-8">
          <div>
            <p className="font-cond uppercase tracking-[0.2em] text-ink/70">Sua cadeira está reservada</p>
            <h2 className="mt-2 font-display text-5xl text-ink sm:text-6xl">Bora manter o padrão?</h2>
          </div>
          <button onClick={() => navigate("/agendar")} data-testid="cta-book-button" className="inline-flex items-center gap-2 rounded-sm bg-ink px-8 py-4 font-cond uppercase tracking-widest text-gold transition-transform hover:scale-[1.02]">
            Agendar agora <ArrowUpRight className="size-4" />
          </button>
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p className="font-display text-2xl text-foreground">Padrão <span className="text-gold">RD</span></p>
        <p>Barbearia • Agenda • Pagamento integrado</p>
        <a href="#top" className="font-cond uppercase tracking-widest text-gold">Voltar ao topo</a>
      </footer>
    </Layout>
  );
}
