import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Observable } from 'rxjs';
import { PrismaService } from 'src/prisma/prisma.service';
import { WalletAsset as WalletAssetSchema } from './wallet-asset.schema';
import { WalletAsset } from '@prisma/client';

export const WALLET_ASSET_EVENT_NAME = 'wallet-asset-updated';

type ObservableWalletAssetResponse = {
  event: 'wallet-asset-updated';
  data: WalletAsset;
};

@Injectable()
export class WalletAssetsService {
  constructor(
    private prismaService: PrismaService,
    @InjectModel(WalletAssetSchema.name)
    private WalletAssetModel: Model<WalletAssetSchema>,
  ) {}

  all(filter: { wallet_id: string }) {
    return this.prismaService.walletAsset.findMany({
      where: {
        wallet_id: filter.wallet_id,
      },
      include: {
        Asset: {
          select: {
            id: true,
            symbol: true,
            price: true,
          },
        },
      },
    });
  }

  create(input: { wallet_id: string; asset_id: string; shares: number }) {
    //TODO: validar se asset e wallet existe
    return this.prismaService.walletAsset.create({
      data: {
        wallet_id: input.wallet_id,
        asset_id: input.asset_id,
        shares: input.shares,
        version: 1,
      },
    });
  }

  subscribeEvents(
    wallet_id: string,
  ): Observable<ObservableWalletAssetResponse> {
    return new Observable((observer) => {
      this.WalletAssetModel.watch(
        [
          {
            $match: {
              operationType: 'update',
              'fullDocument.wallet_id': wallet_id,
            },
          },
        ],
        {
          fullDocument: 'updateLookup',
        },
      ).on('change', async (data) => {
        const walletAsset = await this.prismaService.walletAsset.findUnique({
          where: { id: data.fullDocument._id.toString() },
        });
        observer.next({
          event: WALLET_ASSET_EVENT_NAME,
          data: walletAsset,
        });
      });
    });
  }
}
