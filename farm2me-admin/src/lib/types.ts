export interface Overview {
  stats: {
    totalUsers: number;
    activeListings: number;
    fundsInEscrow: number;
    completedTripsToday: number;
  };
  dailyVolume: { date: string; volume: number }[];
  listingsByCrop: { cropType: string; count: number }[];
}

export type DisputeStatus = "OPEN" | "RESOLVED";

export interface DisputeRow {
  id: string;
  reason: string;
  status: DisputeStatus;
  createdAt: string;
  resolution: string | null;
  raisedBy: { fullName: string; role: string };
  escrowTrip: { id: string; totalAmount: string | number; status: string };
}

export interface PartyRef {
  id: string;
  fullName: string;
  role?: string;
}

export interface DisputeDetail {
  id: string;
  reason: string;
  evidenceUrls: string[];
  status: DisputeStatus;
  resolution: string | null;
  createdAt: string;
  amountAtStake: number;
  escrowStatus: string;
  parties: {
    buyer: PartyRef | null;
    driver: PartyRef | null;
    farmers: PartyRef[];
    raisedBy: PartyRef;
  };
}

export interface PendingTransporter {
  id: string;
  fullName: string;
  phoneNumber: string;
  createdAt: string;
}

export interface InTransitTrip {
  escrowTripId: string;
  cargo: string;
  requiredCrates: number;
  route: { pickup: string; dropoff: string };
  driverName: string;
  buyerName: string;
  amountLocked: number;
  hoursInTransit: number;
  band: "green" | "amber" | "red";
}

export interface AdminUser {
  id: string;
  fullName: string;
  role: string;
  phoneNumber: string;
}
