import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { Menu, X, LayoutDashboard, User, LogOut, Scissors, Crown } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const links = [
  { to: "/", label: "Início" },
  { to: "/agendar", label: "Agendar" },
  { to: "/planos", label: "Planos" },
];

export default function SiteHeader() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-gold-soft bg-ink/85 backdrop-blur-md" data-testid="site-header">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 sm:px-8">
        <Link to="/" className="flex items-center gap-3" data-testid="logo-link">
          <img src="/logo-padrao-rd.jpg" alt="Padrão RD" className="h-11 w-11 rounded-sm object-cover ring-1 ring-gold-soft" />
          <div className="leading-none">
            <p className="font-display text-2xl text-foreground">Padrão <span className="text-gold">RD</span></p>
            <p className="eyebrow mt-0.5 text-[0.6rem]">Barbearia</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <Link key={l.to} to={l.to} data-testid={`nav-${l.label.toLowerCase()}`}
              className={`font-cond uppercase tracking-widest text-sm transition-colors hover:text-gold ${location.pathname === l.to ? "text-gold" : "text-muted-foreground"}`}>
              {l.label}
            </Link>
          ))}
          {user && user.role === "admin" && (
            <Link to="/admin" data-testid="nav-admin" className="font-cond uppercase tracking-widest text-sm text-muted-foreground transition-colors hover:text-gold">Painel</Link>
          )}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <button onClick={() => navigate("/planos")} data-testid="header-plans" className="btn-outline-gold py-2 text-sm"><Crown className="size-4" /> Planos</button>
          {user ? (
            <>
              <button onClick={() => navigate("/minha-conta")} data-testid="account-button" className="btn-outline-gold py-2 text-sm">
                <User className="size-4" /> {user.name?.split(" ")[0] || "Conta"}
              </button>
              {user.role === "admin" && (
                <button onClick={() => navigate("/admin")} data-testid="admin-button" className="btn-gold py-2 text-sm"><LayoutDashboard className="size-4" /> Painel</button>
              )}
              <button onClick={logout} data-testid="logout-button" aria-label="Sair" className="text-muted-foreground transition-colors hover:text-gold"><LogOut className="size-5" /></button>
            </>
          ) : (
            <>
              <button onClick={() => navigate("/login")} data-testid="header-login" className="btn-outline-gold py-2 text-sm"><User className="size-4" /> Entrar</button>
              <button onClick={() => navigate("/agendar")} data-testid="header-book" className="btn-gold py-2 text-sm"><Scissors className="size-4" /> Agendar</button>
            </>
          )}
        </div>

        <button className="md:hidden text-gold" onClick={() => setOpen(!open)} data-testid="mobile-menu-toggle" aria-label="Menu">
          {open ? <X /> : <Menu />}
        </button>
      </div>

      {open && (
        <div className="border-t border-gold-soft bg-ink px-5 py-4 md:hidden" data-testid="mobile-menu">
          <div className="flex flex-col gap-3">
            {links.map((l) => (
              <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="font-cond uppercase tracking-widest text-sm text-muted-foreground">{l.label}</Link>
            ))}
            {user && user.role === "admin" && <Link to="/admin" onClick={() => setOpen(false)} className="font-cond uppercase tracking-widest text-sm text-muted-foreground">Painel</Link>}
            {user ? (
              <>
                <Link to="/minha-conta" onClick={() => setOpen(false)} className="btn-outline-gold py-2 text-sm">Minha conta</Link>
                <button onClick={() => { logout(); setOpen(false); }} className="text-left font-cond uppercase text-sm text-muted-foreground">Sair</button>
              </>
            ) : (
              <>
                <Link to="/login" onClick={() => setOpen(false)} className="btn-outline-gold py-2 text-sm">Entrar</Link>
                <Link to="/agendar" onClick={() => setOpen(false)} className="btn-gold py-2 text-sm">Agendar</Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
