import { RevenueDashboard } from "@/features/dashboard/revenue-dashboard";

export default function Home() {
  return (
    <div className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Financial Analytics
          </h1>
          <p className="text-muted-foreground">
            Revenue metrics across regions
          </p>
        </div>
        <RevenueDashboard />
      </div>
    </div>
  );
}
