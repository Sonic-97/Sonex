'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Send } from 'lucide-react';
import customerApi from '@/lib/customer-api';
import ChatWindow from '@/components/customer/ChatWindow';
import ClarificationCard from '@/components/customer/ClarificationCard';
import ConfirmationCard from '@/components/customer/ConfirmationCard';

interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'system';
  timestamp: string;
}

interface OrderItem {
  productName: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
}

interface PendingConfirmation {
  items: OrderItem[];
  subtotal: string;
  deliveryFee: string;
  grandTotal: string;
}

let msgCounter = 0;

export default function CustomerChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [clarification, setClarification] = useState<{ title: string; question: string; options?: string[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const addMessage = useCallback((text: string, sender: 'user' | 'system') => {
    msgCounter++;
    setMessages((prev) => [...prev, { id: `msg-${msgCounter}`, text, sender, timestamp: new Date().toISOString() }]);
  }, []);

  const handleSend = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;

    if (!text) setInput('');
    addMessage(msg, 'user');
    setLoading(true);
    setPendingConfirmation(null);
    setClarification(null);

    try {
      const { data } = await customerApi.post('/customer/message', { message: msg });

      if (data.type === 'clarification') {
        const info = data.data as any;
        setClarification({
          title: 'معلومات إضافية',
          question: info.question || data.message || 'يرجى توضيح طلبك',
          options: info.options || info.missingInformation || [],
        });
        addMessage(data.message || 'ما هي التفاصيل الإضافية؟', 'system');
      } else if (data.type === 'confirmation') {
        const order = data.data as any;
        setPendingConfirmation({
          items: order.items || [],
          subtotal: order.subtotal || '',
          deliveryFee: order.deliveryFee || '',
          grandTotal: order.grandTotal || '',
        });
        addMessage(data.message || 'هل تريد تأكيد الطلب؟', 'system');
      } else if (data.type === 'execution') {
        addMessage(data.message || 'تم إنشاء الطلب بنجاح!', 'system');
        if (data.data && (data.data as any).orderId) {
          addMessage(`رقم الطلب: ${(data.data as any).orderId}`, 'system');
        }
        setPendingConfirmation(null);
      } else if (data.type === 'order_status') {
        addMessage(data.message || 'حالة الطلب', 'system');
      } else if (data.type === 'recommendations') {
        addMessage(data.message || 'هذه بعض الاقتراحات لك', 'system');
      } else {
        addMessage(data.message || 'تم', 'system');
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'حدث خطأ. حاول مرة أخرى.';
      addMessage(errMsg, 'system');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const { data } = await customerApi.post('/customer/confirm', { confirmed: true });
      addMessage(data.message || 'تم تأكيد الطلب!', 'system');
      setPendingConfirmation(null);
    } catch (err: any) {
      addMessage(err.response?.data?.message || 'فشل التأكيد', 'system');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setLoading(true);
    try {
      const { data } = await customerApi.post('/customer/confirm', { confirmed: false });
      addMessage(data.message || 'تم إلغاء الطلب', 'system');
      setPendingConfirmation(null);
    } catch (err: any) {
      addMessage(err.response?.data?.message || 'فشل الإلغاء', 'system');
    } finally {
      setLoading(false);
    }
  };

  const handleClarificationSelect = (option: string) => {
    handleSend(option);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100dvh-56px)]">
      <ChatWindow messages={messages} loading={loading} />

      <div className="px-4 pb-3 space-y-2">
        {clarification && (
          <ClarificationCard
            title={clarification.title}
            question={clarification.question}
            options={clarification.options}
            onSelect={handleClarificationSelect}
          />
        )}

        {pendingConfirmation && (
          <ConfirmationCard
            items={pendingConfirmation.items}
            subtotal={pendingConfirmation.subtotal}
            deliveryFee={pendingConfirmation.deliveryFee}
            grandTotal={pendingConfirmation.grandTotal}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
            loading={loading}
          />
        )}

        <div className="flex items-center gap-2 bg-white rounded-2xl border border-[#E8E1D9] p-2 shadow-sm">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="اكتب رسالتك..."
            disabled={loading || !!pendingConfirmation}
            className="flex-1 px-3 py-2 text-sm bg-transparent focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
            className="p-2.5 rounded-xl bg-[#8c6239] text-white hover:bg-[#6f4d2d] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
