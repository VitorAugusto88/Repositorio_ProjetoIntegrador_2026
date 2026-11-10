// Regras de sala usadas pelas telas de agendamento e de detalhe da consulta.
// Ficam fora dos componentes para poderem ser testadas sem renderizar React
// Native — a validação de verdade continua sendo a do backend.
import type { RoomApiItem } from "./api";

// Mesma duração padrão usada nos formulários de agendamento.
const DURACAO_PADRAO_MINUTOS = 50;

// Os formulários já montam `scheduled_at` com o fuso fixo da clínica
// (`${date}T${time}:00-03:00`); o intervalo de consulta de salas usa o mesmo.
const FUSO_CLINICA = "-03:00";

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^\d{2}:\d{2}$/;

const doisDigitos = (valor: number) => String(valor).padStart(2, "0");

export interface RoomInterval {
  start: string;
  end: string;
}

/**
 * Monta o intervalo `[start, end)` da consulta pretendida, no formato que a
 * API espera em `GET /api/clinics/<id>/rooms/?start=&end=`.
 *
 * Retorna `null` enquanto a data ou a hora ainda não estiverem completas —
 * assim a tela simplesmente não consulta disponibilidade em vez de mandar
 * um intervalo inválido.
 */
export const buildRoomInterval = (
  date: string,
  time: string,
  durationMinutes: number,
): RoomInterval | null => {
  if (!DATA_RE.test(date) || !HORA_RE.test(time)) return null;

  const [ano, mes, dia] = date.split("-").map(Number);
  const [hora, minuto] = time.split(":").map(Number);
  if (hora > 23 || minuto > 59) return null;

  const duracao =
    Number.isFinite(durationMinutes) && durationMinutes > 0
      ? Math.trunc(durationMinutes)
      : DURACAO_PADRAO_MINUTOS;

  // Aritmética em UTC só para somar os minutos sem o fuso do dispositivo
  // interferir; o resultado é reetiquetado com o fuso fixo da clínica.
  const inicio = Date.UTC(ano, mes - 1, dia, hora, minuto);
  const fim = new Date(inicio + duracao * 60_000);

  const formatar = (valor: Date) =>
    `${valor.getUTCFullYear()}-${doisDigitos(valor.getUTCMonth() + 1)}-` +
    `${doisDigitos(valor.getUTCDate())}T${doisDigitos(valor.getUTCHours())}:` +
    `${doisDigitos(valor.getUTCMinutes())}:00${FUSO_CLINICA}`;

  return { start: formatar(new Date(inicio)), end: formatar(fim) };
};

/**
 * Uma sala só pode ser escolhida quando está ativa e não está ocupada no
 * intervalo consultado. Sem `status` (listagem sem intervalo), a sala segue
 * selecionável e quem decide é o backend.
 */
export const isRoomSelectable = (room: RoomApiItem): boolean =>
  room.is_active && room.status !== "ocupada";

/** Rótulo curto de situação exibido ao lado do nome da sala. */
export const describeRoomStatus = (room: RoomApiItem): string => {
  if (!room.is_active) return "Inativa";
  if (room.status === "ocupada") return "Ocupada neste horário";
  if (room.status === "livre") return "Livre";
  return "Ativa";
};

/**
 * Nome da sala de uma consulta, ou `null` quando ela não tem sala — a tela usa
 * o `null` para não renderizar uma linha vazia.
 */
export const resolveAppointmentRoomName = (appointment: {
  room?: string | null;
  room_detail?: RoomApiItem | null;
}): string | null => appointment.room_detail?.name?.trim() || null;

/** Somente o administrador gerencia salas; os demais papéis apenas consultam. */
export const canManageRooms = (role?: string | null): boolean =>
  role === "admin";
