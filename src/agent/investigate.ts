import { runLiveInvestigation, type InvestigateDeps } from "./loop";
import { runReplay } from "./replay";
import type { AgentStep, InvestigationRequest } from "./types";

export async function* runInvestigation(
  request: InvestigationRequest,
  deps: InvestigateDeps,
): AsyncGenerator<AgentStep> {
  if (request.mode === "replay") {
    yield* runReplay(request, deps);
    return;
  }
  yield* runLiveInvestigation(request, deps);
}

export function serverEnv(): InvestigateDeps["env"] {
  return {
    NEBIUS_API_KEY: process.env.NEBIUS_API_KEY,
    NEBIUS_BASE_URL: process.env.NEBIUS_BASE_URL,
    NEBIUS_MODEL: process.env.NEBIUS_MODEL,
    TAVILY_API_KEY: process.env.TAVILY_API_KEY,
  };
}
