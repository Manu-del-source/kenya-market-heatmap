/**
 * Provider error taxonomy.
 *
 * Distinguishing "not configured" from "temporarily failing" from "no such
 * ticker" lets the API layer return honest status codes instead of silently
 * falling back to demo data — a fallback that would misrepresent the source.
 */

export class ProviderError extends Error {
  readonly status: number;
  readonly provider: string;

  constructor(message: string, { status = 502, provider }: { status?: number; provider: string }) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
    this.provider = provider;
  }
}

/** The provider is selected but not configured (missing URL / key). */
export class ProviderNotConfiguredError extends ProviderError {
  constructor(provider: string, missing: string[]) {
    super(
      `Market data provider "${provider}" is not configured. Missing: ${missing.join(", ")}. ` +
        `Set MARKET_DATA_PROVIDER=demo to use clearly-labelled sample data.`,
      { status: 503, provider }
    );
    this.name = "ProviderNotConfiguredError";
  }
}

/** Upstream call failed, timed out, or returned a malformed body. */
export class ProviderUpstreamError extends ProviderError {
  constructor(provider: string, reason: string) {
    super(`Market data provider "${provider}" failed: ${reason}`, { status: 502, provider });
    this.name = "ProviderUpstreamError";
  }
}

/** The provider does not know this instrument. Not the same as "no price". */
export class UnknownInstrumentError extends ProviderError {
  constructor(provider: string, ticker: string) {
    super(`"${ticker}" is not known to provider "${provider}".`, {
      status: 404,
      provider,
    });
    this.name = "UnknownInstrumentError";
  }
}

/** True for errors that are safe to surface verbatim to the client. */
export function isPublicError(error: unknown): boolean {
  return (
    error instanceof ProviderError ||
    (error instanceof Error && error.name === "ValidationError")
  );
}
