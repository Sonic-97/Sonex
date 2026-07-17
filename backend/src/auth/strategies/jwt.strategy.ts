import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  role: string;
  phone: string;
  branchId?: string | null;
  cafeId?: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET,
    });
  }

  async validate(payload: JwtPayload) {
    // 0. Super-admin bypass — payload.sub is SuperAdmin.id, not a Staff or Cafe id
    if (payload.role === 'SUPER_ADMIN') {
      return {
        id: payload.sub,
        cafeId: payload.cafeId,
        name: 'Super Admin',
        role: 'SUPER_ADMIN',
        phone: payload.phone,
        branchId: payload.branchId,
      };
    }

    // 1. Try to find the user in the Staff table first (handles owner/staff)
    const user = await this.prisma.staff.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, role: true, phone: true, active: true, branchId: true, cafeId: true },
    });

    if (user) {
      if (!user.active) {
        throw new UnauthorizedException('User not found or deactivated');
      }

      // Check if café is active
      const cafe = await this.prisma.cafe.findUnique({
        where: { id: user.cafeId },
        select: { active: true },
      });
      if (!cafe || !cafe.active) {
        throw new UnauthorizedException('Cafe not found or deactivated');
      }

      return {
        id: user.id,
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
    if (!cafe || !cafe.active) {
      throw new UnauthorizedException('Cafe not found or deactivated');
    }
    return {
      id: cafe.id,
      cafeId: cafe.id,
      name: cafe.name,
      role: 'OWNER',
      phone: cafe.phone,
      branchId: null,
    };
  }
}
