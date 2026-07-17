export type FailureCategory =
  | 'INTENT_ERROR'
  | 'ENTITY_EXTRACTION_ERROR'
  | 'CONVERSATION_STATE_ERROR'
  | 'CONTEXT_LOSS'
  | 'PRODUCT_MAPPING_ERROR'
  | 'PRICE_ERROR'
  | 'AVAILABILITY_ERROR'
  | 'CONFIRMATION_ERROR'
  | 'CANCELLATION_ERROR'
  | 'DUPLICATE_ORDER_ERROR'
  | 'PAYMENT_ERROR'
  | 'DELIVERY_LOCATION_ERROR'
  | 'PERSONALIZATION_ERROR'
  | 'RECOMMENDATION_ERROR'
  | 'UPSELLING_ERROR'
  | 'LOYALTY_ERROR'
  | 'COMPLAINT_HANDLING_ERROR'
  | 'HUMAN_HANDOFF_ERROR'
  | 'RESPONSE_TONE_ERROR'
  | 'RESPONSE_LENGTH_ERROR'
  | 'LANGUAGE_ERROR'
  | 'EGYPTIAN_ARABIC_ERROR'
  | 'VOICE_TO_TEXT_ERROR'
  | 'TOOL_SELECTION_ERROR'
  | 'TOOL_EXECUTION_ERROR'
  | 'OWNER_ANALYSIS_ERROR'
  | 'FORECAST_ERROR'
  | 'APPROVAL_FLOW_ERROR'
  | 'SECURITY_REJECTION'
  | 'PERFORMANCE_ERROR'
  | 'UNKNOWN_ERROR';

export type SuccessCategory =
  | 'ORDER_COMPLETED_WITHOUT_CLARIFICATION'
  | 'ORDER_COMPLETED_AFTER_ONE_CLARIFICATION'
  | 'USUAL_ORDER_ACCEPTED'
  | 'ONE_TAP_ORDER_COMPLETED'
  | 'RECOMMENDATION_ACCEPTED'
  | 'UPSELL_ACCEPTED'
  | 'UPSELL_REJECTED_WITHOUT_FRICTION'
  | 'COMPLAINT_RESOLVED'
  | 'HUMAN_HANDOFF_SUCCESSFUL'
  | 'LOYALTY_REWARD_REDEEMED'
  | 'CUSTOMER_RETURNED'
  | 'OWNER_RECOMMENDATION_ACCEPTED'
  | 'FORECAST_WITHIN_EXPECTED_RANGE'
  | 'APPROVED_ACTION_COMPLETED';

export type RootCauseCategory =
  | 'PROMPT_GAP'
  | 'RULE_GAP'
  | 'DATA_GAP'
  | 'PRODUCT_METADATA_GAP'
  | 'STATE_MACHINE_BUG'
  | 'TOOL_BUG'
  | 'SESSION_BUG'
  | 'MODEL_LIMITATION'
  | 'UX_FRICTION'
  | 'LATENCY'
  | 'TENANT_SCOPE_BUG'
  | 'PERMISSION_BUG'
  | 'HUMAN_PROCESS_GAP';

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type EventSeverity = Severity;

export type PromptStatus = 'DRAFT' | 'UNDER_REVIEW' | 'APPROVED' | 'CANARY' | 'PRODUCTION' | 'DEPRECATED' | 'ROLLED_BACK';

export type DatasetGroup =
  | 'CUSTOMER_ORDERING'
  | 'EGYPTIAN_ARABIC'
  | 'COFFEE_CUSTOMIZATION'
  | 'CONTEXTUAL_YES_NO'
  | 'MULTI_ITEM_ORDERS'
  | 'PERSONALIZATION'
  | 'UPSELLING'
  | 'TELEGRAM_CALLBACKS'
  | 'PAYMENT'
  | 'DELIVERY'
  | 'LOYALTY'
  | 'COMPLAINTS'
  | 'OWNER_COPILOT'
  | 'FORECASTING'
  | 'OWNER_APPROVAL_ACTIONS'
  | 'SECURITY'
  | 'PERFORMANCE';

export type ChangeType = 'PROMPT' | 'RULE' | 'MODEL' | 'PARSER' | 'RECOMMENDATION_POLICY' | 'LOYALTY_POLICY' | 'TELEGRAM_FLOW' | 'OWNER_TOOL';

export type PrivacyStatus = 'RAW' | 'REDACTED' | 'ANONYMIZED';

export interface LearningEventInput {
  cafeId: string;
  customerId?: string;
  sessionId?: string;
  channel?: string;
  eventType: string;
  severity?: EventSeverity;
  primaryCategory: FailureCategory | SuccessCategory;
  secondaryCategories?: string[];
  messageReference?: string;
  stateBefore?: Record<string, any>;
  expectedBehavior?: Record<string, any>;
  actualBehavior?: Record<string, any>;
  customerCorrection?: string;
  correctedIntent?: string;
  correctedEntities?: Record<string, any>;
  humanResolution?: string;
  humanChanges?: Record<string, any>;
  orderCompleted?: boolean;
  promptVersion?: string;
  modelVersion?: string;
  toolVersions?: Record<string, string>;
  rootCause?: RootCauseCategory;
  shouldBecomeCase?: boolean;
}

export interface EvaluationCaseInput {
  caseId: string;
  cafeId: string;
  source: string;
  dataset: DatasetGroup | string;
  version?: string;
  input: string;
  stateBefore?: Record<string, any>;
  expectedIntent?: string;
  expectedEntities?: Record<string, any>;
  expectedAction?: string;
  expectedState?: string;
  forbiddenActions?: string[];
  forbiddenStates?: string[];
  privacyStatus?: PrivacyStatus;
}

export interface PromptVersionInput {
  promptId: string;
  version: string;
  purpose: string;
  owner: string;
  content: string;
  previousContent?: string;
  changeReason?: string;
  linkedCases?: string[];
  expectedImpact?: string;
  risk?: string;
  rollbackVersion?: string;
  authorId?: string;
}

export interface RuleVersionInput {
  ruleId: string;
  version: string;
  name: string;
  ruleType: string;
  oldBehavior?: Record<string, any>;
  newBehavior: Record<string, any>;
  reason?: string;
  tests?: string[];
  impact?: string;
  rollbackPlan?: string;
  authorId?: string;
}

export interface ModelVersionInput {
  provider: string;
  model: string;
  modelVersion: string;
  temperature?: number;
  responseSchema?: string;
  toolSchema?: Record<string, any>;
  timeout?: number;
  retryPolicy?: Record<string, any>;
  tokenLimits?: Record<string, any>;
  purpose?: string;
  status?: string;
}

export interface FeatureFlagInput {
  flagKey: string;
  cafeId?: string;
  environment?: string;
  enabled?: boolean;
  rolloutPercent?: number;
  metadata?: Record<string, any>;
  createdBy?: string;
}

export interface CanaryReleaseInput {
  releaseId: string;
  changeType: ChangeType | string;
  changeId: string;
  rolloutPercent?: number;
  controlGroup?: Record<string, any>;
  canaryGroup?: Record<string, any>;
  triggeredBy?: string;
}

export interface ChangeAuditInput {
  changeId: string;
  authorId?: string;
  reviewerId?: string;
  changeType: ChangeType | string;
  changeTarget: string;
  reason?: string;
  linkedFailureEvents?: string[];
  linkedCases?: string[];
  baselineResult?: Record<string, any>;
  candidateResult?: Record<string, any>;
  approval?: string;
  rolloutPercent?: number;
  productionResult?: Record<string, any>;
}

export interface ReviewQueueInput {
  cafeId: string;
  title: string;
  description?: string;
  category?: FailureCategory | string;
  severity?: EventSeverity;
  sourceEventId?: string;
  safeExcerpt?: string;
  aiDecision?: Record<string, any>;
  actualOutcome?: Record<string, any>;
  customerCorrection?: string;
  promptVersion?: string;
  modelVersion?: string;
  privacyStatus?: PrivacyStatus;
}

export interface ExperienceScoreInput {
  cafeId: string;
  channel?: string;
  timeToCompleteMs?: number;
  messagesPerOrder?: number;
  clarifications?: number;
  corrections?: number;
  abandoned?: boolean;
  complaint?: boolean;
  successfulCompletion?: boolean;
  repeatUsage?: boolean;
  oneTapUsed?: boolean;
  customerFeedback?: number;
}

export interface DriftDetectionInput {
  cafeId: string;
  metricName: string;
  metricValue: number;
  baselineValue?: number;
  source?: string;
}

export interface CorpusEntryInput {
  phrase: string;
  context?: string;
  interpretation: string;
  aiInterpretation?: string;
  humanCorrection?: string;
  category?: string;
  variantOf?: string;
}

export interface OfflineEvaluationResult {
  dataset: DatasetGroup | string;
  version: string;
  metrics: Record<string, number>;
  casesPassed: number;
  casesTotal: number;
  accuracyPercent: number;
  timestamp: string;
}

export interface ResponseQualityEvaluation {
  naturalArabic: number;
  clarity: number;
  brevity: number;
  warmth: number;
  professionalism: number;
  actionability: number;
  noRepetition: number;
  noRoboticLanguage: number;
  noCreepiness: number;
  noManipulation: number;
  correctNameUsage: number;
  correctQuestionCount: number;
}

export interface CustomerExperienceScoreResult {
  overall: number;
  components: {
    efficiency: number;
    accuracy: number;
    satisfaction: number;
    loyalty: number;
  };
  trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
}

export interface MetricSnapshot {
  orderCompletionRate: number;
  avgMessagesPerOrder: number;
  avgTimeToCompleteMs: number;
  clarificationRate: number;
  correctionRate: number;
  abandonmentRate: number;
  humanHandoffRate: number;
  complaintRate: number;
  complaintResolutionTimeAvgMs: number;
  loyaltyEngagement: number;
  repeatCustomerRate: number;
  oneTapOrderRate: number;
  recommendationAcceptanceRate: number;
  aiLatencyMs: number;
  topFailureCategories: { category: string; count: number }[];
  topMisunderstoodPhrases: { phrase: string; count: number }[];
  changesByPromptVersion: { version: string; count: number }[];
}

export interface QualityCheckResult {
  checkName: string;
  passed: boolean;
  details?: string;
}

export interface ImprovementProposal {
  problem: string;
  evidence: string;
  affectedUsers: string;
  rootCause: RootCauseCategory;
  proposedChange: string;
  expectedBenefit: string;
  risks: string[];
  evaluationCases: string[];
  baselineResult: Record<string, number>;
  candidateResult: Record<string, number>;
  rollbackPlan: string;
  approval: string;
}
