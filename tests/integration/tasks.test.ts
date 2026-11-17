import request from "supertest";
import express from "express";
import tasksRouter from "../../src/routes/tasks.js";
import { errorHandler } from "../../src/middleware/error-handler.js";

jest.mock("../../src/lib/prisma.js", () => ({
  __esModule: true,
  default: {
    cleaningHistory: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    roomStatus: { update: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock("../../src/lib/user-client.js", () => ({
  __esModule: true,
  fetchHotelStaff: jest.fn(),
}));

import prisma from "../../src/lib/prisma.js";
import { signAccessToken } from "../helpers/tokens.js";

const mockPrisma = prisma as any;

const HOTEL_A = "a1b2c3d4-e5f6-4890-abcd-ef1234567890";
const HOTEL_B = "b1b2c3d4-e5f6-4890-abcd-ef1234567891";
const TASK_ID = "c1b2c3d4-e5f6-4890-abcd-ef1234567892";
const ROOM_STATUS_ID = "d1b2c3d4-e5f6-4890-abcd-ef1234567893";
const CLEANER_SUB = "e1b2c3d4-e5f6-4890-abcd-ef1234567894";
const OTHER_SUB = "f1b2c3d4-e5f6-4890-abcd-ef1234567895";

const tokenFor = (role: string, hotel_id: string | null, sub = CLEANER_SUB) =>
  signAccessToken({ sub, email: "staff@hotelsync.local", role, hotel_id });

function task(overrides: Record<string, unknown> = {}) {
  return {
    history_id: TASK_ID,
    hotel_id: HOTEL_A,
    room_status_id: ROOM_STATUS_ID,
    status: "assigned",
    assigned_to_user_id: CLEANER_SUB,
    ...overrides,
  };
}

const tx = {
  cleaningHistory: { update: jest.fn() },
  roomStatus: { update: jest.fn() },
};

const app = express();
app.use(express.json());
app.use("/v1/tasks", tasksRouter);
app.use(errorHandler);

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
});

describe("GET /v1/tasks/mine", () => {
  it("exige sesión (401)", async () => {
    const res = await request(app).get("/v1/tasks/mine");
    expect(res.status).toBe(401);
    expect(mockPrisma.cleaningHistory.findMany).not.toHaveBeenCalled();
  });

  it("filtra por el usuario del token y su estado opcional (200)", async () => {
    mockPrisma.cleaningHistory.findMany.mockResolvedValue([]);
    const res = await request(app)
      .get("/v1/tasks/mine?status=pending")
      .set("Authorization", `Bearer ${tokenFor("HOUSEKEEPER", HOTEL_A)}`);

    expect(res.status).toBe(200);
    expect(mockPrisma.cleaningHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          assigned_to_user_id: CLEANER_SUB,
          status: "pending",
        },
      })
    );
  });
});

describe("PUT /v1/tasks/:id/start", () => {
  it("rechaza a un GUEST (403)", async () => {
    const res = await request(app)
      .put(`/v1/tasks/${TASK_ID}/start`)
      .set("Authorization", `Bearer ${tokenFor("GUEST", null)}`);
    expect(res.status).toBe(403);
    expect(mockPrisma.cleaningHistory.findUnique).not.toHaveBeenCalled();
  });

  it("devuelve 404 si la tarea no existe", async () => {
    mockPrisma.cleaningHistory.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .put(`/v1/tasks/${TASK_ID}/start`)
      .set("Authorization", `Bearer ${tokenFor("HOUSEKEEPER", HOTEL_A)}`);
    expect(res.status).toBe(404);
  });

  it("rechaza a un housekeeper que no es el asignado (403)", async () => {
    mockPrisma.cleaningHistory.findUnique.mockResolvedValue(task());
    const res = await request(app)
      .put(`/v1/tasks/${TASK_ID}/start`)
      .set("Authorization", `Bearer ${tokenFor("HOUSEKEEPER", HOTEL_A, OTHER_SUB)}`);
    expect(res.status).toBe(403);
    expect(tx.cleaningHistory.update).not.toHaveBeenCalled();
  });

  it("rechaza una transición inválida desde done (409)", async () => {
    mockPrisma.cleaningHistory.findUnique.mockResolvedValue(task({ status: "done" }));
    const res = await request(app)
      .put(`/v1/tasks/${TASK_ID}/start`)
      .set("Authorization", `Bearer ${tokenFor("HOUSEKEEPER", HOTEL_A)}`);
    expect(res.status).toBe(409);
  });

  it("pasa la tarea a in_progress y la habitación a cleaning (200)", async () => {
    mockPrisma.cleaningHistory.findUnique.mockResolvedValue(task());
    tx.cleaningHistory.update.mockResolvedValue(task({ status: "in_progress" }));
    tx.roomStatus.update.mockResolvedValue({});

    const res = await request(app)
      .put(`/v1/tasks/${TASK_ID}/start`)
      .set("Authorization", `Bearer ${tokenFor("HOUSEKEEPER", HOTEL_A)}`);

    expect(res.status).toBe(200);
    expect(tx.roomStatus.update).toHaveBeenCalledWith({
      where: { room_status_id: ROOM_STATUS_ID },
      data: { status: "cleaning" },
    });
    expect(tx.cleaningHistory.update).toHaveBeenCalledWith({
      where: { history_id: TASK_ID },
      data: { status: "in_progress" },
    });
  });
});

describe("PUT /v1/tasks/:id/complete", () => {
  it("rechaza completar una tarea pending (409)", async () => {
    mockPrisma.cleaningHistory.findUnique.mockResolvedValue(task({ status: "pending" }));
    const res = await request(app)
      .put(`/v1/tasks/${TASK_ID}/complete`)
      .set("Authorization", `Bearer ${tokenFor("HOUSEKEEPER", HOTEL_A)}`);
    expect(res.status).toBe(409);
    expect(tx.roomStatus.update).not.toHaveBeenCalled();
  });

  it("rechaza al housekeeper no asignado (403)", async () => {
    mockPrisma.cleaningHistory.findUnique.mockResolvedValue(
      task({ status: "in_progress" })
    );
    const res = await request(app)
      .put(`/v1/tasks/${TASK_ID}/complete`)
      .set("Authorization", `Bearer ${tokenFor("HOUSEKEEPER", HOTEL_A, OTHER_SUB)}`);
    expect(res.status).toBe(403);
  });

  it("completa la tarea y deja la habitación clean en la misma transacción (200)", async () => {
    mockPrisma.cleaningHistory.findUnique.mockResolvedValue(
      task({ status: "in_progress" })
    );
    tx.cleaningHistory.update.mockResolvedValue(task({ status: "done" }));
    tx.roomStatus.update.mockResolvedValue({});

    const res = await request(app)
      .put(`/v1/tasks/${TASK_ID}/complete`)
      .set("Authorization", `Bearer ${tokenFor("HOUSEKEEPER", HOTEL_A)}`);

    expect(res.status).toBe(200);
    expect(tx.cleaningHistory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { history_id: TASK_ID },
        data: expect.objectContaining({
          status: "done",
          completed_by_user_id: CLEANER_SUB,
        }),
      })
    );
    expect(tx.roomStatus.update).toHaveBeenCalledWith({
      where: { room_status_id: ROOM_STATUS_ID },
      data: { status: "clean" },
    });
  });

  it("permite al MANAGER del hotel completar la tarea (200)", async () => {
    mockPrisma.cleaningHistory.findUnique.mockResolvedValue(
      task({ status: "in_progress", assigned_to_user_id: OTHER_SUB })
    );
    tx.cleaningHistory.update.mockResolvedValue(task({ status: "done" }));
    tx.roomStatus.update.mockResolvedValue({});

    const res = await request(app)
      .put(`/v1/tasks/${TASK_ID}/complete`)
      .set("Authorization", `Bearer ${tokenFor("MANAGER", HOTEL_A)}`);

    expect(res.status).toBe(200);
  });

  it("rechaza al MANAGER de otro hotel (403)", async () => {
    mockPrisma.cleaningHistory.findUnique.mockResolvedValue(
      task({ status: "in_progress" })
    );
    const res = await request(app)
      .put(`/v1/tasks/${TASK_ID}/complete`)
      .set("Authorization", `Bearer ${tokenFor("MANAGER", HOTEL_B)}`);
    expect(res.status).toBe(403);
  });
});
