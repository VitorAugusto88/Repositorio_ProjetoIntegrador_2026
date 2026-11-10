// Helpers para os campos de data/hora dos modais de conclusão e remarcação.
// Usam o mesmo formato dos componentes DateField/TimeField (o calendário/relógio
// nativos do navegador): data "AAAA-MM-DD" e hora "HH:MM".

// Monta um ISO 8601 com o fuso do Brasil (-03:00), igual ao fluxo de agendamento
// (ver createAppointment / agendar.tsx). Retorna null se a data/hora for inválida.
export function partsToISO(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const t = time.length > 5 ? time.slice(0, 5) : time;
  if (!/^\d{2}:\d{2}$/.test(t)) return null;
  const iso = `${date}T${t}:00-03:00`;
  if (isNaN(new Date(iso).getTime())) return null;
  return iso;
}

// Preenche os campos com uma data (padrão: agora), no formato dos pickers.
export function toInputParts(d: Date = new Date()): {
  date: string;
  time: string;
} {
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

// Data de hoje no formato "AAAA-MM-DD" — usada como min/max dos calendários.
export function todayISODate(): string {
  return new Date().toLocaleDateString("en-CA");
}
