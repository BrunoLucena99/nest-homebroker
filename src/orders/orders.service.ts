import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { InitTransactionDto, InputExecuteTransactionDto } from './order.dto';
import { Order, OrderStatus, OrderType } from '@prisma/client';
import { ClientKafka } from '@nestjs/microservices';
import { Observable } from 'rxjs';
import { InjectModel } from '@nestjs/mongoose';
import { Order as OrderSchema } from './order.schema';
import { Model } from 'mongoose';

@Injectable()
export class OrdersService {
  constructor(
    private prismaService: PrismaService,
    @Inject('ORDERS_PUBLISHER')
    private readonly kafkaClient: ClientKafka,
    @InjectModel(OrderSchema.name) private orderModel: Model<OrderSchema>,
  ) {}

  all(filter: { wallet_id: string }) {
    return this.prismaService.order.findMany({
      where: { wallet_id: filter.wallet_id },
      include: {
        Transaction: true,
        Asset: {
          select: { id: true, symbol: true },
        },
      },
      orderBy: { updated_at: 'desc' },
    });
  }

  async initTransaction(input: InitTransactionDto) {
    //TODO: validar se asset existe
    const order = await this.prismaService.order.create({
      data: {
        ...input,
        partial: input.shares,
        status: OrderStatus.PENDING,
        version: 1,
      },
    });

    this.kafkaClient.emit('input', {
      order_id: order.id,
      investor_id: order.wallet_id,
      asset_id: order.asset_id,
      shares: order.shares,
      price: order.price,
      order_type: order.type,
    });
    return order;
  }

  async executeTransactionRest(input: InputExecuteTransactionDto) {
    //TODO: Usar o prismaService.$use para eventos
    //TODO: deve validar se for SELL, se tem order suficiente para vender

    return this.prismaService.$transaction(async (prisma) => {
      const order = await prisma.order.findUniqueOrThrow({
        where: { id: input.order_id },
      });

      //lock - Qnd falhar implementar uma fila e reprocessar dps (version)

      await prisma.order.update({
        where: { id: input.order_id, version: order.version },
        data: {
          status: input.status,
          partial: order.partial - input.negotiated_shares,
          Transaction: {
            create: {
              broker_transaction_id: input.broker_transaction_id,
              related_investor_id: input.related_investor_id,
              shares: input.negotiated_shares,
              price: input.price,
            },
          },
          version: { increment: 1 },
        },
      });

      if (input.status == OrderStatus.CLOSED) {
        await prisma.asset.update({
          where: { id: order.asset_id },
          data: { price: input.price },
        });
        await this.prismaService.assetDaily.create({
          data: {
            asset_id: order.asset_id,
            date: new Date(),
            price: input.price,
          },
        });
        const walletAsset = await prisma.walletAsset.findUnique({
          where: {
            wallet_id_asset_id: {
              asset_id: order.asset_id,
              wallet_id: order.wallet_id,
            },
          },
        });

        if (walletAsset) {
          await prisma.walletAsset.update({
            where: {
              wallet_id_asset_id: {
                asset_id: order.asset_id,
                wallet_id: order.wallet_id,
              },
              version: walletAsset.version,
            },
            data: {
              shares:
                order.type === OrderType.BUY
                  ? walletAsset.shares + order.shares
                  : walletAsset.shares - order.shares,
              version: { increment: 1 },
            },
          });
        } else {
          //Só poderia adicionar na carteira se for de compra
          await prisma.walletAsset.create({
            data: {
              asset_id: order.asset_id,
              wallet_id: order.wallet_id,
              shares: input.negotiated_shares,
              version: 1,
            },
          });
        }
      }
    });
  }

  subscribeEvents(
    wallet_id: string,
  ): Observable<{ event: 'order-created' | 'order-updated'; data: Order }> {
    return new Observable((observer) => {
      this.orderModel
        .watch(
          [
            {
              $match: {
                $or: [{ operationType: 'insert' }, { operationType: 'update' }],
                'fullDocument.wallet_id': wallet_id,
              },
            },
          ],
          { fullDocument: 'updateLookup' },
        )
        .on('change', async (data) => {
          const eventName =
            data.operationType === 'insert' ? 'order-created' : 'order-updated';

          const order = await this.prismaService.order.findUnique({
            where: {
              id: data.fullDocument._id + '',
            },
          });

          observer.next({
            event: eventName,
            data: order,
          });
        });
    });
  }
}
