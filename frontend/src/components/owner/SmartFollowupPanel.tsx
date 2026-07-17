'use client';

import { useState, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { useAppStore } from '@/store';
import { Suggestion } from '@/types';
import {
  dismissSuggestion,
  markSuggestionSent,
  updateSuggestionStatus,
  generateSuggestions,
  submitSuggestionFeedback,
  fetchSuggestions as apiFetchSuggestions,
  fetchSuggestionStats as apiFetchSuggestionStats,
} from '@/lib/api';
import {
  MessageSquare,
  Clock,
  Check,
  X,
  Copy,
  Edit3,
  Send,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
} from 'lucide-react';

function SuggestionCard({
  suggestion,
  onRefresh,
}: {
  suggestion: Suggestion;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editedMessage, setEditedMessage] = useState(suggestion.suggestedMessage);
  const [copied, setCopied] = useState(false);
  const [action, setAction] = useState<'idle' | 'sending' | 'dismissing'>('idle');

  const customerName = suggestion.customer?.name || suggestion.customer?.phone || 'Unknown';
  const hour = suggestion.predictedHour;
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(editedMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = async () => {
    setAction('sending');
    try {
      if (editedMessage !== suggestion.suggestedMessage) {
        await updateSuggestionStatus(suggestion.id, 'sent', editedMessage);
      } else {
        await markSuggestionSent(suggestion.id);
      }
      onRefresh();
    } finally {
      setAction('idle');
    }
  };

  const handleDismiss = async () => {
    setAction('dismissing');
    try {
      await dismissSuggestion(suggestion.id);
      onRefresh();
    } finally {
      setAction('idle');
    }
  };

  const handleFeedback = async (wasCorrect: boolean) => {
    try {
      await submitSuggestionFeedback(suggestion.id, wasCorrect, wasCorrect ? 4 : 2);
      onRefresh();
    } catch {}
  };

  const channelBadge = (ch: string) => {
    if (ch === 'delivery') return 'bg-blue-100 text-blue-700';
    if (ch === 'in_cafe') return 'bg-amber-100 text-amber-700';
    return 'bg-gray-100 text-gray-600';
  };

  const confidencePct = Math.round(suggestion.confidence * 100);

  return (
    <div className="rounded-lg border border-gray-200 bg-white transition-all hover:border-violet-200 hover:shadow-sm">
      <div className="flex items-start justify-between p-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-800">{customerName}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${channelBadge(suggestion.channelPrediction)}`}>
              {suggestion.channelPrediction}
            </span>
            <span className="ml-auto text-[10px] text-gray-400">
              {new Date(suggestion.createdAt).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })}
            </span>
          </div>
          <p className="text-xs text-gray-500">{suggestion.reasoning}</p>
        </div>
        <div className="ml-3 flex flex-col items-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-violet-700">
            {confidencePct}%
          </div>
          <span className="mt-0.5 text-[9px] text-gray-400">confidence</span>
        </div>
      </div>

      {expanded && (
        <div className="border-t px-3 pb-3 pt-2">
          {editing ? (
            <textarea
              value={editedMessage}
              onChange={(e) => setEditedMessage(e.target.value)}
              className="mb-2 min-h-[80px] w-full rounded-lg border p-2 text-sm"
              dir="rtl"
            />
          ) : (
            <div className="mb-2 rounded-lg bg-violet-50 p-2 text-right text-sm leading-relaxed text-gray-700" dir="rtl">
              {editedMessage}
            </div>
          )}

          <div className="mb-2 flex flex-wrap gap-1">
            {suggestion.predictedItems.map((item, i) => (
              <span key={i} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                {item.name} {Math.round(item.probability * 100)}%
              </span>
            ))}
          </div>

          <div className="mb-2 flex items-center gap-2 text-[11px] text-gray-400">
            <Clock className="h-3 w-3" />
            <span>Best time: {displayHour}:00 {period}</span>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={() => setEditing(!editing)}
              className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50"
            >
              <Edit3 className="h-3 w-3" />
              {editing ? 'Preview' : 'Edit'}
            </button>
            <button
              onClick={handleSend}
              disabled={action === 'sending'}
              className="flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              <Send className="h-3 w-3" />
              {action === 'sending' ? 'Saving...' : 'Mark Sent'}
            </button>
            <button
              onClick={handleDismiss}
              disabled={action === 'dismissing'}
              className="flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <X className="h-3 w-3" />
              Dismiss
            </button>
          </div>

          {/* Feedback */}
          {suggestion.status === 'sent' && !suggestion.feedback && (
            <div className="mt-2 flex items-center gap-2 border-t pt-2 text-[11px] text-gray-500">
              <span>Was this prediction accurate?</span>
              <button onClick={() => handleFeedback(true)} className="flex items-center gap-0.5 text-emerald-600 hover:text-emerald-700">
                <ThumbsUp className="h-3 w-3" /> Yes
              </button>
              <button onClick={() => handleFeedback(false)} className="flex items-center gap-0.5 text-red-500 hover:text-red-600">
                <ThumbsDown className="h-3 w-3" /> No
              </button>
            </div>
          )}

          {suggestion.feedback && (
            <div className="mt-2 flex items-center gap-2 border-t pt-2 text-[11px]">
              {suggestion.feedback.wasCorrect ? (
                <span className="flex items-center gap-1 text-emerald-600"><ThumbsUp className="h-3 w-3" /> Marked correct</span>
              ) : (
                <span className="flex items-center gap-1 text-red-500"><ThumbsDown className="h-3 w-3" /> Marked incorrect</span>
              )}
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-center border-t px-3 py-1.5 text-[10px] text-gray-400 hover:bg-gray-50"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
    </div>
  );
}

export function SmartFollowupPanel() {
  const suggestions = useAppStore((s) => s.suggestions);
  const suggestionStats = useAppStore((s) => s.suggestionStats);
  const setSuggestions = useAppStore((s) => s.setSuggestions);
  const setSuggestionStats = useAppStore((s) => s.setSuggestionStats);
  const [generating, setGenerating] = useState(false);
  const [filter, setFilter] = useState<'active' | 'sent' | 'all'>('active');

  const refreshSuggestions = useCallback(async () => {
    try {
      const result = await apiFetchSuggestions(filter === 'all' ? undefined : filter, 50);
      setSuggestions(result.suggestions ?? (Array.isArray(result) ? result : []));
      const stats = await apiFetchSuggestionStats();
      setSuggestionStats(stats);
    } catch {}
  }, [filter, setSuggestions, setSuggestionStats]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await generateSuggestions();
      await refreshSuggestions();
    } finally {
      setGenerating(false);
    }
  };

  const activeCount = suggestions.filter((s) => s.status === 'active').length;
  const sentCount = suggestions.filter((s) => s.status === 'sent').length;
  const filtered = filter === 'all' ? suggestions : suggestions.filter((s) => s.status === filter);

  return (
    <div className="space-y-4">
      <Card
        title="Smart Follow-up"
        icon={<MessageSquare className="h-5 w-5 text-violet-500" />}
        subtitle={`${activeCount} active · ${sentCount} sent this week`}
      >
        {/* Stats bar */}
        {suggestionStats && (
          <div className="mb-3 grid grid-cols-4 gap-2">
            <div className="rounded-lg bg-violet-50 px-2 py-1.5 text-center">
              <p className="text-lg font-bold text-violet-700">{suggestionStats.totalSuggestions}</p>
              <p className="text-[9px] text-gray-500">Suggestions</p>
            </div>
            <div className="rounded-lg bg-emerald-50 px-2 py-1.5 text-center">
              <p className="text-lg font-bold text-emerald-700">{suggestionStats.sentCount}</p>
              <p className="text-[9px] text-gray-500">Sent</p>
            </div>
            <div className="rounded-lg bg-amber-50 px-2 py-1.5 text-center">
              <p className="text-lg font-bold text-amber-700">{Math.round(suggestionStats.feedbackAccuracy * 100)}%</p>
              <p className="text-[9px] text-gray-500">Accuracy</p>
            </div>
            <div className="rounded-lg bg-blue-50 px-2 py-1.5 text-center">
              <p className="text-lg font-bold text-blue-700">{suggestionStats.feedbackCount}</p>
              <p className="text-[9px] text-gray-500">Feedback</p>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="mb-3 flex items-center gap-2">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {generating ? 'Analyzing...' : 'Generate Suggestions'}
          </button>
          <div className="flex rounded-lg border">
            {(['active', 'sent', 'all'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-[11px] font-medium ${
                  filter === f ? 'bg-violet-100 text-violet-700' : 'text-gray-500 hover:bg-gray-50'
                } ${f === 'active' ? 'rounded-l-lg' : ''} ${f === 'all' ? 'rounded-r-lg' : ''}`}
              >
                {f === 'active' ? 'Active' : f === 'sent' ? 'Sent' : 'All'}
              </button>
            ))}
          </div>
          <button
            onClick={refreshSuggestions}
            className="ml-auto rounded-lg border px-2.5 py-1.5 text-gray-500 hover:bg-gray-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Suggestion list */}
        {filtered.length === 0 ? (
          <div className="py-8 text-center">
            <MessageSquare className="mx-auto mb-2 h-8 w-8 text-gray-200" />
            <p className="text-sm text-gray-400">No suggestions yet</p>
            <p className="text-xs text-gray-300">Click &quot;Generate Suggestions&quot; to analyze customer patterns</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((s) => (
              <SuggestionCard key={s.id} suggestion={s} onRefresh={refreshSuggestions} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
