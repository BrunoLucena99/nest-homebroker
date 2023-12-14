import { Injectable } from '@nestjs/common';
import { Asset } from '@prisma/client';
import { Observable } from 'rxjs';
import { PrismaService } from 'src/prisma/prisma.service';
import { Asset as AssetSchema } from './asset.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

export const ASSET_EVENT_NAME = 'asset-price-changed';

type ObservableAssetResponse = {
  event: 'asset-price-changed';
  data: Asset;
};

@Injectable()
export class AssetsService {
  constructor(
    private prismaService: PrismaService,
    @InjectModel(AssetSchema.name)
    private assetModel: Model<AssetSchema>,
  ) {}

  create(data: { id: string; symbol: string; price: number }) {
    return this.prismaService.asset.create({
      data,
    });
  }

  findOne(id: string) {
    return this.prismaService.asset.findUnique({
      where: {
        id,
      },
    });
  }

  all() {
    return this.prismaService.asset.findMany();
  }

  subscribeEvents(): Observable<ObservableAssetResponse> {
    return new Observable((observer) => {
      this.assetModel
        .watch(
          [
            {
              $match: {
                operationType: 'update',
              },
            },
          ],
          {
            fullDocument: 'updateLookup',
          },
        )
        .on('change', async (data) => {
          console.log(data);
          const asset = await this.prismaService.asset.findUnique({
            where: {
              id: data.fullDocument._id + '',
            },
          });
          observer.next({ event: ASSET_EVENT_NAME, data: asset });
        });
    });
  }
}
