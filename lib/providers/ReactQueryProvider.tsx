'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export default function ReactQueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime:        60_000,   // 1 min before background refetch
        gcTime:           300_000,  // 5 min cache retention
        retry:            1,
        refetchOnWindowFocus: false,
      },
    },
  }))
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
