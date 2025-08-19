import { useIsFetching } from '@tanstack/react-query';

export default function QueryGlobalLoader() {
  const fetching = useIsFetching();

  if (!fetching) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[999998] pointer-events-none">
      <div className="h-[2px] w-full bg-gradient-to-r from-brand-500 via-brand-400 to-brand-300 animate-pulse" />
    </div>
  );
}
