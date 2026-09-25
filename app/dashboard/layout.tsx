import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import { CompanyProvider } from "@/components/CompanyContext";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-ink">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <TopBar />
        <main>
          <CompanyProvider>{children}</CompanyProvider>
        </main>
      </div>
    </div>
  );
}
