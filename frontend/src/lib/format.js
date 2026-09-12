export function formatCurrency(cents) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents || 0) / 100);
}

export function formatDateBR(dateStr, timeStr) {
  try {
    const d = new Date(`${dateStr}T12:00:00`);
    const day = d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
    return timeStr ? `${day} · ${timeStr}` : day;
  } catch {
    return `${dateStr} ${timeStr || ""}`.trim();
  }
}

export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
