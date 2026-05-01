import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TerminusModule } from '@nestjs/terminus';
import { buildPostgresTypeOrmOptions, resolveServiceEnvFiles } from '@shop/shared';
import { Order } from './entities/order.entity';
import { OrderLine } from './entities/order-line.entity';
import { ProcessedEvent } from './entities/processed-event.entity';
import { OrderController } from './order.controller';
import { InternalController } from './internal.controller';
import { OrderService } from './order.service';
import { HealthController } from './health.controller';
import { ServiceBusListenerService } from './service-bus-listener.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolveServiceEnvFiles(__dirname, 'order-svc'),
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildPostgresTypeOrmOptions(config, {
          entities: [Order, OrderLine, ProcessedEvent],
          defaultDb: 'order_app',
          dbEnvVar: 'ORDER_DB',
        }),
    }),
    TypeOrmModule.forFeature([Order, OrderLine, ProcessedEvent]),
    TerminusModule,
  ],
  controllers: [HealthController, OrderController, InternalController],
  providers: [OrderService, ServiceBusListenerService],
})
export class AppModule {}
