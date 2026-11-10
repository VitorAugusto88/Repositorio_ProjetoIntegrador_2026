import { beforeEach, describe, expect, it, vi } from "vitest";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAppointment, getClinicRooms } from "./api";

describe("createAppointment com sala", () => {
  beforeEach(async () => {
    await AsyncStorage.setItem("@clinica:accessToken", "access-token");
    await AsyncStorage.setItem("@clinica:clinicId", "clinic-id");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "appointment-id" }),
      }),
    );
  });

  it("envia a sala quando o profissional a seleciona", async () => {
    await createAppointment(
      "professional-id",
      "2026-09-10T10:00:00-03:00",
      50,
      { roomId: "room-id" },
    );

    const [, request] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(request.body)).toMatchObject({ room: "room-id" });
  });

  it("omite a sala quando nenhum ambiente foi escolhido", async () => {
    await createAppointment(
      "professional-id",
      "2026-09-10T10:00:00-03:00",
      50,
    );

    const [, request] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(request.body)).not.toHaveProperty("room");
  });

  it("consulta salas com o intervalo solicitado", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await getClinicRooms("clinic-id", {
      start: "2026-09-10T10:00:00-03:00",
      end: "2026-09-10T10:50:00-03:00",
    });

    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain(
      "/clinics/clinic-id/rooms/?start=",
    );
  });
});