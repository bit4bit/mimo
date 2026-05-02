/**
 * Request and response types for the summary internal API.
 *
 * These types define the data contracts for all summary-related
 * endpoints in the internal API.
 */

/**
 * Request body for refreshing/generating a summary.
 */
export interface RefreshSummaryRequest {
  sessionId: string;
  analyzeThreadId: string;
  summarizeThreadId: string;
}

/**
 * Response for a successful summary refresh request.
 */
export interface RefreshSummaryResponse {
  message: string;
  summaryThreadId: string;
}

/**
 * Query parameters for getting the latest summary.
 */
export interface GetLatestSummaryQuery {
  sessionId: string;
  summarizeThreadId: string;
}

/**
 * Response for the latest summary endpoint.
 */
export interface GetLatestSummaryResponse {
  summary: string;
}
