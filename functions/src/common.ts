// src/common.ts
import { config } from './config';

/**
 * Calculates the current NFL week based on a Wednesday-Tuesday cycle.
 * @returns {number} The current NFL week number (1-18).
 */
export const calculateCurrentNFLWeek = (): number => {
  const seasonStartDate = config.SEASON_START_DATE_REF; // Use configured start date (first Wednesday)
  const today = new Date();

  // Calculate the difference in days between today and the first Wednesday
  const timeDiff = today.getTime() - seasonStartDate.getTime();
  // Add a small offset (1 hour) to handle times just before midnight UTC potentially flipping the day early
  const daysDiff = Math.floor((timeDiff + (1000 * 60 * 60)) / (1000 * 60 * 60 * 24));

  // Each NFL week is 7 days (Wed-Tue), divide by 7 to get the current week
  const week = Math.floor(daysDiff / 7) + 1; // Add 1 because week numbers are 1-based

  // Clamp the week number between 1 and the max number of weeks
  return Math.max(1, Math.min(week, config.MAX_NFL_WEEKS));
};


/**
 * Removes properties with undefined values from an object.
 * Does not recurse into nested objects. Uses 'unknown' for input type checking.
 * @param obj The input object.
 * @returns A new object with undefined top-level fields removed.
 */
export const removeUndefinedFields = (obj: Record<string, unknown>): Record<string, unknown> => {
  if (typeof obj !== 'object' || obj === null) {
    return obj; // Return non-objects as is
  }
  // Filter out entries where the value is undefined
  return Object.fromEntries(
      Object.entries(obj).filter(([, v]) => v !== undefined)
  );
  // Note: This only cleans top-level undefined. Nested undefined values within objects
  // might still exist unless cleaned recursively or handled during data prep.
};

/** Safely parse unknown value to float, defaulting to 0 */
export const safeParseFloat = (val: unknown): number => {
    // Convert to string first to handle potential non-string inputs before parseFloat
    const num = parseFloat(String(val));
    return isNaN(num) ? 0 : num; // Return 0 if NaN
};

/** Safely parse unknown value to integer, defaulting to 0 */
export const safeParseInt = (val: unknown): number => {
    // Convert to string first, specify base 10 for parseInt
    const num = parseInt(String(val), 10);
    return isNaN(num) ? 0 : num; // Return 0 if NaN
};

// Add other shared utility functions or type definitions here if needed
