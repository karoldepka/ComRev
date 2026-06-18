'use client';

import { TextStreamChatTransport, isTextUIPart, type UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useEffect, useMemo, useRef, useState } from 'react';

export type ChatMode = 'table' | 'cv';

interface ChatPanelProps {
  onClose: () => void;
  systemPrompt?: string;
  initialMode?: ChatMode;
}

// ── Markdown renderer (bold, italic, code, bullets, tables, line breaks) ─────

function renderMarkdown(text: string): { __html: string } {
  // 1. Escape HTML entities
  let s = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 2. Inline formatting (leaves newlines intact)
  s = s
    .replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>')
    .replace(/__(.+?)__/gs, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>')
    .replace(/`([^`\n]+)`/g, '<code class="cv-code">$1</code>');

  // 3. Bullet lists
  s = s
    .replace(/^[ \t]*[-*][ \t]+(.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul class="cv-list">$1</ul>');

  // 4. Markdown tables — collect consecutive `| … |` lines into <table>
  const isSep = (l: string) => /^\s*\|[-\s:|]+\|\s*$/.test(l);
  const parseCells = (l: string) => l.trim().split('|').slice(1, -1).map(c => c.trim());
  const lines = s.split('\n');
  const parts: string[] = [];
  let tableRows: string[] = [];

  function flushTable() {
    if (tableRows.length === 0) return;
    const sepIdx = tableRows.findIndex(isSep);
    if (sepIdx < 1) {
      parts.push(tableRows.join('\n'));
    } else {
      const headers = parseCells(tableRows[0]);
      const body = tableRows.slice(sepIdx + 1).filter(l => !isSep(l));
      const thead = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>`;
      const tbody = body.length
        ? `<tbody>${body.map(l => `<tr>${parseCells(l).map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>`
        : '';
      parts.push(`<table class="cv-table">${thead}${tbody}</table>`);
    }
    tableRows = [];
  }

  for (const line of lines) {
    if (/^\s*\|/.test(line)) {
      tableRows.push(line);
    } else {
      flushTable();
      parts.push(line);
    }
  }
  flushTable();

  // 5. Newlines → <br> (tables are already collapsed to single strings)
  return { __html: parts.join('\n').replace(/\n/g, '<br>') };
}

// ── Suggestion chips ──────────────────────────────────────────────────────────

const TABLE_SUGGESTIONS = [
  'Summarize this table',
  'What columns are available?',
  'Show top 5 rows by stars',
];

const CV_SUGGESTIONS = [
  'Highlight Java-related skills',
  'Filter AI/ML skills',
  'Sort skills by proficiency ↓',
  'Show recent experience',
  'What projects use TypeScript?',
  'List expert-level skills',
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChatPanel({ onClose, systemPrompt, initialMode = 'table' }: ChatPanelProps) {
  const [mode, setMode] = useState<ChatMode>(initialMode);

  const apiUrl = mode === 'cv' ? '/api/cv-chat' : '/api/chat';

  const transport = useMemo(
    () => new TextStreamChatTransport({
      api: apiUrl,
      body: mode === 'table' ? { systemPrompt } : {},
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apiUrl],
  );

  const { messages, sendMessage, status, error, setMessages } = useChat({ transport });

  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const isLoading = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [mode]);

  function switchMode(next: ChatMode) {
    if (next === mode) return;
    setMode(next);
    setMessages([]);
    setInput('');
  }

  function submit(text?: string) {
    const msgText = (text ?? input).trim();
    if (!msgText || isLoading) return;
    setInput('');
    sendMessage({ role: 'user', parts: [{ type: 'text', text: msgText }] });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    if (e.key === 'Escape') onClose();
  }

  const suggestions = mode === 'cv' ? CV_SUGGESTIONS : TABLE_SUGGESTIONS;
  const placeholder = mode === 'cv'
    ? 'Ask about skills, experience, projects… (Enter to send)'
    : 'Message… (Enter to send, Shift+Enter for newline)';

  return (
    <div className="chat-panel">
      {/* ── Header with mode tabs ── */}
      <div className="chat-panel-header">
        <div className="chat-mode-tabs">
          <button
            type="button"
            className={`chat-mode-tab${mode === 'table' ? ' chat-mode-tab--active' : ''}`}
            onClick={() => switchMode('table')}
          >
            ⊞ Table
          </button>
          <button
            type="button"
            className={`chat-mode-tab${mode === 'cv' ? ' chat-mode-tab--active' : ''}`}
            onClick={() => switchMode('cv')}
          >
            📄 CV
          </button>
        </div>
        <button type="button" className="ai-fill-close-btn" onClick={onClose} aria-label="Close chat">✕</button>
      </div>

      {/* ── Messages ── */}
      <div className="chat-panel-messages">
        {messages.length === 0 && (
          <div className="chat-panel-empty">
            <p style={{ marginBottom: 10, marginTop: 0 }}>
              {mode === 'cv' ? 'Ask anything about Karol\'s CV…' : 'Ask me anything about this table…'}
            </p>
            <div className="chat-suggestions">
              {suggestions.map(s => (
                <button
                  key={s}
                  type="button"
                  className="chat-suggestion-chip"
                  onClick={() => submit(s)}
                  disabled={isLoading}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m: UIMessage) => {
          const textContent = m.parts.filter(isTextUIPart).map(p => p.text).join('');
          if (!textContent && m.role !== 'user') return null;
          return (
            <div key={m.id} className={`chat-msg chat-msg--${m.role}`}>
              <span className="chat-msg-role">{m.role === 'user' ? 'You' : 'AI'}</span>
              {m.role === 'assistant'
                ? <div
                    className={`chat-msg-content${mode === 'cv' ? ' chat-msg-content--cv' : ''}`}
                    dangerouslySetInnerHTML={renderMarkdown(textContent)}
                  />
                : <div className="chat-msg-content">{textContent}</div>
              }
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
        {error && <div className="chat-panel-error">{error.message}</div>}
        <div ref={bottomRef} />
      </div>

      {/* ── Input ── */}
      <div className="chat-panel-form">
        <textarea
          ref={inputRef}
          className="chat-panel-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={2}
          disabled={isLoading}
        />
        <button
          type="button"
          className="chat-panel-send"
          disabled={isLoading || !input.trim()}
          onClick={() => submit()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
