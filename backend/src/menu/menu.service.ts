import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MenuService {
  constructor(private prisma: PrismaService) {}

  async getActiveProducts() {
    return this.prisma.product.findMany({
      where: { active: true },
    });
  }

  async findProductByName(name: string) {
    return this.prisma.product.findFirst({
      where: {
        name: {
          contains: name,
          mode: 'insensitive',
        },
        active: true,
      },
    });
  }
}



