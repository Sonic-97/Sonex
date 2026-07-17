'use client';

interface MessageBubbleProps {
  text: string;
  sender: 'user' | 'system';
  time?: string;
}

export default function MessageBubble({ text, sender, time }: MessageBubbleProps) {
  const isUser = sender === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-start' : 'justify-end'} mb-3`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-[#8c6239] text-white rounded-br-md'
            : 'bg-white border border-[#E8E1D9] text-gray-800 rounded-bl-md shadow-sm'
        }`}
      >
        <div>{text}</div>
        {time && (
          <div className={`text-xs mt-1 ${isUser ? 'text-white/60' : 'text-gray-400'}`}>
            {time}
          </div>
        )}
      </div>
    </div>
  );
}
