import { Body, Controller, Get, MessageEvent, Post, Sse } from '@nestjs/common';
import { AssetsService } from './assets.service';
import { Observable, map } from 'rxjs';

@Controller('assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Post()
  create(@Body() body: { id: string; symbol: string; price: number }) {
    return this.assetsService.create(body);
  }

  @Get()
  all() {
    return this.assetsService.all();
  }

  @Sse('events')
  events(): Observable<MessageEvent> {
    return this.assetsService.subscribeEvents().pipe(
      map((data) => ({
        type: data.event,
        data: data.data,
      })),
    );
  }
}
