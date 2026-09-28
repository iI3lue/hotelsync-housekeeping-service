import express from "express";
import { errorHandler } from "./middleware/error-handler.js";
import tasksRouter from "./routes/tasks.js";
import roomsRouter from "./routes/rooms.js";
import { startConsumer } from "./lib/consumer.js";
import prisma from "./lib/prisma.js";
import { broker } from "./lib/broker.js";

const app = express();
const PORT = process.env.PORT || 3006;

app.use(express.json());

// Health check con dependencias (documento de arquitectura §11.3)
app.get("/health", async (_req, res) => {
  const checks: Record<string, string> = {};
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "up";
  } catch {
    checks.database = "down";
  }
  if (process.env.RABBITMQ_URL) {
    try {
      await broker.connect();
      checks.broker = "up";
    } catch {
      checks.broker = "down";
    }
  } else {
    checks.broker = "not_configured";
  }
  const degraded = Object.values(checks).includes("down");
  res.status(degraded ? 503 : 200).json({
    status: degraded ? "degraded" : "ok",
    timestamp: new Date().toISOString(),
    service: "housekeeping-service",
    checks,
  });
});

// API routes
app.use("/v1/tasks", tasksRouter);
app.use("/v1/rooms", roomsRouter);

// Error handler
app.use(errorHandler);

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`Housekeeping Service running on port ${PORT}`);
  });

  // Consumidor de checkout.completed -> tarea automática (HK-2).
  // (solo con broker configurado; sin RABBITMQ_URL el servicio opera igual).
  if (process.env.RABBITMQ_URL) {
    startConsumer().catch((err) =>
      console.error("[consumer] no se pudo iniciar", err)
    );
    console.log("RabbitMQ consumer started");
  }
}

export default app;
