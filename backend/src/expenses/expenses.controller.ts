import { Controller, Get, Post, Body, Param, Query, HttpCode, HttpStatus, Req, ParseUUIDPipe } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { BranchId, cafeId } from '../auth/decorators';

@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: { category: string; amount: number; description?: string; expenseDate?: string },
    @Req() req: any,
    @BranchId() branchId?: string,
    @cafeId() cafeId?: string,
  ) {
    return this.expensesService.create({
      ...body,
      expenseDate: body.expenseDate ? new Date(body.expenseDate) : undefined,
      cafeId: cafeId!,
      branchId,
      employeeId: req.user?.employeeId,
    });
  }

  @Get()
  async findAll(@cafeId() cafeId: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.expensesService.findAll(cafeId, from, to);
  }

  @Get('daily')
  async getDaily(@cafeId() cafeId: string, @Query('date') date?: string) {
    return this.expensesService.getDailyExpenses(cafeId, date);
  }

  @Get('weekly')
  async getWeekly(@cafeId() cafeId: string, @Query('date') date?: string) {
    return this.expensesService.getWeeklyExpenses(cafeId, date);
  }

  @Get('monthly')
  async getMonthly(@cafeId() cafeId: string, @Query('date') date?: string) {
    return this.expensesService.getMonthlyExpenses(cafeId, date);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.expensesService.findOne(id, cafeId);
  }
}
