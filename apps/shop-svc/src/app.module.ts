import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ObservabilityModule } from '@shop/observability';
import { MongooseModule } from '@nestjs/mongoose';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';
import { Product, ProductSchema } from './schemas/product.schema';
import { ShopController } from './shop.controller';
import { ShopService } from './shop.service';
import { CheckoutPublisherService } from './checkout-publisher.service';
import { HealthController } from './health.controller';
import { RedisModule } from './redis/redis.module';

const monorepoRootEnv = join(__dirname, '..', '..', '..', '.env');
const shopSvcEnv = join(__dirname, '..', '.env');

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        monorepoRootEnv,
        shopSvcEnv,
        join(process.cwd(), '.env'),
        join(process.cwd(), 'apps', 'shop-svc', '.env'),
      ],
    }),
    ObservabilityModule.forRoot({ serviceName: 'shop-svc' }),
    MongooseModule.forRoot(process.env.MONGO_URI ?? 'mongodb://localhost:27017/shop', {
      serverSelectionTimeoutMS: 5_000,
      retryAttempts: 3,
    }),
    MongooseModule.forFeature([{ name: Product.name, schema: ProductSchema }]),
    RedisModule,
    TerminusModule,
    HttpModule.register({ timeout: 10000 }),
  ],
  controllers: [HealthController, ShopController],
  providers: [ShopService, CheckoutPublisherService],
})
export class AppModule {}
