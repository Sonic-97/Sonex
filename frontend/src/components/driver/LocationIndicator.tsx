'use client';

import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';

interface LocationIndicatorProps {
  onLocation: (lat: number, lng: number) => void;
  interval?: number;
}

export default function LocationIndicator({ onLocation, interval = 30000 }: LocationIndicatorProps) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || typeof navigator === 'undefined') return;

    const send = () => {
      if (!navigator.geolocation) return;
      setStatus('sending');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          onLocation(pos.coords.latitude, pos.coords.longitude);
          setStatus('sent');
        },
        () => setStatus('error'),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );
    };

    send();
    const iv = setInterval(send, interval);
    return () => clearInterval(iv);
  }, [mounted, interval, onLocation]);

  const statusColor = status === 'sent' ? 'text-emerald-500' : status === 'error' ? 'text-red-500' : status === 'sending' ? 'text-amber-500' : 'text-gray-400';

  return (
    <div className={`inline-flex items-center gap-1.5 text-xs ${statusColor}`}>
      <MapPin size={14} className={status === 'sending' ? 'animate-pulse' : ''} />
      <span>{status === 'sent' ? 'تم التحديث' : status === 'error' ? 'خطأ في الموقع' : status === 'sending' ? 'جاري التحديث...' : 'الموقع'}</span>
    </div>
  );
}
