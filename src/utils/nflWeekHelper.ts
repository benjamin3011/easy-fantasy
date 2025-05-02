// nflWeekHelper.ts

// Helper function to calculate the current NFL week with weeks starting from Wednesday to Tuesday
export const calculateCurrentNFLWeek = () => {
  const seasonStartDate = new Date('2025-09-04'); // NFL Season start date (Thursday, Sept 5, 2024)
  const today = new Date();

  // The first "week" starts on the Wednesday (Sept 4), so we adjust the start date to the first Wednesday
  const firstWednesday = new Date(seasonStartDate);
  firstWednesday.setDate(seasonStartDate.getDate() - 1); // Set to Sept 4, 2024 (Wednesday)

  // Calculate the difference in days between today and the first Wednesday
  const timeDiff = today.getTime() - firstWednesday.getTime();
  const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

  // Each NFL week is from Wednesday to Tuesday (7 days), so we divide by 7 to get the current week
  const week = Math.floor(daysDiff / 7) + 1; // Add 1 because week numbers are 1-based

  return Math.max(week, 1); // Ensure we don't go below week 1
};

  