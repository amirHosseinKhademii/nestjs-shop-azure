import { Field, InputType, ObjectType, registerEnumType } from '@nestjs/graphql';

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

export enum TaskStatusGql {
  Todo = 'Todo',
  InProgress = 'InProgress',
  Done = 'Done',
}

registerEnumType(TaskStatusGql, { name: 'TaskStatus' });

export enum TaskPriorityGql {
  Low = 'Low',
  Medium = 'Medium',
  High = 'High',
}

registerEnumType(TaskPriorityGql, { name: 'TaskPriority' });

@ObjectType()
export class TaskGql {
  @Field()
  id!: string;

  @Field()
  title!: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => TaskStatusGql)
  status!: TaskStatusGql;

  @Field(() => TaskPriorityGql)
  priority!: TaskPriorityGql;

  @Field({ nullable: true })
  dueDate?: string;

  @Field()
  createdAt!: string;

  @Field()
  updatedAt!: string;
}

@ObjectType()
export class TasksPageGql {
  @Field(() => [TaskGql])
  items!: TaskGql[];

  @Field()
  page!: number;

  @Field()
  pageSize!: number;

  @Field()
  totalItems!: number;

  @Field()
  totalPages!: number;
}

@InputType()
export class CreateTaskInputGql {
  @Field()
  title!: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => TaskStatusGql, { nullable: true })
  status?: TaskStatusGql;

  @Field(() => TaskPriorityGql, { nullable: true })
  priority?: TaskPriorityGql;

  @Field({ nullable: true })
  dueDate?: string;
}

@InputType()
export class UpdateTaskInputGql {
  @Field()
  title!: string;

  @Field(() => TaskStatusGql)
  status!: TaskStatusGql;

  @Field(() => TaskPriorityGql)
  priority!: TaskPriorityGql;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  dueDate?: string;
}
