import React, { useState } from 'react';
import { Smile, Paperclip, Send } from 'lucide-react';

const MessageComposer = ({ onSend, disabled }) => {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const text = value.trim();
    if (!text || sending || disabled) return;

    try {
      setSending(true);
      await onSend?.(text);
      setValue('');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(event);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-3 border-t border-wa-border bg-wa-panel-header px-4 py-3 transition-colors"
    >
      {/* Botões de Ação (Emoji, Anexo) */}
      <button
        type="button"
        className="text-wa-icon transition-colors hover:text-wa-text-primary"
        disabled
        title="Emoji (em breve)"
      >
        <Smile size={24} />
      </button>
      <button
        type="button"
        className="text-wa-icon transition-colors hover:text-wa-text-primary"
        disabled
        title="Anexar (em breve)"
      >
        <Paperclip size={24} />
      </button>

      {/* Campo de Texto */}
      <div className="flex-1">
        <textarea
          className="h-10 w-full resize-none rounded-lg bg-wa-bubble-in px-4 py-2 text-sm text-wa-text-primary placeholder-wa-text-secondary outline-none transition-colors"
          placeholder="Digite uma mensagem"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending || disabled}
          rows={1}
        />
      </div>

      {/* Botão de Enviar */}
      <button
        type="submit"
        disabled={sending || disabled || !value.trim()}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-wa-primary text-white transition hover:bg-wa-primary-dark disabled:cursor-not-allowed disabled:bg-wa-border disabled:text-wa-icon"
        title="Enviar"
      >
        {sending ? (
          <svg
            className="h-5 w-5 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        ) : (
          <Send size={20} />
        )}
      </button>
    </form>
  );
};

export default MessageComposer;
