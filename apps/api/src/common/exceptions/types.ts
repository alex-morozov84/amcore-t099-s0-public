import type { ApiErrorResponse, ValidationError } from '@amcore/shared'

/**
 * Re-export shared types for backward compatibility
 * These types are now defined in @amcore/shared to ensure consistency between frontend and backend
 */
export type { ApiErrorResponse, ValidationError }

/**
 * @deprecated Use ApiErrorResponse instead
 */
export type ErrorResponse = ApiErrorResponse
