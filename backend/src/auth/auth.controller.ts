import {
  Controller, Post, Get, Body, HttpCode, HttpStatus,
  Req, Res, UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { EmployeeLoginDto, CafeLoginDto, RefreshDto, RegisterCafeDto, TenantLoginDto } from './dto';
import { Public } from './decorators';

const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000;
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private setTokenCookies(res: Response, accessToken: string, refreshToken: string) {
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: ACCESS_TOKEN_MAX_AGE,
    });
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });
  }

  private clearTokenCookies(res: Response) {
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/' });
  }

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterCafeDto) {
    return this.authService.registerCafe(dto);
  }

  @Public()
  @Post('login-tenant')
  @HttpCode(HttpStatus.OK)
  async loginTenant(@Body() dto: TenantLoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.tenantLogin(dto.cafeCode, dto.username, dto.password);
    this.setTokenCookies(res, result.accessToken, result.refreshToken);
    return {
      userId: result.userId,
      cafeId: result.cafeId,
      cafeCode: result.cafeCode,
      cafeName: result.cafeName,
      name: result.name,
      role: result.role,
      branchId: result.branchId,
      email: result.email,
      phone: result.phone,
      accessToken: result.accessToken,
    };
  }

  @Public()
  @Post('super-admin/login')
  @HttpCode(HttpStatus.OK)
  async superAdminLogin(@Body() dto: { username: string; password: string }, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.superAdminLogin(dto.username, dto.password);
    this.setTokenCookies(res, result.accessToken, result.refreshToken);
    return { username: result.username, role: result.role, accessToken: result.accessToken };
  }

  @Public()
  @Post('cafe/verify-code')
  @HttpCode(HttpStatus.OK)
  async verifyCafeCode(@Body('ownerCode') ownerCode: string) {
    const cafe = await this.authService.verifyCafeCode(ownerCode);
    return { cafeId: cafe.id, name: cafe.name };
  }

  @Public()
  @Post('cafe/verify')
  @HttpCode(HttpStatus.OK)
  async verifyCafe(@Body() dto: CafeLoginDto) {
    const cafe = await this.authService.verifyCafe(dto.ownerCode, dto.password);
    return { cafeId: cafe.id, name: cafe.name };
  }

  @Public()
  @Post('cafe/login')
  @HttpCode(HttpStatus.OK)
  async cafeLogin(@Body() dto: CafeLoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.cafeLogin(dto.ownerCode, dto.password);
    this.setTokenCookies(res, result.accessToken, result.refreshToken);
    return { cafeId: result.cafeId, name: result.name, role: result.role, accessToken: result.accessToken };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async employeeLogin(@Body() dto: EmployeeLoginDto, @Res({ passthrough: true }) res: Response) {
    if (!dto.code) throw new UnauthorizedException('Code is required');
    const result = await this.authService.employeeLogin(dto.code, dto.phone || '', dto.password, dto.cafeId);
    this.setTokenCookies(res, result.accessToken, result.refreshToken);
    return {
      employeeId: result.employeeId,
      cafeId: result.cafeId,
      name: result.name,
      role: result.role,
      branchId: result.branchId,
      phone: result.phone,
      accessToken: result.accessToken,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = dto.refreshToken || req.cookies?.refresh_token;
    if (!refreshToken) throw new UnauthorizedException('Refresh token required');
    const result = await this.authService.refresh(refreshToken);
    this.setTokenCookies(res, result.accessToken, result.refreshToken);
    return { employeeId: result.employeeId, cafeId: result.cafeId, name: result.name, role: result.role, accessToken: result.accessToken };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body() body: { refreshToken?: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = body?.refreshToken || req.cookies?.refresh_token;
    this.clearTokenCookies(res);
    if (refreshToken) await this.authService.logout(refreshToken);
    return { message: 'Logged out successfully' };
  }

  @Public()
  @Get('me')
  @HttpCode(HttpStatus.OK)
  async me(@Req() req: Request) {
    const accessToken = req.cookies?.access_token || req.headers.authorization?.replace('Bearer ', '');
    if (!accessToken) throw new UnauthorizedException('No token provided');
    return this.authService.validateAccessToken(accessToken);
  }

  @Public()
  @Post('register-code')
  @HttpCode(HttpStatus.OK)
  async registerCode(@Body('employeeId') employeeId: string, @Body('code') code: string) {
    return this.authService.registerLoginCode(employeeId, code);
  }

  @Public()
  @Post('generate-code')
  @HttpCode(HttpStatus.OK)
  async generateCode(@Body('ownerId') ownerId: string, @Body('role') role: string) {
    const code = await this.authService.generateEmployeeCode(ownerId, role);
    return { code };
  }

  @Public()
  @Post('cafe/set-password')
  @HttpCode(HttpStatus.OK)
  async setOwnerPassword(@Body('cafeId') cafeId: string, @Body('password') password: string) {
    return this.authService.setOwnerPassword(cafeId, password);
  }
}
