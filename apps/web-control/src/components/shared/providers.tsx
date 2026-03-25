"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "sonner"
import { useState } from "react"

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        retry: 1,
      },
    },
  }))

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster
        theme="dark"
        position="top-right"
        toastOptions={{
          style: {
            background: "oklch(0.12 0.01 220)",
            border: "1px solid oklch(0.22 0.02 200 / 60%)",
            color: "oklch(0.9 0.03 140)",
            fontFamily: "var(--font-geist-mono)",
            fontSize: "13px",
          },
        }}
      />
    </QueryClientProvider>
  )
}
