import { runInvestigation, serverEnv } from "@/agent/investigate";
import { parseInvestigationContent, resolveMode } from "@/agent/parseRequest";
import { ProtocolEncoder } from "@/agent/protocol";
import type { AgentStep } from "@/agent/types";
import type { ServerMessage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const content =
    body && typeof body === "object" && "content" in body && typeof body.content === "string"
      ? body.content
      : "";
  if (!content.trim()) {
    return Response.json({ error: "content is required." }, { status: 400 });
  }

  const parsed = parseInvestigationContent(content);
  const mode = resolveMode(parsed.mode, serverEnv());
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const protocol = new ProtocolEncoder();
      const write = (message: ServerMessage) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`));
      };
      try {
        for await (const step of runInvestigation(
          { incidentId: parsed.incidentId, alert: parsed.alert, mode },
          { env: serverEnv(), signal: request.signal },
        )) {
          if (request.signal.aborted) return;
          for (const message of protocol.encode(step)) write(message);
          await pace(step, request.signal);
        }
        if (!request.signal.aborted) write(protocol.end());
      } catch (error) {
        if (request.signal.aborted) return;
        const message = error instanceof Error ? error.message : "Investigation failed.";
        for (const encoded of protocol.encode({ kind: "error", code: "AGENT_FAILED", message })) {
          write(encoded);
        }
        write(protocol.end());
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

async function pace(step: AgentStep, signal: AbortSignal): Promise<void> {
  const ms = step.kind === "token" ? 18 : step.kind === "tool_call" ? 80 : 0;
  if (ms === 0 || signal.aborted) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
