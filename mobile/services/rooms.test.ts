import { describe, expect, it } from "vitest";
import {
  buildRoomInterval,
  canManageRooms,
  describeRoomStatus,
  isRoomSelectable,
  resolveAppointmentRoomName,
} from "./rooms";
import type { RoomApiItem } from "./api";

const sala = (extra: Partial<RoomApiItem> = {}): RoomApiItem => ({
  id: "room-1",
  clinic: "clinic-1",
  name: "Sala 01",
  is_active: true,
  ...extra,
});

describe("buildRoomInterval", () => {
  it("monta o intervalo a partir de data, hora e duração", () => {
    expect(buildRoomInterval("2026-09-10", "14:30", 50)).toEqual({
      start: "2026-09-10T14:30:00-03:00",
      end: "2026-09-10T15:20:00-03:00",
    });
  });

  it("atravessa a virada da hora ao somar a duração", () => {
    expect(buildRoomInterval("2026-09-10", "23:40", 50)?.end).toBe(
      "2026-09-11T00:30:00-03:00",
    );
  });

  it("não monta intervalo enquanto data ou hora estiverem incompletas", () => {
    expect(buildRoomInterval("", "14:30", 50)).toBeNull();
    expect(buildRoomInterval("2026-09-10", "", 50)).toBeNull();
    expect(buildRoomInterval("10/09/2026", "14:30", 50)).toBeNull();
    expect(buildRoomInterval("2026-09-10", "14h30", 50)).toBeNull();
  });

  it("ignora duração inválida e usa a duração padrão da consulta", () => {
    expect(buildRoomInterval("2026-09-10", "14:30", NaN)?.end).toBe(
      "2026-09-10T15:20:00-03:00",
    );
  });
});

describe("isRoomSelectable", () => {
  it("permite escolher uma sala ativa e livre", () => {
    expect(isRoomSelectable(sala({ status: "livre" }))).toBe(true);
  });

  it("permite escolher quando o backend não calculou o status", () => {
    expect(isRoomSelectable(sala())).toBe(true);
  });

  it("bloqueia sala ocupada no intervalo pedido", () => {
    expect(isRoomSelectable(sala({ status: "ocupada" }))).toBe(false);
  });

  it("bloqueia sala inativa", () => {
    expect(isRoomSelectable(sala({ is_active: false }))).toBe(false);
  });
});

describe("describeRoomStatus", () => {
  it("descreve a sala inativa antes de qualquer outro estado", () => {
    expect(describeRoomStatus(sala({ is_active: false, status: "livre" }))).toBe(
      "Inativa",
    );
  });

  it("descreve a sala ocupada no intervalo", () => {
    expect(describeRoomStatus(sala({ status: "ocupada" }))).toBe(
      "Ocupada neste horário",
    );
  });

  it("descreve a sala livre no intervalo", () => {
    expect(describeRoomStatus(sala({ status: "livre" }))).toBe("Livre");
  });

  it("não inventa disponibilidade quando não há intervalo informado", () => {
    expect(describeRoomStatus(sala())).toBe("Ativa");
  });
});

describe("resolveAppointmentRoomName", () => {
  it("usa o nome vindo de room_detail", () => {
    expect(
      resolveAppointmentRoomName({ room_detail: sala({ name: "Sala Verde" }) }),
    ).toBe("Sala Verde");
  });

  it("retorna nulo quando a consulta não tem sala", () => {
    expect(resolveAppointmentRoomName({})).toBeNull();
    expect(resolveAppointmentRoomName({ room_detail: null })).toBeNull();
  });

  it("retorna nulo quando só existe o id da sala, sem detalhe", () => {
    expect(resolveAppointmentRoomName({ room: "room-1" })).toBeNull();
  });
});

describe("canManageRooms", () => {
  it("libera o CRUD para administradores", () => {
    expect(canManageRooms("admin")).toBe(true);
  });

  it("mantém o profissional em modo somente leitura", () => {
    expect(canManageRooms("professional")).toBe(false);
  });

  it("mantém o paciente em modo somente leitura", () => {
    expect(canManageRooms("patient")).toBe(false);
    expect(canManageRooms(undefined)).toBe(false);
  });
});
