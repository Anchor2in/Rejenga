export type UserRole = "community" | "technician" | "admin";
export type UserStatus = "pending" | "active" | "suspended";
export type InspectionStatus = "not_inspected" | "checked" | "rejected" | "blocked_unsafe";
export type Availability = "available" | "reserved" | "handed_over" | "withdrawn";
export type ListingStatus = "active" | "withdrawn" | "removed" | "closed";
export type DonorCondition = "working" | "unsure" | "not_working";
export type RequestStatus = "open" | "reserved" | "fulfilled" | "cancelled";
export type MatchStatus =
  | "reserved"
  | "accepted"
  | "rejected"
  | "blocked_unsafe"
  | "completed"
  | "declined"
  | "cancelled"
  | "expired";

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  areaId: number | null;
};

export const donorConditionLabel: Record<DonorCondition, string> = {
  working: "Worked when last used",
  unsure: "Not sure if it works",
  not_working: "Probably not working",
};

export const matchStatusLabel: Record<MatchStatus, string> = {
  reserved: "Reserved — waiting for technician check",
  accepted: "Technician accepted — arrange handover",
  rejected: "Rejected by technician",
  blocked_unsafe: "Blocked: unsafe",
  completed: "Handed over",
  declined: "Declined after check",
  cancelled: "Cancelled",
  expired: "Expired",
};

export const requestStatusLabel: Record<RequestStatus, string> = {
  open: "Open — looking for parts",
  reserved: "Part reserved",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
};

export const availabilityLabel: Record<Availability, string> = { available: "Available", reserved: "Reserved", handed_over: "Handed over", withdrawn: "Withdrawn" };

export const listingStatusLabel: Record<ListingStatus, string> = { active: "Active", withdrawn: "Withdrawn", removed: "Removed by admin", closed: "Closed" };
