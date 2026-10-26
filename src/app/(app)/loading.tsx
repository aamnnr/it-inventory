export default function Loading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-48 rounded bg-border" />
      <div className="h-4 w-72 rounded bg-border" />
      <div className="h-64 rounded-lg bg-border/60" />
    </div>
  );
}
