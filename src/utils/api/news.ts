/* utils/api/news.ts
   ------------------------------------------------------------------ */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { http } from "./http";

/* ---------- raw types returned by the Cloud Function ------------- */
interface RawNews {
  title    : string;
  link     : string;
  updated? : string;
  published?: string;
  source?  : string;
}

/* ---------- DTO used by the UI ----------------------------------- */
export interface NewsItem {
  id       : string;
  title    : string;
  link     : string;
  published: string;
  source   : string;
}

/* ---------- friendly-name map ------------------------------------ */
const SOURCE_LABELS: Record<string, string> = {
  "espn.com"                 : "ESPN",
  "theathletic.com"          : "The Athletic",
  "nytimes.com"              : "NY Times",
  "theramswire.usatoday.com" : "USA Today / Rams Wire",
  "usawire.usatoday.com"     : "USA Today",
  "x.com"                    : "X",
  "twitter.com"              : "Twitter",
  // ➜ add more whenever you meet a new site
};

/* Derive a nice source label from the link URL. */
function prettySource(url: string | undefined, fallback = "Tank01"): string {
  if (!url) return fallback;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return SOURCE_LABELS[host] ?? host;               // mapped or raw host
  } catch {
    return fallback;
  }
}

/* ------------------------------------------------------------------ */
/*  Public helper used by the components                              */
/* ------------------------------------------------------------------ */
export async function fetchNews(): Promise<NewsItem[]> {
  const res = await http.get("/getNFLNews");

  /* the function may return either
     -   an array           → [...]                        (v1)
     -   or { data: [...] } → { data: [...] , source:"…" } (v2) */
  const raw: unknown = res.data;
  const list: RawNews[] =
    Array.isArray(raw)               ? raw :
    Array.isArray((raw as any)?.data)? (raw as any).data : [];

  /* normalise ------------------------------------------------------ */
  return list.map((it, idx) => ({
    id   : `news-${idx}`,
    title: it.title ?? "Untitled",
    link : it.link  ?? "#",
    published: it.updated ?? it.published ?? new Date().toISOString(),
    source   : prettySource(it.link, it.source ?? "Tank01"),
  }));
}
