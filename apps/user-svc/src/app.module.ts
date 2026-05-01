import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { User } from './entities/user.entity';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('PGHOST', 'localhost'),
        port: Number(config.get('PGPORT', 5432)),
        username: config.get('PGUSER', 'postgres'),
        password: config.get('PGPASSWORD', 'postgres'),
        database: config.get('USER_DB', 'user_app'),
        entities: [User],
        synchronize: config.get('TYPEORM_SYNC', 'true') === 'true',
      }),
    }),
    TerminusModule,
    AuthModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
