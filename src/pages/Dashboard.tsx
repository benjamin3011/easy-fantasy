import PageMeta from "../components/common/PageMeta";
import NewsCard from "../components/dashboard/Newscard";

export default function Dashboard() {
  return (
    <>
      <PageMeta
        title="Dashboard | Easy Fantasy"
        description="NFL Fantasy Football"
      />
      <div className="space-y-5 sm:space-y-6">
        <div className="gap-6 space-y-5 sm:space-y-6 xl:grid xl:grid-cols-12 xl:space-y-0">
          
          <div className="space-y-5 sm:space-y-6 xl:col-span-7 2xl:col-span-4">

            {/* News */}
            <NewsCard />
          </div>
        </div>
      </div>
    </>
  );
}
