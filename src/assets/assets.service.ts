import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AssetsService {
  constructor(private prismaService: PrismaService) {}

  create(data: { id: string; symbol: string; price: number }) {
    return this.prismaService.asset.create({
      data,
    });
  }

  all() {
    return this.prismaService.asset.findMany();
  }
}
