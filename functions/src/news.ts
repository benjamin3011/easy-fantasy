// src/news.ts
import axios, { AxiosRequestConfig } from "axios";
import { logger } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
// Import shared config/secrets
import { newsOptions, secrets, hosts } from './config';

// Get db instance (initialized in index.ts)
const db = admin.firestore();

interface Tank01News {
  title: string;
  link : string;
  updated?: string;
  published?: string;
}

// Helper to get headers at runtime
const getTank01Headers = () => ({
    "x-rapidapi-key": secrets.TANK01_KEY.value(),
    "x-rapidapi-host": hosts.TANK01_NFL_API,
});

async function getFreshNews(): Promise<Tank01News[]> {
    const cfg: AxiosRequestConfig = {
        method: "GET",
        url: `https://${hosts.TANK01_NFL_API}/getNFLNews`,
        params: { recentNews: true, maxItems: 50 },
        headers: getTank01Headers(),
    };
    const { data } = await axios.request<{ body?: Tank01News[] }>(cfg);
    return data.body ?? [];
}

async function loadNews(): Promise<Tank01News[]> {
    const doc = db.doc("apiCache/nflNews");
    const snap = await doc.get();

    if (snap.exists) {
        interface NewsCache { data: Tank01News[]; fetchedAt: Timestamp; }
        const cacheData = snap.data() as NewsCache;
        const ageMin = (Date.now() - cacheData.fetchedAt.toMillis()) / 60000;
        if (ageMin < 5) { logger.info("Serving cached news data."); return cacheData.data; }
    }

    logger.info("Fetching fresh news data.");
    const fresh = await getFreshNews();
    await doc.set({
        data: fresh,
        fetchedAt: Timestamp.now(), // Use Timestamp directly
    });
    return fresh;
}

// Using v2 onRequest
export const getNFLNews = onRequest(
  { ...newsOptions, cors: true }, // Spread common options + secrets, add cors
  async (req, res) => {
      // Cors might be handled by option, check if manual needed
      // await corsHandler(req, res, async () => { ... });
      try {
        const items = await loadNews();
        res.status(200).json({ data: items });
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error("getNFLNews error", { error: errorMessage, detail: err });
        res.status(500).json({ error: "Failed to load news" });
      }
  }
);

// Cloud-scheduler: every 15 min refresh
export const refreshNFLNews = onSchedule(
  {
    schedule: "every 15 minutes",
    timeZone: "Europe/Berlin", // Good practice to specify timezone
    ...newsOptions, // Spread common options + secrets
  },
  async () => {
    try {
        await loadNews();
        logger.log("News cache refreshed successfully.");
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("Failed to refresh news cache.", { error: errorMessage, detail: error });
    }
  }
);
