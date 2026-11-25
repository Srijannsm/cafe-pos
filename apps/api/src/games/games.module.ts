import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { GamesGateway } from './games.gateway.js';

@Module({ imports: [PrismaModule], providers: [GamesGateway] })
export class GamesModule {}
