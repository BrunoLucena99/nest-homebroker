import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    console.log('Initializing database connection.');
    await this.$connect()
      .then(() => {
        console.log('Database connected!');
      })
      .catch((e) => {
        console.log(`Database connection failed ${e}`);
      });
  }

  async enableShutdownHooks(app: INestApplication) {
    this.$on('beforeExit', async () => {
      await app.close();
    });
  }
}
