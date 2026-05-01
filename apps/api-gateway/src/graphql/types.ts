import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class UserGql {
  @Field()
  id!: string;

  @Field()
  email!: string;

  @Field({ nullable: true })
  displayName?: string;
}

@ObjectType()
export class AuthPayloadGql {
  @Field()
  accessToken!: string;

  @Field()
  expiresIn!: string;

  @Field(() => UserGql)
  user!: UserGql;
}

@ObjectType()
export class ProductGql {
  @Field()
  id!: string;

  @Field()
  name!: string;

  @Field({ nullable: true })
  description?: string;

  @Field()
  priceCents!: number;

  @Field()
  stock!: number;
}

@ObjectType()
export class CartLineGql {
  @Field()
  productId!: string;

  @Field()
  qty!: number;
}

@ObjectType()
export class CartGql {
  @Field(() => [CartLineGql])
  items!: CartLineGql[];
}

@ObjectType()
export class CheckoutResultGql {
  @Field()
  accepted!: boolean;

  @Field()
  correlationId!: string;

  @Field()
  cartId!: string;

  @Field()
  channel!: string;
}

@ObjectType()
export class OrderLineGql {
  @Field()
  id!: string;

  @Field()
  productId!: string;

  @Field()
  quantity!: number;

  @Field()
  priceCents!: number;
}

@ObjectType()
export class OrderGql {
  @Field()
  id!: string;

  @Field()
  userId!: string;

  @Field()
  cartId!: string;

  @Field()
  correlationId!: string;

  @Field()
  status!: string;

  @Field(() => [OrderLineGql])
  lines!: OrderLineGql[];
}
