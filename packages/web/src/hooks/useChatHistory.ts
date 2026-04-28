/**
 * Hook for persisting chat history to localStorage
 */
import { useState, useCallback, useEffect } from 'react';
import { config } from '../services/config';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

interface StoredSession {
  id: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = config.chat.storageKey;
const MAX_MESSAGES = config.chat.maxStoredMessages;

export function useChatHistory() {
  const [sessions, setSessions] = useState<StoredSession[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Persist to localStorage whenever sessions change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch (e) {
      console.warn('[ChatHistory] Failed to persist chat history:', e);
    }
  }, [sessions]);

  const getCurrentSession = useCallback((): StoredSession | undefined => {
    if (sessions.length === 0) return undefined;
    return sessions[sessions.length - 1];
  }, [sessions]);

  const createSession = useCallback((initialMessages: Message[] = []) => {
    const now = new Date().toISOString();
    const newSession: StoredSession = {
      id: `session-${Date.now()}`,
      messages: initialMessages,
      createdAt: now,
      updatedAt: now,
    };
    setSessions(prev => [...prev, newSession]);
    return newSession;
  }, []);

  const addMessages = useCallback((newMessages: Message[]) => {
    setSessions(prev => {
      if (prev.length === 0) {
        // Create a new session if none exists
        const now = new Date().toISOString();
        const newSession: StoredSession = {
          id: `session-${Date.now()}`,
          messages: newMessages.slice(-MAX_MESSAGES),
          createdAt: now,
          updatedAt: now,
        };
        return [newSession];
      }

      const updated = [...prev];
      const current = { ...updated[updated.length - 1] };
      current.messages = [...current.messages, ...newMessages].slice(-MAX_MESSAGES);
      current.updatedAt = new Date().toISOString();
      updated[updated.length - 1] = current;
      return updated;
    });
  }, []);

  const clearSessions = useCallback(() => {
    setSessions([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const deleteSession = useCallback((sessionId: string) => {
    setSessions(prev => prev.filter(s => s.id !== sessionId));
  }, []);

  return {
    sessions,
    currentSession: getCurrentSession(),
    createSession,
    addMessages,
    clearSessions,
    deleteSession,
  };
}
