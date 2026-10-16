import type { AppointmentStatus } from './appointments';

/** No row yet = scheduled. Created at the first join (blueprint §13.1). */
export const CONSULTATION_STATUSES = ['WAITING', 'ACTIVE', 'COMPLETED', 'EXPIRED'] as const;
export type ConsultationStatus = (typeof CONSULTATION_STATUSES)[number];

export const CONSULTATION_EVENT_TYPES = ['JOINED', 'LEFT', 'RECONNECTED', 'VIDEO_FAILED'] as const;
export type ConsultationEventType = (typeof CONSULTATION_EVENT_TYPES)[number];

export const MESSAGE_TYPES = ['TEXT', 'SYSTEM', 'PRESCRIPTION_CARD'] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

/** The join window opens this long before the start… */
export const JOIN_OPENS_MINUTES_BEFORE = 10;
/** …and closes this long after the end (blueprint §13.1). */
export const JOIN_GRACE_MINUTES_AFTER = 15;
export const MESSAGE_MAX_LENGTH = 2000;

/** When joining is possible for an appointment. Same rule in the app (Join button) and the API. */
export function joinWindow(a: { startAt: string; endAt: string }) {
  return {
    opensAt: new Date(new Date(a.startAt).getTime() - JOIN_OPENS_MINUTES_BEFORE * 60_000),
    closesAt: new Date(new Date(a.endAt).getTime() + JOIN_GRACE_MINUTES_AFTER * 60_000),
  };
}

export function canJoinNow(
  a: { status: AppointmentStatus; startAt: string; endAt: string },
  now = new Date(),
) {
  const { opensAt, closesAt } = joinWindow(a);
  return a.status === 'BOOKED' && now >= opensAt && now < closesAt;
}

export interface ChatMessage {
  /** Increasing number; also the cursor for "messages after". */
  id: number;
  type: MessageType;
  /** Null for system messages. */
  senderId: string | null;
  /** The sender's own id for this message, so a retry is never shown twice. */
  clientMsgId: string | null;
  body: string;
  createdAt: string;
}

export interface Consultation {
  id: string;
  appointmentId: string;
  status: ConsultationStatus;
  startedAt: string | null;
  endedAt: string | null;
  /** Who is in the room right now (seen in the last ~30 s). */
  present: { patient: boolean; doctor: boolean };
}

/** How the app should show video. `null` = chat-only (video disabled or unavailable). */
export interface VideoAccess {
  provider: string;
  roomId: string;
  token: string;
  expiresAt: string;
}

/** POST /v1/appointments/:id/join */
export interface JoinResponse {
  consultation: Consultation;
  video: VideoAccess | null;
  /** Load chat from here: GET …/updates?after=0 returns everything. */
  cursor: number;
}

/** GET /v1/consultations/:id/updates?after=&wait= (long poll). */
export interface ConsultationUpdates {
  consultation: Consultation;
  messages: ChatMessage[];
  /** Pass back as `after` on the next call. */
  cursor: number;
}

export interface SendMessageRequest {
  clientMsgId: string;
  body: string;
}
