import { Injectable } from "@nestjs/common";
import { SessionState } from "./types";

@Injectable()
export class SessionManager {
  private sessionMap = new Map<string, SessionState>();

  /**
   * Create a new session
   */
  createSession(sessionId: string): SessionState {
    const session: SessionState = {};
    this.sessionMap.set(sessionId, session);
    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): SessionState | undefined {
    return this.sessionMap.get(sessionId);
  }

  /**
   * Update session
   */
  updateSession(sessionId: string, updates: Partial<SessionState>): SessionState {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const updatedSession = { ...session, ...updates };
    this.sessionMap.set(sessionId, updatedSession);
    return updatedSession;
  }

  /**
   * Delete session
   */
  deleteSession(sessionId: string): boolean {
    return this.sessionMap.delete(sessionId);
  }

  /**
   * Check if session exists
   */
  hasSession(sessionId: string): boolean {
    return this.sessionMap.has(sessionId);
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): Map<string, SessionState> {
    return new Map(this.sessionMap);
  }

  /**
   * Clear all sessions (useful for testing or maintenance)
   */
  clearAllSessions(): void {
    this.sessionMap.clear();
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessionMap.size;
  }
}
