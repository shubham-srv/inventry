"use client"

import { useEffect } from "react"
import { TriangleAlert, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Error boundary for every page under (app). Without one, a thrown server error
 * takes out the whole app shell; this keeps the sidebar and header intact and
 * offers a retry, which handles the common case of a transient DB hiccup.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <div className="bg-destructive/10 text-destructive flex size-12 items-center justify-center rounded-full">
        <TriangleAlert className="size-6" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="text-muted-foreground max-w-md text-sm">
          This page couldn&apos;t be loaded. Trying again often works; if it keeps happening, the
          digest below helps track it down in the server logs.
        </p>
        {error.digest && (
          <p className="text-muted-foreground pt-1 font-mono text-xs">digest: {error.digest}</p>
        )}
      </div>
      <Button onClick={reset} variant="outline" size="sm">
        <RotateCcw className="size-4" /> Try again
      </Button>
    </div>
  )
}
