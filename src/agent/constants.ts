/**
 * Nebius Token Factory is OpenAI-compatible.
 * Introduction: https://docs.tokenfactory.nebius.com/api-reference/introduction
 *
 * nvidia/nemotron-3-super-120b-a12b is NVIDIA Nemotron 3 Super
 * (120B total / 12B active) in the public Token Factory catalog.
 * Override the id with NEBIUS_MODEL if the catalog moves.
 */
export const DEFAULT_NEBIUS_BASE_URL = "https://api.tokenfactory.nebius.com/v1";

export const DEFAULT_NEMOTRON_MODEL = "nvidia/nemotron-3-super-120b-a12b";

export const NEBIUS_PROVIDER = "Nebius Token Factory";

export const REPLAY_DISCLAIMER =
  "Recorded trace. Nemotron was not called. Tool results come from the Northwind seed shipped with this repo.";
