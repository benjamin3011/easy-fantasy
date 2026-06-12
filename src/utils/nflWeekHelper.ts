// nflWeekHelper.ts

// Configuration for current season (should match backend config)
const CURRENT_SEASON_TYPE = "reg"; // "pre" for pre-season, "reg" for regular season
const SEASON_START_DATE_REF = new Date('2026-09-09'); // Week 1 starts on Wednesday in 2026

/**
 * Helper function to calculate the current NFL week with weeks starting from Wednesday to Tuesday
 * This matches the backend calculateCurrentNFLWeek function
 */
export const calculateCurrentNFLWeek = (): number => {
  // Use regular season start date (since CURRENT_SEASON_TYPE is "reg")
  const seasonStartDate = SEASON_START_DATE_REF;
    
  const today = new Date();

  // Calculate the difference in days between today and the first Wednesday
  const timeDiff = today.getTime() - seasonStartDate.getTime();
  // Add a small offset (1 hour) to handle times just before midnight UTC potentially flipping the day early
  const daysDiff = Math.floor((timeDiff + (1000 * 60 * 60)) / (1000 * 60 * 60 * 24));

  // Each NFL week is 7 days (Wed-Tue), divide by 7 to get the current week
  const week = Math.floor(daysDiff / 7) + 1; // Add 1 because week numbers are 1-based

  // Clamp the week number for regular season (18 weeks)
  const maxWeeks = 18; // Regular season weeks
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
  return false; // We're in regular season
};

/**
 * Get a normalized week number that's easier to understand
 * For debugging and display purposes
 */
export const normalizeWeek = (week: number): number => {
  return Math.max(1, Math.min(week, 18)); // Regular season: 18 weeks
};

  