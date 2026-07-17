import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import axios from 'axios';

export enum OpenwaSessionState {
  UNKNOWN = 'UNKNOWN',
  UNHEALTHY = 'UNHEALTHY',
  CONNECTING = 'CONNECTING',
  REGISTERING = 'REGISTERING',
  CONNECTED = 'CONNECTED',
}

export interface SessionInfo {
  id: string;
  state: OpenwaSessionState;
  status: string;
  lastCheckedAt: string;
  lastConnectedAt: string | null;
  error?: string;
}

@Injectable()
export class OpenwaSessionService {
  private readonly logger = new Logger(OpenwaSessionService.name);
  private state: OpenwaSessionState = OpenwaSessionState.UNKNOWN;
  private lastConnectedAt: string | null = null;
  private sessionId: string;

  constructor(private readonly eventEmitter: EventEmitter2) {
    this.sessionId = process.env.OPENWA_SESSION_ID || '';
    this.sessionName = process.env.OPENWA_SESSION_NAME || this.sessionId;
  }

  private sessionName: string;

  getCurrentState(): OpenwaSessionState {
    return this.state;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  isConnected(): boolean {
    return this.state === OpenwaSessionState.CONNECTED;
  }

  getSessionInfo(): SessionInfo {
    return {
      id: this.sessionId,
      state: this.state,
      status: this.state.toLowerCase(),
      lastCheckedAt: new Date().toISOString(),
      lastConnectedAt: this.lastConnectedAt,
    };
  }

  private setState(newState: OpenwaSessionState, error?: string): void {
    const oldState = this.state;
    if (oldState === newState) return;
    this.state = newState;
    this.logger.log(`[OpenwaSession] State: ${oldState} → ${newState}${error ? ` (${error})` : ''}`);
    this.eventEmitter.emit('openwa.state.changed', {
      from: oldState,
      to: newState,
      sessionId: this.sessionId,
      error,
      timestamp: new Date().toISOString(),
    });
  }

  async getStatus(): Promise<SessionInfo> {
    if (!this.isValidUuid(this.sessionId)) {
      this.setState(OpenwaSessionState.UNHEALTHY, 'Invalid session UUID');
      return { ...this.getSessionInfo(), error: 'Invalid session UUID' };
    }

    const apiUrl = this.getApiUrl();
    const apiKey = this.getApiKey();

    try {
      const response = await axios.get(`${apiUrl}/sessions/${this.sessionId}`, {
        headers: { 'X-API-Key': apiKey },
        timeout: 5000,
      });

      const sessionData = response.data?.session ?? response.data;
      const rawStatus = sessionData?.status ?? sessionData?.state ?? 'unknown';
      const isConnected = rawStatus === 'connected' || rawStatus === 'open' || rawStatus === 'active';

      if (isConnected) {
        if (this.state !== OpenwaSessionState.CONNECTED) {
          this.lastConnectedAt = new Date().toISOString();
        }
        this.setState(OpenwaSessionState.CONNECTED);
      } else {
        this.setState(OpenwaSessionState.UNHEALTHY, `Session status: ${rawStatus}`);
      }

      return this.getSessionInfo();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        this.logger.warn(`[OpenwaSession] Session ${this.sessionId} not found on server — creating new session`);
        this.sessionId = '';
        const newId = await this.createSession();
        if (newId) {
          return this.getSessionInfo();
        }
      }
      this.setState(OpenwaSessionState.UNHEALTHY, (err as Error).message);
      return { ...this.getSessionInfo(), error: (err as Error).message };
    }
  }

  async reconnect(): Promise<boolean> {
    if (!this.isValidUuid(this.sessionId)) return false;

    const apiUrl = this.getApiUrl();
    const apiKey = this.getApiKey();
    this.setState(OpenwaSessionState.CONNECTING);

    try {
      const resp = await axios.post(
        `${apiUrl}/sessions/${this.sessionId}/reconnect`,
        {},
        { headers: { 'X-API-Key': apiKey }, timeout: 15_000 },
      );

      if (resp.status === 200) {
        this.lastConnectedAt = new Date().toISOString();
        this.setState(OpenwaSessionState.REGISTERING);
        this.eventEmitter.emit('openwa.session.reconnected', {
          sessionId: this.sessionId,
          timestamp: new Date().toISOString(),
        });
        return true;
      }

      this.setState(OpenwaSessionState.UNHEALTHY, `Reconnect returned status ${resp.status}`);
      return false;
    } catch (err) {
      this.setState(OpenwaSessionState.UNHEALTHY, `Reconnect failed: ${(err as Error).message}`);
      return false;
    }
  }

  async createSession(): Promise<string | null> {
    const apiUrl = this.getApiUrl();
    const apiKey = this.getApiKey();
    this.setState(OpenwaSessionState.CONNECTING);

    try {
      const response = await axios.post(
        `${apiUrl}/sessions`,
        { name: this.sessionName },
        { headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey }, timeout: 15_000 },
      );

      const newId = response.data?.id ?? response.data?.sessionId ?? null;
      if (newId && typeof newId === 'string' && this.isValidUuid(newId)) {
        this.sessionId = newId;
        this.lastConnectedAt = null;
        this.logger.log(`[OpenwaSession] Created new session: ${newId}`);
        this.eventEmitter.emit('openwa.session.created', {
          sessionId: newId,
          timestamp: new Date().toISOString(),
        });
        return newId;
      }

      this.setState(OpenwaSessionState.UNHEALTHY, 'Create session returned invalid ID');
      return null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        this.logger.warn(`[OpenwaSession] Session "${this.sessionName}" already exists — looking up by name`);
        try {
          const listResp = await axios.get(`${apiUrl}/sessions`, {
            headers: { 'X-API-Key': apiKey },
            timeout: 10_000,
          });
          const existing = (listResp.data ?? []).find((s: any) => s.name === this.sessionName);
          if (existing?.id && this.isValidUuid(existing.id)) {
            this.sessionId = existing.id;
            this.logger.log(`[OpenwaSession] Found existing session: ${existing.id}`);
            return existing.id;
          }
        } catch { /* fall through */ }
      }
      this.setState(OpenwaSessionState.UNHEALTHY, `Create session failed: ${(err as Error).message}`);
      return null;
    }
  }

  async deleteSession(): Promise<boolean> {
    if (!this.isValidUuid(this.sessionId)) return false;

    const apiUrl = this.getApiUrl();
    const apiKey = this.getApiKey();

    try {
      await axios.delete(`${apiUrl}/sessions/${this.sessionId}`, {
        headers: { 'X-API-Key': apiKey },
        timeout: 10_000,
      });
      this.logger.log(`[OpenwaSession] Deleted session: ${this.sessionId}`);
      this.sessionId = '';
      this.setState(OpenwaSessionState.UNKNOWN);
      return true;
    } catch (err) {
      this.logger.warn(`[OpenwaSession] Delete session failed: ${(err as Error).message}`);
      return false;
    }
  }

  private getApiUrl(): string {
    return process.env.OPENWA_API_URL || 'http://localhost:2785/api';
  }

  private getApiKey(): string {
    return process.env.OPENWA_API_KEY;
  }

  private isValidUuid(uuid: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
  }
}
