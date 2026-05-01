import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayNotEmpty,
  Equals,
  IsArray,
  IsInt,
  IsISO8601,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CheckoutEventPayloadDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  productIds!: string[];

  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(1, { each: true })
  quantities!: number[];
}

export class CheckoutEventDto {
  @Equals('CheckoutRequested')
  eventType!: 'CheckoutRequested';

  @Equals(1)
  schemaVersion!: 1;

  @IsISO8601()
  occurredAt!: string;

  @IsString()
  @MinLength(1)
  correlationId!: string;

  @IsString()
  @MinLength(1)
  userId!: string;

  @IsString()
  @MinLength(1)
  cartId!: string;

  @ValidateNested()
  @Type(() => CheckoutEventPayloadDto)
  payload!: CheckoutEventPayloadDto;
}
