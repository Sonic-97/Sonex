import { Controller, Get, Post, Patch, Param, Query, Body, HttpCode, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { SuggestionEngineService } from './suggestion-engine.service';
import { CustomerHabitService } from './customer-habit.service';
import { cafeId } from '../auth/decorators';

@Controller('smart-followup')
export class SmartFollowupController {
  constructor(
    private readonly suggestionEngine: SuggestionEngineService,
    private readonly habitService: CustomerHabitService,
  ) {}

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  async generateSuggestions(@cafeId() cafeId?: string) {
    return this.suggestionEngine.generateDailySuggestions(cafeId);
  }

  @Get('suggestions')
  async getSuggestions(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @cafeId() cafeId?: string,
  ) {
    return this.suggestionEngine.getUserSuggestions(
      status,
      parseInt(limit || '50'),
      parseInt(offset || '0'),
      cafeId,
    );
  }

  @Get('suggestions/stats')
  async getStats(@cafeId() cafeId?: string) {
    return this.suggestionEngine.getWeeklyStats(cafeId);
  }

  @Patch('suggestions/:id/dismiss')
  @HttpCode(HttpStatus.OK)
  async dismissSuggestion(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.suggestionEngine.dismissSuggestion(id, cafeId);
  }

  @Patch('suggestions/:id/send')
  @HttpCode(HttpStatus.OK)
  async markSent(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.suggestionEngine.markSent(id, cafeId);
  }

  @Patch('suggestions/:id/status')
  @HttpCode(HttpStatus.OK)
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: string,
    @Body('ownerEditedMessage') ownerEditedMessage?: string,
    @Body('ownerNote') ownerNote?: string,
    @cafeId() cafeId?: string,
  ) {
    return this.suggestionEngine.updateSuggestionStatus(id, status, ownerEditedMessage, ownerNote, cafeId);
  }

  @Post('suggestions/:id/feedback')
  @HttpCode(HttpStatus.OK)
  async submitFeedback(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('wasCorrect') wasCorrect: boolean,
    @Body('ownerRating') ownerRating?: number,
    @Body('notes') notes?: string,
    @cafeId() cafeId?: string,
  ) {
    return this.suggestionEngine.submitFeedback(id, wasCorrect, ownerRating, notes, cafeId);
  }

  @Get('habits/:customerId')
  async getCustomerHabit(@Param('customerId', ParseUUIDPipe) customerId: string, @cafeId() cafeId?: string) {
    return this.suggestionEngine.getCustomerHabit(customerId, cafeId);
  }

  @Patch('habits/:customerId/quiet-hours')
  @HttpCode(HttpStatus.OK)
  async updateQuietHours(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body('quietHourStart') quietHourStart: number,
    @Body('quietHourEnd') quietHourEnd: number,
    @cafeId() cafeId?: string,
  ) {
    return this.suggestionEngine.updateCustomerQuietHours(customerId, quietHourStart, quietHourEnd, cafeId);
  }

  @Patch('habits/:customerId/pause')
  @HttpCode(HttpStatus.OK)
  async togglePause(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body('isPaused') isPaused: boolean,
    @cafeId() cafeId?: string,
  ) {
    return this.suggestionEngine.togglePauseCustomer(customerId, isPaused, cafeId);
  }

  @Post('analyze/:customerId')
  @HttpCode(HttpStatus.OK)
  async analyzeCustomer(@Param('customerId', ParseUUIDPipe) customerId: string, @cafeId() cafeId?: string) {
    const analysis = await this.habitService.analyzeCustomer(customerId, cafeId);
    await this.habitService.upsertHabit(analysis, cafeId);
    return analysis;
  }
}




