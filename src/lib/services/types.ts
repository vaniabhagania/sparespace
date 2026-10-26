export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/** Statuses that hold a bay (so they count towards capacity). Pending only holds it until it expires. */
export const HOLDING_STATUSES = ["confirmed", "checked_in"] as const;

export interface SpaceRow {
  id: string;
  host_id: string;
  title: string;
  description: string;
  kind: string;
  area_label: string;
  address_line: string;
  lat: number;
  lng: number;
  max_length_cm: number;
  max_width_cm: number;
  max_height_cm: number;
  capacity: number;
  price_hour_paise: number;
  price_day_paise: number | null;
  instant_book: boolean;
  days_mask: number;
  open_minute: number;
  close_minute: number;
  access_notes: string;
  amenities: string[];
  rights_confirmed: boolean;
  status: "active" | "paused" | "suspended";
  created_at: Date;
  updated_at: Date;
}

export interface BookingRow {
  id: string;
  space_id: string;
  driver_id: string;
  vehicle_id: string | null;
  vehicle_label: string;
  vehicle_kind: string;
  v_length_cm: number;
  v_width_cm: number;
  v_height_cm: number;
  vehicle_plate: string | null;
  start_at: Date;
  end_at: Date;
  status:
    | "pending"
    | "confirmed"
    | "declined"
    | "expired"
    | "cancelled_by_driver"
    | "cancelled_by_host"
    | "checked_in"
    | "completed"
    | "no_show";
  price_paise: number;
  price_hour_paise: number;
  payment_method: "at_space";
  payment_status: "unpaid" | "paid" | "disputed";
  paid_via: "cash" | "upi" | null;
  checkin_code: string;
  checkin_attempts: number;
  checked_in_at: Date | null;
  ended_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export const AMENITIES = [
  { id: "covered", label: "Covered" },
  { id: "cctv", label: "CCTV" },
  { id: "guarded", label: "Security guard" },
  { id: "ev", label: "EV charging" },
  { id: "lit", label: "Well lit at night" },
  { id: "gated", label: "Gated" },
] as const;

export const SPACE_KINDS = [
  { id: "apartment", label: "Apartment or society" },
  { id: "mall", label: "Mall or complex" },
  { id: "office", label: "Office or campus" },
  { id: "driveway", label: "Home driveway or garage" },
  { id: "open_lot", label: "Open plot or lot" },
  { id: "covered", label: "Covered or basement parking" },
] as const;

export const SPACE_KIND_LABELS: Record<string, string> = Object.fromEntries(
  SPACE_KINDS.map((k) => [k.id, k.label]),
);

export const COMPLAINT_CATEGORIES = [
  { id: "fake_listing", label: "This space isn't real or isn't theirs to rent" },
  { id: "wrong_details", label: "Size, price or location was wrong" },
  { id: "unsafe", label: "I felt unsafe or the space was unsafe" },
  { id: "no_show", label: "The other person didn't turn up" },
  { id: "overstay", label: "Someone stayed past their time" },
  { id: "payment", label: "A payment problem" },
  { id: "behaviour", label: "Rude or inappropriate behaviour" },
  { id: "other", label: "Something else" },
] as const;

export const COMPLAINT_LABELS: Record<string, string> = Object.fromEntries(
  COMPLAINT_CATEGORIES.map((c) => [c.id, c.label]),
);
