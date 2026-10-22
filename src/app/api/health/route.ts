import { nebiusStatus } from "@/agent/nebius";
import { serverEnv } from "@/agent/investigate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(nebiusStatus(serverEnv()));
}
