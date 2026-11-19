import fs from "node:fs/promises";
import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { getSessionUser } from "@/server/auth";
import { uploadPath } from "@/server/uploads";

export const Route = createFileRoute("/photos/$file")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const user = await getSessionUser();
        if (!user || user.status !== "active") return new Response("Sign in to view photos", { status: 401 });
        const { listingPhotos, deviceListings, listingParts, matches, partRequests } = schema;
        const [photo] = await db
          .select({ fileName: listingPhotos.fileName, mimeType: listingPhotos.mimeType, listingId: listingPhotos.listingId, donorId: deviceListings.donorId, listingStatus: deviceListings.status })
          .from(listingPhotos)
          .innerJoin(deviceListings, eq(deviceListings.id, listingPhotos.listingId))
          .where(eq(listingPhotos.fileName, params.file));
        if (!photo) return new Response("Not found", { status: 404 });
        // Photos of active listings are visible to signed-in users browsing matches; closed listings only to staff, the donor and past match parties.
        let allowed = user.role !== "community" || photo.donorId === user.id || photo.listingStatus === "active";
        if (!allowed) {
          const [m] = await db
            .select({ id: matches.id })
            .from(matches)
            .innerJoin(listingParts, eq(listingParts.id, matches.listingPartId))
            .innerJoin(partRequests, eq(partRequests.id, matches.requestId))
            .where(and(eq(listingParts.listingId, photo.listingId), eq(partRequests.recipientId, user.id)))
            .limit(1);
          allowed = Boolean(m);
        }
        if (!allowed) return new Response("Not found", { status: 404 });
        try {
          const body = await fs.readFile(uploadPath(photo.fileName));
          return new Response(body, { headers: { "content-type": photo.mimeType, "cache-control": "private, max-age=3600" } });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      },
    },
  },
});
