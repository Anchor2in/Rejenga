import { createServerFn } from "@tanstack/react-start";
import { and, count, eq, inArray, or } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { getSessionUser } from "@/server/auth";
import { expireReservations } from "@/server/workflow";

const { deviceListings, partRequests, matches, listingParts, users } = schema;

export const getDashboardFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await getSessionUser();
  if (!user) throw new Error("Please sign in first.");
  if (user.status !== "active") return { user, stats: null };
  await expireReservations();
  const open = inArray(matches.status, ["reserved", "accepted"]);
  const [[listings], [requests], [openMatches], [waitingInspection], [pendingUsers]] = await Promise.all([
    db.select({ n: count() }).from(deviceListings).where(and(eq(deviceListings.donorId, user.id), eq(deviceListings.status, "active"))),
    db.select({ n: count() }).from(partRequests).where(and(eq(partRequests.recipientId, user.id), inArray(partRequests.status, ["open", "reserved"]))),
    db
      .select({ n: count() })
      .from(matches)
      .innerJoin(listingParts, eq(listingParts.id, matches.listingPartId))
      .innerJoin(deviceListings, eq(deviceListings.id, listingParts.listingId))
      .innerJoin(partRequests, eq(partRequests.id, matches.requestId))
      .where(and(open, or(eq(deviceListings.donorId, user.id), eq(partRequests.recipientId, user.id)))),
    db.select({ n: count() }).from(matches).where(eq(matches.status, "reserved")),
    db.select({ n: count() }).from(users).where(eq(users.status, "pending")),
  ]);
  return {
    user,
    stats: {
      listings: listings.n,
      requests: requests.n,
      openMatches: openMatches.n,
      waitingInspection: user.role === "community" ? 0 : waitingInspection.n,
      pendingUsers: user.role === "admin" ? pendingUsers.n : 0,
    },
  };
});
