// src/config.ts
import { MemoryOption } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";

/**
 * Firebase Project Region
 */
export const REGION = "europe-west3";

/**
 * Secrets defined for Firebase Functions
 * Access values at runtime using .value()
 */
export const secrets = {
    AWS_ID: defineSecret("AWS_SES_KEY_ID"),
    AWS_SECRET: defineSecret("AWS_SES_KEY_SECRET"),
    AWS_REGION: defineSecret("AWS_SES_REGION"),
    MAIL_FROM: defineSecret("MAIL_FROM"),
    TANK01_KEY: defineSecret("TANK01_KEY"), // For Tank01 NFL API
};

/**
 * API Hosts
 */
export const hosts = {
    TANK01_NFL_API: "tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com",
};

/**
 * Other Configurations
 */
export const config = {
    CURRENT_NFL_SEASON: "2024", // Update as needed
    RELEVANT_PLAYER_POSITIONS: ['QB', 'RB', 'WR', 'TE'],
};

/**
 * Function Options (Memory, Timeout, etc.)
 */
export const functionOptions = {
    REGION: REGION,
    timeoutSeconds: 60, // Default timeout
    memory: "256MiB" as MemoryOption, // Default memory
};

export const dataSyncOptions = {
    ...functionOptions,
    timeoutSeconds: 540, // Longer timeout for data sync
    memory: "512MiB" as MemoryOption,    // More memory for data sync
    secrets: [secrets.TANK01_KEY], // Secrets needed by data sync
};

export const emailOptions = {
    ...functionOptions,
    secrets: [secrets.AWS_ID, secrets.AWS_SECRET, secrets.AWS_REGION, secrets.MAIL_FROM], // Secrets needed by email functions
};

export const newsOptions = {
    ...functionOptions,
    secrets: [secrets.TANK01_KEY], // Secrets needed by news functions
};

export const leagueOptions = {
    ...functionOptions,
    // No specific secrets needed directly by league management callables
};

export const adminOptions = {
    ...functionOptions,
    // No specific secrets needed directly by admin role function
};

