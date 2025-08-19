// nflWeekHelper.ts

// Configuration for current season (should match backend config)
const CURRENT_SEASON_TYPE = "pre"; // "pre" for pre-season, "reg" for regular season
const PRE_SEASON_START_DATE_REF = new Date('2025-08-06'); // First Wednesday of pre-season Week 1
const SEASON_START_DATE_REF = new Date('2025-09-03'); // First Wednesday of the regular season

/**
 * Helper function to calculate the current NFL week with weeks starting from Wednesday to Tuesday
 * This matches the backend calculateCurrentNFLWeek function
 */
export const calculateCurrentNFLWeek = (): number => {
  // Use appropriate start date based on season type
  const seasonStartDate = CURRENT_SEASON_TYPE === "pre" 
    ? PRE_SEASON_START_DATE_REF 
    : SEASON_START_DATE_REF;
    
  const today = new Date();

  // Calculate the difference in days between today and the first Wednesday
  const timeDiff = today.getTime() - seasonStartDate.getTime();
  // Add a small offset (1 hour) to handle times just before midnight UTC potentially flipping the day early
  const daysDiff = Math.floor((timeDiff + (1000 * 60 * 60)) / (1000 * 60 * 60 * 24));

  // Each NFL week is 7 days (Wed-Tue), divide by 7 to get the current week
  const week = Math.floor(daysDiff / 7) + 1; // Add 1 because week numbers are 1-based

  // Clamp the week number based on season type
  const maxWeeks = CURRENT_SEASON_TYPE === "pre" ? 4 : 18; // 4 preseason weeks, 18 regular season weeks
  return Math.max(1, Math.min(week, maxWeeks));
};

/**
 * Get the current season type
 */
export const getCurrentSeasonType = (): string => {
  return CURRENT_SEASON_TYPE;
};

/**
 * Check if we're currently in preseason
 */
export const isPreseason = (): boolean => {
  return CURRENT_SEASON_TYPE === "pre";
};

/**
 * Get a normalized week number that's easier to understand
 * For debugging and display purposes
 */
export const normalizeWeek = (week: number): number => {
  return Math.max(1, Math.min(week, isPreseason() ? 4 : 18));
};

  