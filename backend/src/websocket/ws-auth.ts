import { Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_ACCESS_SECRET;

export interface WsAuthenticatedSocket extends Socket {
  data: {
    cafeId: string;
    userId: string;
    role: string;
    [key: string]: unknown;
  };
}

export interface JwtWsPayload {
  sub: string;
  role: string;
  cafeId?: string;
  phone?: string;
  branchId?: string;
}

const ROLE_ROOM_MAP: Record<string, string> = {
  OWNER: 'owner',
  BARISTA: 'barista',
  DRIVER: 'driver',
};

export function authenticateSocket(client: Socket): boolean {
  const token = client.handshake.auth?.token as string | undefined;
  if (!token) return false;

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtWsPayload;
    const cafeId = decoded.cafeId;
    const role = decoded.role;

    if (!cafeId) return false;

    client.data.cafeId = cafeId;
    client.data.userId = decoded.sub;
    client.data.role = role;

    client.join(`cafe:${cafeId}`);

    const roleKey = ROLE_ROOM_MAP[role];
    if (roleKey) {
      client.join(`cafe:${cafeId}:${roleKey}`);
    }

    return true;
  } catch {
    return false;
  }
}

export function getRoomKey(cafeId: string): string {
  return `cafe:${cafeId}`;
}

export function getRoleRoomKey(cafeId: string, role: string): string {
  return `cafe:${cafeId}:${role}`;
}
