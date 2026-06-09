import { createFileRoute } from "@tanstack/react-router";
import { handleShoeEventIngest } from "@/lib/shoe-event-ingest.server";

export const Route = createFileRoute("/api/ingest/shoe-event")({
  server: {
    handlers: {
      POST: async ({ request }) => handleShoeEventIngest(request),
    },
  },
});
