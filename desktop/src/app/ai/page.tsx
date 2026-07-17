'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { api, isApiError } from '@/lib/api';
import type {
  BusinessInsight,
  AnomalyResult,
  OfflineAiStatus,
} from '@/types';
import {
  Brain,
  MessageSquare,
  Lightbulb,
  AlertTriangle,
  TrendingUp,
  Search,
  Wifi,
  WifiOff,
  Send,
  Bot,
  Sparkles,
  BarChart3,
} from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  confidence?: number;
  sources?: string[];
}

export default function AiPage() {
  const [health, setHealth] = useState<{ online: boolean; offlineEnabled: boolean } | null>(null);
  const [insights, setInsights] = useState<BusinessInsight[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyResult[]>([]);
  const [offlineStatus, setOfflineStatus] = useState<OfflineAiStatus | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: 'Hello! I\'m your AI assistant. Ask me anything about your cafe operations, sales, inventory, or staff performance.' },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ name: string; price: number; score: number; reason: string }> | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [nlpText, setNlpText] = useState('');
  const [nlpResult, setNlpResult] = useState<string | null>(null);
  const [nlpLoading, setNlpLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'insights' | 'search' | 'nlp'>('chat');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [h, i, a, o] = await Promise.all([
        api.ai.health().catch(() => null),
        api.ai.insights().catch(() => [] as BusinessInsight[]),
        api.ai.anomalies().catch(() => [] as AnomalyResult[]),
        api.ai.offline.status().catch(() => null),
      ]);
      if (h) setHealth(h);
      if (i) setInsights(i);
      if (a) setAnomalies(a);
      if (o) setOfflineStatus(o);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleChat = async () => {
    const msg = chatInput.trim();
    if (!msg) return;
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setChatLoading(true);
    try {
      const resp = await api.ai.copilot.ask(msg);
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: resp.answer,
          confidence: resp.confidence,
          sources: resp.sources,
        },
      ]);
    } catch (e) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: isApiError(e) ? e.message : 'Failed to get response' },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearchLoading(true);
    try {
      const results = await api.ai.search(q);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleNlp = async () => {
    const text = nlpText.trim();
    if (!text) return;
    setNlpLoading(true);
    try {
      const result = await api.ai.nlp.parse(text);
      setNlpResult(
        `Intent: ${result.intent} (${(result.confidence * 100).toFixed(0)}%)\n` +
        result.entities.map((e) => `  ${e.entityType}: ${e.value} (${(e.confidence * 100).toFixed(0)}%)`).join('\n')
      );
    } catch {
      setNlpResult('Failed to parse');
    } finally {
      setNlpLoading(false);
    }
  };

  const severityColor = (s: string) => {
    switch (s) {
      case 'high': return 'text-red-500';
      case 'medium': return 'text-amber-500';
      default: return 'text-emerald-500';
    }
  };

  const trendIcon = (t: string) => {
    if (t === 'up') return <TrendingUp className="h-4 w-4 text-emerald-500" />;
    if (t === 'down') return <TrendingUp className="h-4 w-4 rotate-180 text-red-500" />;
    return null;
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">AI Assistant</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Copilot, insights, anomaly detection, and NLP parsing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {health && (
            <Badge variant={health.online ? 'success' : 'warning'}>
              {health.online ? <Wifi className="mr-1 h-3 w-3 inline" /> : <WifiOff className="mr-1 h-3 w-3 inline" />}
              {health.online ? 'Online' : 'Offline'}
            </Badge>
          )}
          {offlineStatus?.enabled && (
            <Badge variant="default">
              <Brain className="mr-1 h-3 w-3 inline" />
              Offline Lite
            </Badge>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-surface-secondary p-1">
        {[
          { id: 'chat', label: 'Copilot', icon: MessageSquare },
          { id: 'insights', label: 'Insights', icon: Lightbulb },
          { id: 'search', label: 'Search', icon: Search },
          { id: 'nlp', label: 'NLP', icon: Bot },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-surface-primary text-text-primary shadow-sm'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Chat Tab */}
      {activeTab === 'chat' && (
        <Card>
          <CardTitle>
            <Bot className="mr-2 inline h-5 w-5 text-copper-500" />
            Copilot Chat
          </CardTitle>
          <CardDescription className="mt-1">
            Ask about sales, inventory, staff, or operations.
          </CardDescription>
          <div className="mt-4 flex h-[400px] flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto pr-2">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                      msg.role === 'user'
                        ? 'bg-copper-500 text-white'
                        : 'bg-surface-secondary text-text-primary'
                    }`}
                  >
                    <p>{msg.content}</p>
                    {msg.role === 'assistant' && msg.confidence !== undefined && (
                      <p className="mt-1 text-xs text-text-tertiary">
                        Confidence: {(msg.confidence * 100).toFixed(0)}%
                        {msg.sources && msg.sources.length > 0 && ` | Sources: ${msg.sources.join(', ')}`}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] rounded-lg bg-surface-secondary px-4 py-2 text-sm text-text-tertiary">
                    <Sparkles className="mr-1 inline h-4 w-4 animate-pulse" />
                    Thinking...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="mt-4 flex gap-2">
              <Input
                placeholder="Ask anything..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !chatLoading) handleChat(); }}
                className="flex-1"
              />
              <Button onClick={handleChat} loading={chatLoading}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Insights Tab */}
      {activeTab === 'insights' && (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-text-tertiary">Health Score</p>
                  <p className="mt-1 text-2xl font-semibold text-text-primary">
                    {offlineStatus ? `${(offlineStatus.accuracy * 100).toFixed(0)}%` : '-'}
                  </p>
                </div>
                <Brain className="h-6 w-6 text-copper-500" />
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-text-tertiary">Insights</p>
                  <p className="mt-1 text-2xl font-semibold text-text-primary">{insights.length}</p>
                </div>
                <Lightbulb className="h-6 w-6 text-amber-500" />
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-text-tertiary">Anomalies</p>
                  <p className="mt-1 text-2xl font-semibold text-text-primary">{anomalies.length}</p>
                </div>
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-text-tertiary">Predictions</p>
                  <p className="mt-1 text-2xl font-semibold text-text-primary">{offlineStatus?.totalPredictions ?? 0}</p>
                </div>
                <BarChart3 className="h-6 w-6 text-emerald-500" />
              </div>
            </Card>
          </div>

          {/* Insights */}
          {insights.length > 0 && (
            <Card>
              <CardTitle>
                <Lightbulb className="mr-2 inline h-5 w-5 text-amber-500" />
                Business Insights
              </CardTitle>
              <CardDescription className="mt-1">
                Key observations and recommendations.
              </CardDescription>
              <div className="mt-4 space-y-3">
                {insights.map((insight, i) => (
                  <div key={i} className="rounded-lg border border-border p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="default" className="text-xs">{insight.category}</Badge>
                        <span className="font-medium text-text-primary">{insight.title}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {trendIcon(insight.trend)}
                        <span className={`text-sm font-medium ${severityColor(insight.severity)}`}>
                          {insight.severity}
                        </span>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-text-secondary">{insight.description}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-text-tertiary">
                        Metric: {typeof insight.metric === 'number' ? insight.metric.toFixed(1) : insight.metric}
                      </span>
                      {insight.recommendation && (
                        <span className="text-xs font-medium text-copper-600">
                          {insight.recommendation}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Anomalies */}
          {anomalies.length > 0 && (
            <Card>
              <CardTitle>
                <AlertTriangle className="mr-2 inline h-5 w-5 text-red-500" />
                Detected Anomalies
              </CardTitle>
              <CardDescription className="mt-1">
                Unusual patterns that may require attention.
              </CardDescription>
              <div className="mt-4 space-y-3">
                {anomalies.map((anomaly, i) => (
                  <div key={i} className="rounded-lg border border-red-200 bg-red-50 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="danger" className="text-xs">{anomaly.anomalyType}</Badge>
                        <span className="font-medium text-text-primary">{anomaly.entityName}</span>
                      </div>
                      <span className={`text-sm font-medium ${severityColor(anomaly.severity)}`}>
                        {anomaly.severity}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-text-secondary">{anomaly.description}</p>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-text-tertiary">
                      <span>Current: {anomaly.currentValue.toFixed(1)}</span>
                      <span>Expected: {anomaly.expectedValue.toFixed(1)}</span>
                      <span>Deviation: {anomaly.deviation.toFixed(1)}%</span>
                    </div>
                    {anomaly.recommendation && (
                      <p className="mt-2 text-xs font-medium text-red-600">
                        {anomaly.recommendation}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Offline AI Status */}
          {offlineStatus && (
            <Card>
              <CardTitle>
                <Brain className="mr-2 inline h-5 w-5 text-copper-500" />
                Offline AI Engine
              </CardTitle>
              <CardDescription className="mt-1">
                Local AI lite mode for when cloud is unavailable.
              </CardDescription>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">Status</span>
                  <Badge variant={offlineStatus.enabled ? 'success' : 'warning'}>
                    {offlineStatus.enabled ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">Model Version</span>
                  <span className="font-medium text-text-primary">{offlineStatus.modelVersion}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">Last Trained</span>
                  <span className="font-medium text-text-primary">
                    {offlineStatus.lastTrained ? new Date(offlineStatus.lastTrained).toLocaleString() : 'Never'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">Accuracy</span>
                  <span className="font-medium text-text-primary">{(offlineStatus.accuracy * 100).toFixed(1)}%</span>
                </div>
              </div>
            </Card>
          )}

          {insights.length === 0 && anomalies.length === 0 && (
            <Card className="p-8 text-center">
              <Brain className="mx-auto h-12 w-12 text-text-tertiary" />
              <p className="mt-4 text-text-secondary">No insights or anomalies yet. Data will appear as your cafe operates.</p>
            </Card>
          )}
        </>
      )}

      {/* Search Tab */}
      {activeTab === 'search' && (
        <Card>
          <CardTitle>
            <Search className="mr-2 inline h-5 w-5 text-copper-500" />
            AI Product Search
          </CardTitle>
          <CardDescription className="mt-1">
            Semantic search across your product catalog.
          </CardDescription>
          <div className="mt-4 flex gap-2">
            <Input
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
              className="flex-1"
            />
            <Button onClick={handleSearch} loading={searchLoading}>
              <Search className="h-4 w-4" />
            </Button>
          </div>
          {searchResults !== null && (
            <div className="mt-4 space-y-2">
              {searchResults.length === 0 ? (
                <p className="text-sm text-text-tertiary">No results found.</p>
              ) : (
                searchResults.map((r, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <p className="font-medium text-text-primary">{r.name}</p>
                      <p className="text-xs text-text-tertiary">{r.reason}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-medium text-copper-600">
                        ${r.price.toFixed(2)}
                      </span>
                      <span className="text-xs text-text-tertiary">
                        {(r.score * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </Card>
      )}

      {/* NLP Tab */}
      {activeTab === 'nlp' && (
        <Card>
          <CardTitle>
            <Bot className="mr-2 inline h-5 w-5 text-copper-500" />
            Natural Language Parser
          </CardTitle>
          <CardDescription className="mt-1">
            Analyze natural language input to detect intents and extract entities.
          </CardDescription>
          <div className="mt-4 flex gap-2">
            <Input
              placeholder="e.g. Show me top selling products this week"
              value={nlpText}
              onChange={(e) => setNlpText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleNlp(); }}
              className="flex-1"
            />
            <Button onClick={handleNlp} loading={nlpLoading}>
              <Brain className="h-4 w-4" />
            </Button>
          </div>
          {nlpResult && (
            <div className="mt-4 rounded-lg border border-border bg-surface-secondary p-4">
              <pre className="whitespace-pre-wrap text-sm text-text-primary font-mono">
                {nlpResult}
              </pre>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
