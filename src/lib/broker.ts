import amqplib, { ConfirmChannel, ChannelModel } from "amqplib";
import { handleDelivery } from "./consumer-delivery.js";

export const EXCHANGE = "hotelsync.events";
export const TASKS_QUEUE = "housekeeping.tasks";
const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost:5672";
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 15000;

let connection: ChannelModel | null = null;
let confirmChannel: ConfirmChannel | null = null;
let connecting: Promise<ConfirmChannel> | null = null;

/**
 * Conexión única y perezosa a RabbitMQ con reconexión exponencial.
 * Canal con *publisher confirms*: el broker no confirma hasta persistir.
 */
export async function connect(): Promise<ConfirmChannel> {
  if (confirmChannel) return confirmChannel;

  connecting ??= (async () => {
    let attempt = 0;
    for (;;) {
      try {
        const conn = await amqplib.connect(RABBITMQ_URL);
        connection = conn;
        conn.on("error", () => {
          /* listener obligatorio para evitar crash; la 'close' dispara la reconexión */
        });
        conn.on("close", async () => {
          confirmChannel = null;
          connecting = null;
          await sleep(RETRY_BASE_MS);
          void connect();
        });

        const channel = await conn.createConfirmChannel();
        await channel.assertExchange(EXCHANGE, "topic", { durable: true });
        confirmChannel = channel;
        return channel;
      } catch (err) {
        attempt += 1;
        const delay = Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), RETRY_MAX_MS);
        console.warn(
          `[broker] no se pudo conectar a RabbitMQ (intento ${attempt}), reintento en ${delay}ms`
        );
        await sleep(delay);
      }
    }
  })();

  return connecting;
}

export type MessageHandler = (routingKey: string, payload: any) => Promise<void>;

/**
 * Consume durable con ack manual: declara la cola y su DLQ, la bindea a las
 * routing keys y procesa con prefetch. Los errores se reintentan con backoff
 * acotado y terminan en `${queue}.dlq`; nunca hay requeue en caliente.
 */
export async function consume(
  queue: string,
  routingKeys: string[],
  handler: MessageHandler,
  prefetch = 10
): Promise<void> {
  const channel = await connect();
  const deadLetterQueue = `${queue}.dlq`;
  await channel.assertQueue(queue, { durable: true });
  await channel.assertQueue(deadLetterQueue, { durable: true });
  for (const key of routingKeys) {
    await channel.bindQueue(queue, EXCHANGE, key);
  }
  await channel.prefetch(prefetch);
  await channel.consume(
    queue,
    (msg) => {
      if (!msg) return;
      void handleDelivery(channel, queue, deadLetterQueue, handler, msg);
    },
    { noAck: false }
  );
  console.log(`[broker] consumiendo ${queue} <- ${routingKeys.join(", ")}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isConnected(): boolean {
  return confirmChannel !== null;
}

export const broker = {
  connect,
  consume,
  isConnected,
};
