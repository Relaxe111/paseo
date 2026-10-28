import { afterEach, expect, test, vi } from "vitest";
import { createPaseoClient } from "./index.js";
import type { PaseoClient } from "./index.js";

type FakeWebSocketHandler = (...args: unknown[]) => void;

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  readyState = 1;
  sent: Array<string | ArrayBuffer | Uint8Array> = [];
  onopen: FakeWebSocketHandler | null = null;
  onmessage: FakeWebSocketHandler | null = null;
  onclose: FakeWebSocketHandler | null = null;
  onerror: FakeWebSocketHandler | null = null;

  constructor(
    readonly url: string,
    readonly protocols?: string | string[],
  ) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string | ArrayBuffer | Uint8Array): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }

  open(): void {
    this.onopen?.();
  }

  message(data: string): void {
    this.onmessage?.({ data });
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeWebSocket.instances.length = 0;
});

function sessionMessage(message: object): string {
  return JSON.stringify({
    type: "session",
    message,
  });
}

function parseSentSessionMessage(data: string | ArrayBuffer | Uint8Array | undefined): {
  type: string;
  requestId?: string;
  agentId?: string;
} {
  if (typeof data !== "string") {
    throw new Error("Expected string WebSocket frame");
  }
  return JSON.parse(data).message;
}

async function connectClient(features: Record<string, boolean>): Promise<{
  client: PaseoClient;
  ws: FakeWebSocket;
}> {
  const client = createPaseoClient({
    url: "ws://daemon.test",
    webSocketFactory: (url) => new FakeWebSocket(url),
    reconnect: { enabled: false },
  });

  const connectPromise = client.connect();
  const ws = FakeWebSocket.instances[0];
  ws.open();
  ws.message(
    sessionMessage({
      type: "status",
      payload: {
        status: "server_info",
        serverId: "srv_compact_summary",
        hostname: null,
        version: null,
        features,
      },
    }),
  );
  await connectPromise;
  return { client, ws };
}

const agentId = "00000000-0000-4000-8000-000000000001";

const sections = {
  task: "Host compact summary",
  decisions: "None",
  currentState: "idle",
  nextStep: "Review",
};

test("agents.generateCompactSummary returns correlated sections and cutoff", async () => {
  const { client, ws } = await connectClient({
    ownedSubscriptions: true,
    agentCompactSummary: true,
  });

  const promise = client.agents.generateCompactSummary(agentId);
  expect(parseSentSessionMessage(ws.sent.at(-1))).toMatchObject({
    type: "agent.compact_summary.generate.request",
    agentId,
  });

  const request = parseSentSessionMessage(ws.sent.at(-1));
  ws.message(
    sessionMessage({
      type: "agent.compact_summary.generate.response",
      payload: {
        requestId: request.requestId,
        agentId,
        sections,
        cutoff: "2026-10-25T10:00:00.000Z",
        error: null,
      },
    }),
  );

  await expect(promise).resolves.toEqual({
    sections,
    cutoff: "2026-10-25T10:00:00.000Z",
  });
});

test("agents.generateCompactSummary requires host agentCompactSummary capability", async () => {
  const { client } = await connectClient({ ownedSubscriptions: true });
  await expect(client.agents.generateCompactSummary(agentId)).rejects.toMatchObject({
    code: "unsupported_capability",
  });
});

test("agents.generateCompactSummary surfaces host inline errors", async () => {
  const { client, ws } = await connectClient({
    ownedSubscriptions: true,
    agentCompactSummary: true,
  });

  const promise = client.agents.generateCompactSummary(agentId);
  const request = parseSentSessionMessage(ws.sent.at(-1));
  ws.message(
    sessionMessage({
      type: "agent.compact_summary.generate.response",
      payload: {
        requestId: request.requestId,
        agentId,
        sections: null,
        cutoff: null,
        error: "This session uses a live provider.",
      },
    }),
  );

  await expect(promise).rejects.toThrow("This session uses a live provider.");
});
