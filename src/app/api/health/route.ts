import { providerStatus } from "@/agent/provider";
import { serverEnv } from "@/agent/investigate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(providerStatus(serverEnv()));
}
