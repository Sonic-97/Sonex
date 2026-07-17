import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import {
  SaveStep1Dto, SaveStep3Dto, SaveStep4Dto,
  SaveStep5Dto, SaveStep6Dto, SaveStep7Dto, SaveStep8Dto,
  ImportMenuDto, SaveStepDto,
} from './dto/onboarding.dto';
import { cafeId } from '../auth/decorators/cafe-id.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';

@Controller('onboarding')
@UseGuards(RolesGuard)
@Roles('OWNER')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get('session')
  getSession(@cafeId() cafeId: string) {
    return this.onboarding.getSession(cafeId);
  }

  @Put('step')
  saveStep(@cafeId() cafeId: string, @Body() dto: SaveStepDto) {
    return this.onboarding.saveStep(cafeId, dto.step, dto.data);
  }

  @Post('step/1')
  submitStep1(@cafeId() cafeId: string, @Body() dto: SaveStep1Dto) {
    return this.onboarding.submitStep1(cafeId, dto);
  }

  @Post('import/menu')
  importMenu(@cafeId() cafeId: string, @Body() dto: ImportMenuDto) {
    return this.onboarding.importMenu(cafeId, dto.text);
  }

  @Post('step/3')
  submitStep3(@cafeId() cafeId: string, @Body() dto: SaveStep3Dto) {
    return this.onboarding.submitStep3(cafeId, dto);
  }

  @Post('step/4')
  submitStep4(@cafeId() cafeId: string, @Body() dto: SaveStep4Dto) {
    return this.onboarding.submitStep4(cafeId, dto);
  }

  @Post('step/5')
  submitStep5(@cafeId() cafeId: string, @Body() dto: SaveStep5Dto) {
    return this.onboarding.submitStep5(cafeId, dto);
  }

  @Post('step/6')
  submitStep6(@cafeId() cafeId: string, @Body() dto: SaveStep6Dto) {
    return this.onboarding.submitStep6(cafeId, dto);
  }

  @Post('step/7')
  submitStep7(@cafeId() cafeId: string, @Body() dto: SaveStep7Dto) {
    return this.onboarding.submitStep7(cafeId, dto);
  }

  @Post('step/8')
  submitStep8(@cafeId() cafeId: string, @Body() dto: SaveStep8Dto) {
    return this.onboarding.submitStep8(cafeId, dto);
  }

  @Get('readiness-report')
  getReadinessReport(@cafeId() cafeId: string) {
    return this.onboarding.getReadinessReport(cafeId);
  }

  @Post('complete')
  complete(@cafeId() cafeId: string) {
    return this.onboarding.complete(cafeId);
  }
}
