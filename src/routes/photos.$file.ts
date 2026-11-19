import fs from "node:fs/promises";
import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { getSessionUser } from "@/server/auth";
import { uploadPath } from "@/server/uploads";

export const Route = createFileRoute("/photos/$file")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const user = await getSessionUser();
        if (!user || user.status !== "active") return new Response("Sign in to view photos", { status: 401 });
        const [photo] = await db.select().from(schema.listingPhotos).where(eq(schema.listingPhotos.fileName, params.file));
        if (!photo) return new Response("Not found", { status: 404 });
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
