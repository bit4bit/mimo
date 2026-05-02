/**
 * Standardized response utilities for the internal API.
 *
 * Provides consistent JSON response formats for success and error cases.
 */

export interface SuccessResponse<T> {
  success: true;
  data: T;
}

export interface ErrorResponse {
  success: false;
  error: string;
  code: number;
}

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

/**
 * Creates a standardized success response.
 *
 * @param data - The data to include in the response
 * @returns A success response object with { success: true, data }
 *
 * @example
 * ```typescript
 * return c.json(successResponse({ user: { id: 1, name: "John" } }));
 * // Returns: { success: true, data: { user: { id: 1, name: "John" } } }
 * ```
 */
export function successResponse<T>(data: T): SuccessResponse<T> {
  return {
    success: true,
    data,
  };
}

/**
 * Creates a standardized error response.
 *
 * @param message - The error message
 * @param code - The HTTP status code (defaults to 500)
 * @returns An error response object with { success: false, error, code }
 *
 * @example
 * ```typescript
 * return c.json(errorResponse("User not found", 404), 404);
 * // Returns: { success: false, error: "User not found", code: 404 }
 * ```
 */
export function errorResponse(
  message: string,
  code: number = 500,
): ErrorResponse {
  return {
    success: false,
    error: message,
    code,
  };
}
