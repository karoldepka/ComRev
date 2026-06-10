'use client';

import { TextStreamChatTransport, isTextUIPart, type UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useEffect, useMemo, useRef, useState } from 'react';

interface ChatPanelProps {
  onClose: () => void;
  systemPrompt?: string;
}

export default function ChatPanel({ onClose, systemPrompt }: ChatPanelProps) {
  const transport = useMemo(
    () => new TextStreamChatTransport({ api: '/api/chat', body: { systemPrompt } }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [systemPrompt],
  );

  const { messages, sendMessage, status, error } = useChat({ transport });

  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isLoading = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submit() {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    sendMessage({ role: 'user', parts: [{ type: 'text', text }] });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
    if (e.key === 'Escape') onClose();
  }

  return (
    <div className="chat-panel">
      <div className="chat-panel-header">
        <span className="chat-panel-title">Chat</span>
        <button type="button" className="ai-fill-close-btn" onClick={onClose} aria-label="Close chat">✕</button>
      </div>

      <div className="chat-panel-messages">
        {messages.length === 0 && (
          <div className="chat-panel-empty">Ask me anything about this table…</div>
        )}
        {messages.map((m: UIMessage) => {
          const textContent = m.parts
            .filter(isTextUIPart)
            .map((p) => p.text)
            .join('');
          if (!textContent && m.role !== 'user') return null;
          return (
            <div key={m.id} className={`chat-msg chat-msg--${m.role}`}>
              <span className="chat-msg-role">{m.role === 'user' ? 'You' : 'AI'}</span>
              <div className="chat-msg-content">{textContent}</div>
            </div>
          );
        })}
        {isLoading && (
          <div className="chat-msg chat-msg--assistant">
            <span className="chat-msg-role">AI</span>
            <div className="chat-msg-content chat-msg-thinking">
              <span className="jobs-indicator-spinner" />
            </div>
          </div>
        )}
        {error && (
          <div className="chat-panel-error">{error.message}</div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-panel-form">
        <textarea
          ref={inputRef}
          className="chat-panel-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message… (Enter to send, Shift+Enter for newline)"
          rows={2}
          disabled={isLoading}
        />
        <button
          type="button"
          className="chat-panel-send"
          disabled={isLoading || !input.trim()}
          onClick={submit}
        >
          Send
        </button>
      </div>
    </div>
  );
}
