import { AppSidebar } from "@/components/shared/app-sidebar"
import { Topbar } from "@/components/shared/topbar"
import { DevBar } from "@/components/shared/dev-bar"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const isDev = process.env.NODE_ENV === "development"

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar />
      <div className="flex flex-col flex-1 ml-56 overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          <div className="p-5 min-h-full">
            {children}
          </div>
        </main>
      </div>

      {isDev && <DevBar />}
    </div>
  )
}
