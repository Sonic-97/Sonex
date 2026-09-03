import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

import { RegisterCafeDto } from './dto/register-cafe.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async registerCafe(dto: RegisterCafeDto) {
    // Check if email already exists
    const existingOwner = await this.prisma.staff.findFirst({
      where: { email: dto.email },
    });
    if (existingOwner) {
      throw new ConflictException('البريد الإلكتروني للمالك مسجل بالفعل');
    }

    // Check if phone already exists
    const existingPhone = await this.prisma.staff.findFirst({
      where: { phone: dto.phone },
    });
    if (existingPhone) {
      throw new ConflictException('رقم الهاتف مسجل بالفعل');
    }

    // Generate unique Cafe Code COF-XXXXX
    let cafeCode = '';
    let isUnique = false;
    while (!isUnique) {
      const digits = Math.floor(10000 + Math.random() * 90000);
      cafeCode = `COF-${digits}`;
      const existing = await this.prisma.cafe.findUnique({ where: { cafeCode } });
      if (!existing) isUnique = true;
    }

    // Run creation inside transaction
    return this.prisma.$transaction(async (tx) => {
      // 1. Create Cafe
      const cafe = await tx.cafe.create({
        data: {
          name: dto.cafeName,
          address: dto.address,
          category: dto.category,
          ownerCode: cafeCode, // compat fallback
          ownerPassword: '', // placeholder
          phone: dto.phone,
          active: true,
          cafeCode: cafeCode,
        },
      });

      // 2. Create main branch
      const branch = await tx.branch.create({
        data: {
          name: 'الفرع الرئيسي',
          slug: 'main-branch',
          cafeId: cafe.id,
          active: true,
        },
      });

      // 2.5. Create Default Categories
      await tx.productCategory.createMany({
        data: [
          { name: 'مشروبات ساخنة', icon: '☕', color: '#ea580c', sortOrder: 1, cafeId: cafe.id, branchId: branch.id },
          { name: 'مشروبات باردة', icon: '🥤', color: '#0891b2', sortOrder: 2, cafeId: cafe.id, branchId: branch.id },
          { name: 'عصائر طبيعية', icon: '🍹', color: '#65a30d', sortOrder: 3, cafeId: cafe.id, branchId: branch.id },
          { name: 'حلويات', icon: '🍰', color: '#db2777', sortOrder: 4, cafeId: cafe.id, branchId: branch.id },
          { name: 'مأكولات', icon: '🍔', color: '#dc2626', sortOrder: 5, cafeId: cafe.id, branchId: branch.id },
        ],
      });

      // 3. Hash owner password
      const ownerPasswordHashed = await bcrypt.hash(dto.password, 10);

      // 4. Create Owner user in Staff table
      const owner = await tx.staff.create({
        data: {
          name: dto.ownerName,
          email: dto.email,
          phone: dto.phone,
          role: 'OWNER',
          loginCode: dto.email.split('@')[0].toUpperCase() + Math.floor(100 + Math.random() * 900),
          password: ownerPasswordHashed,
          pinHash: '',
          branchId: branch.id,
          cafeId: cafe.id,
          active: true,
        },
      });

      // 5. Link Cafe to Owner ID
      await tx.cafe.update({
        where: { id: cafe.id },
        data: { ownerId: owner.id, ownerPassword: ownerPasswordHashed },
      });

      return {
        cafeCode: cafe.cafeCode,
        cafeName: cafe.name,
        ownerUsername: owner.email,
      };
    });
  }

  async tenantLogin(cafeCode: string, username: string, password: string) {
    const cleanCafeCode = (cafeCode || '').trim();
    const cleanUsername = (username || '').trim();

    const cafe = await this.prisma.cafe.findFirst({
      where: {
        OR: [
          { cafeCode: { equals: cleanCafeCode, mode: 'insensitive' } },
          { ownerCode: { equals: cleanCafeCode, mode: 'insensitive' } },
          { name: { equals: cleanCafeCode, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, active: true, cafeCode: true },
    });

    if (!cafe) {
      throw new UnauthorizedException('رمز أو اسم الكافيه غير صحيح');
    }
    if (!cafe.active) {
      throw new UnauthorizedException('هذا الكافيه غير نشط حالياً');
    }

    const user = await this.prisma.staff.findFirst({
      where: {
        cafeId: cafe.id,
        OR: [
          { email: { equals: cleanUsername, mode: 'insensitive' } },
          { phone: cleanUsername },
          { loginCode: { equals: cleanUsername, mode: 'insensitive' } },
        ],
      },
    });

    if (!user) {
      throw new UnauthorizedException('اسم المستخدم أو كلمة المرور غير صحيحة');
    }
    if (!user.active) {
      throw new UnauthorizedException('هذا الحساب معطل حالياً');
    }

    const valid = await bcrypt.compare(password, user.password || '');
    if (!valid) {
      throw new UnauthorizedException('اسم المستخدم أو كلمة المرور غير صحيحة');
    }

    const tokens = await this.generateTokens(user.id, user.role, user.phone, user.branchId, user.cafeId);

    return {
      userId: user.id,
      cafeId: user.cafeId,
      cafeCode: cafe.cafeCode,
      cafeName: cafe.name,
      name: user.name,
      role: user.role,
      branchId: user.branchId,
      email: user.email,
      phone: user.phone,
      ...tokens,
    };
  }

  async cafeLogin(ownerCode: string, password: string) {
    const cafe = await this.verifyCafe(ownerCode, password);
    const tokens = await this.generateTokens(cafe.id, 'OWNER', cafe.phone, null, cafe.id, true);

    return {
      cafeId: cafe.id,
      name: cafe.name,
      role: 'OWNER',
      ...tokens,
    };
  }

  async verifyCafeCode(ownerCode: string) {
    const cleanCode = (ownerCode || '').trim();
    const cafe = await this.prisma.cafe.findFirst({
      where: {
        OR: [
          { ownerCode: { equals: cleanCode, mode: 'insensitive' } },
          { cafeCode: { equals: cleanCode, mode: 'insensitive' } },
          { name: { equals: cleanCode, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, active: true },
    });

    if (!cafe || !cafe.active) throw new UnauthorizedException('كود الكافيه غير صحيح أو غير نشط');

    return cafe;
  }

  async verifyCafe(ownerCode: string, password: string) {
    const cleanCode = (ownerCode || '').trim();
    const cafe = await this.prisma.cafe.findFirst({
      where: {
        OR: [
          { ownerCode: { equals: cleanCode, mode: 'insensitive' } },
          { cafeCode: { equals: cleanCode, mode: 'insensitive' } },
          { name: { equals: cleanCode, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, ownerPassword: true, phone: true, active: true },
    });

    if (!cafe || !cafe.active) throw new UnauthorizedException('Invalid cafe code or password');
    if (!cafe.ownerPassword) throw new UnauthorizedException('Owner password not set');

    const bcrypt = await import('bcrypt');
    const valid = await bcrypt.compare(password, cafe.ownerPassword);
    if (!valid) throw new UnauthorizedException('Invalid cafe code or password');

    return cafe;
  }

  async superAdminLogin(username: string, password: string) {
    const admin = await this.prisma.superAdmin.findUnique({
      where: { username },
    });

    if (!admin) throw new UnauthorizedException('Invalid super admin credentials');

    const bcrypt = await import('bcrypt');
    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) throw new UnauthorizedException('Invalid super admin credentials');

    const tokens = await this.generateTokens(admin.id, 'SUPER_ADMIN', 'system', null, null, true);

    return {
      username: admin.username,
      role: 'SUPER_ADMIN',
      ...tokens,
    };
  }

  async employeeLogin(code: string, phone: string, password?: string, cafeId?: string) {
    const employee = await this.prisma.staff.findFirst({
      where: { 
        loginCode: code,
        ...(cafeId ? { cafeId } : {}),
      },
      select: { id: true, name: true, role: true, active: true, cafeId: true, branchId: true, phone: true, password: true },
    });

    if (!employee) throw new UnauthorizedException('اسم المستخدم أو كلمة السر غير صحيحة لهذا الكافيه');
    if (!employee.active) throw new UnauthorizedException('Account is deactivated');

    if (password) {
      if (!employee.password) throw new UnauthorizedException('Password not set for this account');
      const bcrypt = await import('bcrypt');
      const valid = await bcrypt.compare(password, employee.password);
      if (!valid) throw new UnauthorizedException('Invalid code or password');
    } else {
      if (employee.phone !== phone) throw new UnauthorizedException('Invalid employee code or phone');
    }

    const tokens = await this.generateTokens(employee.id, employee.role, phone, employee.branchId, employee.cafeId);
    return {
      employeeId: employee.id,
      cafeId: employee.cafeId,
      name: employee.name,
      role: employee.role,
      branchId: employee.branchId,
      phone: employee.phone,
      ...tokens,
    };
  }

  async refresh(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: {
        user: { select: { id: true, name: true, role: true, phone: true, active: true, branchId: true, cafeId: true } },
      },
    });

    if (!stored || !stored.user.active) throw new UnauthorizedException('Invalid refresh token');
    if (new Date() > stored.expiresAt) {
      await this.prisma.refreshToken.delete({ where: { id: stored.id } });
      throw new UnauthorizedException('Refresh token expired');
    }

    await this.prisma.refreshToken.delete({ where: { id: stored.id } });

    const tokens = await this.generateTokens(
      stored.user.id,
      stored.user.role,
      stored.user.phone,
      stored.user.branchId,
      stored.user.cafeId,
    );

    return {
      employeeId: stored.user.id,
      cafeId: stored.user.cafeId,
      name: stored.user.name,
      role: stored.user.role,
      branchId: stored.user.branchId,
      ...tokens,
    };
  }

  async logout(refreshToken: string) {
    try {
      await this.prisma.refreshToken.delete({ where: { token: refreshToken } });
    } catch {}
    return { message: 'Logged out successfully' };
  }

  async validateAccessToken(accessToken: string) {
    try {
      const payload = this.jwtService.verify(accessToken, {
        secret: process.env.JWT_ACCESS_SECRET,
      });

      // 1. Try to find the user in the Staff table first (handles owners/staff)
      const user = await this.prisma.staff.findUnique({
        where: { id: payload.sub },
        select: { id: true, name: true, role: true, phone: true, active: true, branchId: true, cafeId: true },
      });

      if (user) {
        if (!user.active) throw new UnauthorizedException('User not found or deactivated');
        
        // Validate café is active
        const cafe = await this.prisma.cafe.findUnique({
          where: { id: user.cafeId },
          select: { id: true, name: true, active: true },
        });
        if (!cafe || !cafe.active) throw new UnauthorizedException('Cafe not found or deactivated');

        return {
          employeeId: user.id,
          cafeId: user.cafeId,
          name: user.name,
          role: user.role,
          phone: user.phone,
          branchId: user.branchId,
        };
      }

      // 2. Fallback for Cafe-direct tokens (where sub is cafeId)
      const cafe = await this.prisma.cafe.findUnique({
        where: { id: payload.sub },
        select: { id: true, name: true, phone: true, active: true },
      });
      if (!cafe || !cafe.active) throw new UnauthorizedException('Cafe not found or deactivated');
      return { cafeId: cafe.id, name: cafe.name, role: 'OWNER', phone: cafe.phone };
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  async registerLoginCode(employeeId: string, code: string) {
    const existing = await this.prisma.staff.findUnique({ where: { loginCode: code } });
    if (existing && existing.id !== employeeId) throw new ConflictException('Login code already in use');

    return this.prisma.staff.update({
      where: { id: employeeId },
      data: { loginCode: code },
      select: { id: true, name: true, loginCode: true },
    });
  }

  async setOwnerPassword(cafeId: string, password: string) {
    const hashed = await bcrypt.hash(password, 10);
    return this.prisma.cafe.update({
      where: { id: cafeId },
      data: { ownerPassword: hashed },
      select: { id: true, name: true },
    });
  }

  async generateEmployeeCode(ownerId: string, role: string): Promise<string> {
    const prefix = role === 'DRIVER' ? 'DR' : 'BR';
    const maxAttempts = 10;
    for (let i = 0; i < maxAttempts; i++) {
      const digits = Math.floor(10000 + Math.random() * 90000);
      const code = `${prefix}-${digits}`;
      const existing = await this.prisma.staff.findUnique({ where: { loginCode: code } });
      if (!existing) return code;
    }
    throw new ConflictException('Unable to generate unique code, please try again');
  }

  private async generateTokens(userId: string, role: string, phone: string, branchId: string | null, cafeId: string | null, skipRefreshStore = false) {
    const payload = { sub: userId, role, phone, branchId, cafeId };

    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: (process.env.ACCESS_TOKEN_EXPIRY || '15m') as any,
    });

    const refreshTokenValue = this.jwtService.sign(
      { ...payload, tokenId: crypto.randomUUID() },
      {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: (process.env.REFRESH_TOKEN_EXPIRY || '7d') as any,
      },
    );

    if (!skipRefreshStore) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await this.prisma.refreshToken.create({
        data: { token: refreshTokenValue, userId, expiresAt },
      });
    }

    return { accessToken, refreshToken: refreshTokenValue };
  }
}
