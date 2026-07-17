'use client';

import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';

interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'system';
  timestamp: string;
}

interface ChatWindowProps {
  messages: ChatMessage[];
  loading?: boolean;
}

export default function ChatWindow({ messages, loading }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1" role="log" aria-label="المحادثة">
      {messages.length === 0 && !loading && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm">مرحباً بك في سونيك</p>
          <p className="text-xs mt-1">كيف يمكنني مساعدتك اليوم؟</p>
        </div>
      )}

      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          text={msg.text}
          sender={msg.sender}
          time={new Date(msg.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
        />
      ))}

      {loading && (
        <div className="flex justify-end mb-3">
          <div className="bg-white border border-[#E8E1D9] rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
