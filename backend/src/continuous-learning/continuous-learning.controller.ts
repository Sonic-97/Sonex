import { Controller, Get, Post, Patch, Param, Body, Query } from '@nestjs/common';
import { ContinuousLearningService } from './continuous-learning.service';

@Controller('continuous-learning')
export class ContinuousLearningController {
  constructor(private readonly service: ContinuousLearningService) {}

  @Post('events')
  createEvent(@Body() body: any) {
    return this.service.createLearningEvent(body);
  }

  @Get('events')
  getEvents(@Query('cafeId') cafeId: string, @Query('eventType') eventType?: string, @Query('severity') severity?: string, @Query('category') category?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.service.getLearningEvents(cafeId, { eventType, severity, category, limit: limit ? parseInt(limit) : undefined, offset: offset ? parseInt(offset) : undefined });
  }

  @Patch('events/:id/acknowledge')
  acknowledgeEvent(@Param('id') id: string, @Query('cafeId') cafeId: string, @Query('userId') userId: string) {
    return this.service.acknowledgeEvent(id, cafeId, userId);
  }

  @Patch('events/:id/mark-evaluation')
  markForEvaluation(@Param('id') id: string, @Query('cafeId') cafeId: string) {
    return this.service.markForEvaluation(id, cafeId);
  }

  @Post('evaluation-cases')
  createEvaluationCase(@Body() body: any) {
    return this.service.createEvaluationCase(body);
  }

  @Get('evaluation-cases')
  getEvaluationCases(@Query('cafeId') cafeId: string, @Query('dataset') dataset?: string) {
    return this.service.getEvaluationCases(cafeId, dataset);
  }

  @Patch('evaluation-cases/:caseId/approve')
  approveCase(@Param('caseId') caseId: string, @Query('cafeId') cafeId: string, @Query('userId') userId: string) {
    return this.service.approveEvaluationCase(caseId, cafeId, userId);
  }

  @Patch('evaluation-cases/:caseId/disable')
  disableCase(@Param('caseId') caseId: string, @Query('cafeId') cafeId: string, @Body('reason') reason: string) {
    return this.service.disableEvaluationCase(caseId, cafeId, reason);
  }

  @Post('prompts')
  createPromptVersion(@Body() body: any) {
    return this.service.createPromptVersion(body);
  }

  @Get('prompts')
  getPromptVersions(@Query('promptId') promptId?: string) {
    return this.service.getPromptVersions(promptId);
  }

  @Patch('prompts/:promptId/versions/:version/status')
  updatePromptStatus(@Param('promptId') promptId: string, @Param('version') version: string, @Body('status') status: string, @Body('reviewerId') reviewerId?: string) {
    return this.service.updatePromptStatus(promptId, version, status as any, reviewerId);
  }

  @Post('prompts/:promptId/rollback')
  rollbackPrompt(@Param('promptId') promptId: string, @Body('currentVersion') currentVersion: string, @Body('targetVersion') targetVersion: string, @Body('authorId') authorId?: string) {
    return this.service.rollbackPrompt(promptId, currentVersion, targetVersion, authorId);
  }

  @Post('rules')
  createRuleVersion(@Body() body: any) {
    return this.service.createRuleVersion(body);
  }

  @Get('rules/:ruleId')
  getRuleHistory(@Param('ruleId') ruleId: string) {
    return this.service.getRuleHistory(ruleId);
  }

  @Post('models')
  createModelVersion(@Body() body: any) {
    return this.service.createModelVersion(body);
  }

  @Get('models')
  getModelVersions(@Query('provider') provider?: string, @Query('model') model?: string) {
    return this.service.getModelVersions(provider, model);
  }

  @Post('feature-flags')
  setFeatureFlag(@Body() body: any) {
    return this.service.setFeatureFlag(body);
  }

  @Get('feature-flags')
  getFeatureFlags(@Query('cafeId') cafeId?: string, @Query('environment') environment?: string) {
    return this.service.getFeatureFlags(cafeId, environment);
  }

  @Get('feature-flags/:flagKey/check')
  checkFeatureFlag(@Param('flagKey') flagKey: string, @Query('cafeId') cafeId: string, @Query('environment') environment?: string) {
    return this.service.isFeatureEnabled(flagKey, cafeId, environment);
  }

  @Post('canary')
  createCanaryRelease(@Body() body: any) {
    return this.service.createCanaryRelease(body);
  }

  @Patch('canary/:releaseId/promote')
  promoteCanary(@Param('releaseId') releaseId: string, @Body('percent') percent: number) {
    return this.service.promoteCanaryRelease(releaseId, percent);
  }

  @Post('canary/:releaseId/rollback')
  rollbackCanary(@Param('releaseId') releaseId: string, @Body('reason') reason: string) {
    return this.service.rollbackCanaryRelease(releaseId, reason);
  }

  @Post('canary/:releaseId/complete')
  completeCanary(@Param('releaseId') releaseId: string) {
    return this.service.completeCanaryRelease(releaseId);
  }

  @Post('changes')
  recordChange(@Body() body: any) {
    return this.service.recordChange(body);
  }

  @Get('changes')
  getChanges(@Query('changeType') changeType?: string, @Query('limit') limit?: string) {
    return this.service.getChangeHistory(changeType, limit ? parseInt(limit) : undefined);
  }

  @Post('review-queue')
  addToReviewQueue(@Body() body: any) {
    return this.service.addToReviewQueue(body);
  }

  @Get('review-queue')
  getReviewQueue(@Query('cafeId') cafeId: string, @Query('status') status?: string) {
    return this.service.getReviewQueue(cafeId, status || undefined);
  }

  @Patch('review-queue/:id/resolve')
  resolveReviewItem(@Param('id') id: string, @Query('cafeId') cafeId: string, @Body('resolution') resolution: string) {
    return this.service.resolveReviewItem(id, cafeId, resolution);
  }

  @Post('corpus')
  addCorpusEntry(@Body() body: any) {
    return this.service.addCorpusEntry(body);
  }

  @Get('corpus')
  getCorpus(@Query('category') category?: string, @Query('minFrequency') minFrequency?: string) {
    return this.service.getCorpus(category, minFrequency ? parseInt(minFrequency) : undefined);
  }

  @Post('drift')
  detectDrift(@Body() body: any) {
    return this.service.detectDrift(body);
  }

  @Get('drift')
  getDrift(@Query('cafeId') cafeId: string, @Query('metricName') metricName?: string) {
    return this.service.getDriftEvents(cafeId, metricName);
  }

  @Post('evaluate/offline')
  runOfflineEval(@Body('dataset') dataset: string, @Body('version') version: string) {
    return this.service.runOfflineEvaluation(dataset, version);
  }

  @Post('evaluate/critical-gates')
  runCriticalGates(@Body('dataset') dataset: string, @Body('version') version: string) {
    return this.service.runCriticalGates(dataset, version);
  }

  @Post('evaluate/response-quality')
  checkResponseQuality(@Body('response') response: string) {
    return this.service.evaluateResponseQuality(response);
  }

  @Post('quality-checks')
  runQualityChecks(@Body() body: any) {
    return this.service.runQualityChecks(body);
  }

  @Post('experience-score')
  calculateExperienceScore(@Body() body: any) {
    return this.service.calculateExperienceScore(body);
  }

  @Get('metrics/:cafeId')
  getMetrics(@Param('cafeId') cafeId: string) {
    return this.service.getMetricSnapshot(cafeId);
  }

  @Post('discover-phrase')
  discoverPhrase(@Body() body: any) {
    return this.service.discoverNewPhrase(body.phrase, body.context, body.aiInterpretation, body.cafeId);
  }

  @Post('detect-failure')
  detectFailure(@Body() body: any) {
    return this.service.detectFailureSignals(body);
  }

  @Post('capture-correction')
  captureCorrection(@Body() body: any) {
    return this.service.captureCustomerCorrection(body);
  }

  @Post('capture-human-resolution')
  captureHumanResolution(@Body() body: any) {
    return this.service.captureHumanResolution(body);
  }

  @Get('failures/:cafeId')
  getFailuresByCategory(@Param('cafeId') cafeId: string) {
    return this.service.getFailuresByCategory(cafeId);
  }

  @Post('success')
  createSuccess(@Body() body: any) {
    return this.service.createSuccessEvent(body);
  }

  @Post('redact')
  redactText(@Body('text') text: string) {
    return { redacted: this.service.redactPII(text) };
  }
}
