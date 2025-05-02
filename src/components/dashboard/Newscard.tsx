/* ------------------------------------------------------------------
 *  NewsCard – NFL Headlines widget
 * ------------------------------------------------------------------ */
import { useEffect, useState } from "react";
import { fetchNews, NewsItem }  from "../../utils/api";
import { MoreDotIcon, RefreshIcon } from "../../icons";
import { Dropdown }   from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";

/* ––––– config ––––– */
const VISIBLE_STEP = 6;               // how many items at once

export default function NewsCard() {
  /* ---------------- state ----------------------------------------- */
  const [isOpen,  setIsOpen]  = useState(false);
  const [loading, setLoading] = useState(true);
  const [news,    setNews]    = useState<NewsItem[]>([]);
  const [visible, setVisible] = useState(VISIBLE_STEP);

  /* ---------------- data ------------------------------------------ */
  const loadNews = async () => {
    try {
      setLoading(true);
      const items = await fetchNews();
      setNews(items);
      setVisible(VISIBLE_STEP);       // reset “pagination” each refresh
    } catch (e) {
      console.error("News load failed", e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void loadNews(); }, []);

  /* ---------------- helpers --------------------------------------- */
  const timeAgo = (iso: string) => {
    const diffMs  = Date.now() - new Date(iso).getTime();
    const diffMin = Math.round(diffMs / 60000);
    if (diffMin < 1)  return "Just now";
    if (diffMin < 60) return `${diffMin} m ago`;
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24)   return `${diffH} h ago`;
    return `${Math.round(diffH / 24)} d ago`;
  };

  /* ---------------- ui -------------------------------------------- */
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6
                    dark:border-gray-800 dark:bg-white/[0.03]">
      {/* header */}
      <div className="mb-6 flex justify-between">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Latest NFL News
        </h3>

        <div className="relative inline-flex gap-2">
          {/* refresh */}
          <button
            onClick={loadNews}
            disabled={loading}
            title="Refresh"
            
          >
            <RefreshIcon className="size-5 text-gray-400 hover:text-gray-700
                                   dark:hover:text-gray-300" />
          </button>

          {/* menu */}
          <button onClick={() => setIsOpen(!isOpen)}>
            <MoreDotIcon className="size-6 text-gray-400 hover:text-gray-700
                                    dark:hover:text-gray-300" />
          </button>

          <Dropdown isOpen={isOpen} onClose={() => setIsOpen(false)} className="w-40 p-2">
            <DropdownItem
              onItemClick={() => {
                window.open("https://nfl.com/news", "_blank");
                setIsOpen(false);
              }}
              className="flex w-full text-left font-normal text-gray-500
                         rounded-lg hover:bg-gray-100 hover:text-gray-700
                         dark:text-gray-400 dark:hover:bg-white/5
                         dark:hover:text-gray-300"
            >
              NFL.com
            </DropdownItem>
          </Dropdown>
        </div>
      </div>

      {/* body */}
      {loading ? (
        <p className="py-16 text-center text-sm text-gray-400">loading…</p>
      ) : news.length === 0 ? (
        <p className="py-16 text-center text-sm text-gray-400">
          No articles right now
        </p>
      ) : (
        <>
          <div className="relative max-h-[540px] overflow-y-auto pr-2">
            {/* timeline line */}
            <div className="absolute top-6 bottom-6 left-5 w-px
                            bg-gray-200 dark:bg-gray-800" />

            {news.slice(0, visible).map((n) => (
              <a
                key={n.id}
                href={n.link}
                target="_blank"
                rel="noopener noreferrer"
                className="relative mb-6 flex last:mb-0 group"
              >
                <div className="z-10 flex-shrink-0">
                  <div className="size-10 rounded-full bg-emerald-500/10
                                  flex items-center justify-center
                                  ring-4 ring-white dark:ring-gray-800">
                    🏈
                  </div>
                </div>

                <div className="ml-4">
                  <h4 className="text-theme-sm font-medium
                                 text-gray-800 dark:text-white/90
                                 group-hover:underline">
                    {n.title}
                  </h4>
                  <p className="text-theme-xs mt-1 text-gray-500 dark:text-gray-400">
                    {n.source} • {timeAgo(n.published)}
                  </p>
                </div>
              </a>
            ))}
          </div>

          {/* load-more button */}
          {visible < news.length && (
            <button
              onClick={() => setVisible(v => v + VISIBLE_STEP)}
              className="mt-6 w-full flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white p-2.5 text-theme-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03]"
            >
              Show more
            </button>
          )}
        </>
      )}
    </div>
  );
}
