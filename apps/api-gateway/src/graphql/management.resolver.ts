import { Resolver, Query, Mutation, Args, Context } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GqlJwtGuard } from './gql-jwt.guard';
import { BackendContractsService } from '../contracts/backend-contracts.service';
import { unwrapOrThrow } from '../contracts/openapi-helpers';
import type { GatewayGraphqlContext } from './graphql-context';

@Resolver()
export class ManagementResolver {
  constructor(private readonly backends: BackendContractsService) {}

  @Query(() => [EmployeeGql])
  async employees(@Context() ctx: { correlationId?: string }) {
    const res = await this.backends.management.GET('/employees', {
      params: {
        header: ctx?.correlationId ? { 'x-correlation-id': ctx.correlationId } : ({} as never),
      },
    });
    const raw = unwrapOrThrow(res);
    return raw.map((e: any) => ({
      id: String(e.id),
      name: e.name,
      email: e.email,
      department: e.department,
      createdAt: e.created_at,
    }));
  }

  @Query(() => EmployeeGql, { nullable: true })
  async employee(@Args('id') id: string, @Context() ctx: { correlationId?: string }) {
    const res = await this.backends.management.GET('/employees/{id}', {
      params: { path: { id }, header: ctx?.correlationId ? { 'x-correlation-id': ctx.correlationId } : ({} as never) },
    });
    if (res.error) return null;
    const e = unwrapOrThrow(res);
    return {
      id: String(e.id),
      name: e.name,
      email: e.email,
      department: e.department,
      createdAt: e.created_at,
    };
  }

  @Query(() => EmployeeGql, { nullable: true })
  async employeeByEmail(@Args('email') email: string, @Context() ctx: { correlationId?: string }) {
    const res = await this.backends.management.GET('/employees/email/{email}', {
      params: { path: { email }, header: ctx?.correlationId ? { 'x-correlation-id': ctx.correlationId } : ({} as never) },
    });
    if (res.error) return null;
    const e = unwrapOrThrow(res);
    return {
      id: String(e.id),
      name: e.name,
      email: e.email,
      department: e.department,
      createdAt: e.created_at,
    };
  }

  @Mutation(() => EmployeeGql)
  @UseGuards(GqlJwtGuard)
  async createEmployee(
    @Args('name') name: string,
    @Args('email') email: string,
    @Args('department') department: string,
    @Context() ctx: GatewayGraphqlContext,
  ) {
    const res = await this.backends.management.PUT('/employees', {
      body: { name, email, department },
      params: {
        header: {
          'x-user-id': ctx.req.user?.sub ?? '',
          ...(ctx.correlationId ? { 'x-correlation-id': ctx.correlationId } : {}),
        },
      },
    });
    const created = unwrapOrThrow(res);
    return {
      id: String(created.id),
      name: created.name,
      email: created.email,
      department: created.department,
      createdAt: new Date().toISOString(),
    };
  }

  @Mutation(() => EmployeeGql)
  @UseGuards(GqlJwtGuard)
  async updateEmployee(
    @Args('id', { type: () => Int }) id: number,
    @Args('name') name: string,
    @Args('email') email: string,
    @Args('department') department: string,
    @Context() ctx: GatewayGraphqlContext,
  ) {
    const res = await this.backends.management.PUT('/employees/{id}', {
      params: { path: { id: String(id) }, header: { 'x-user-id': ctx.req.user?.sub ?? '', ...(ctx.correlationId ? { 'x-correlation-id': ctx.correlationId } : {}) } },
      body: { name, email, department },
    });
    const updated = unwrapOrThrow(res);
    return {
      id: String(updated.id),
      name: updated.name,
      email: updated.email,
      department: updated.department,
      createdAt: new Date().toISOString(),
    };
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlJwtGuard)
  async deleteEmployee(@Args('id', { type: () => Int }) id: number, @Context() ctx: GatewayGraphqlContext) {
    const res = await this.backends.management.DELETE('/employees/{id}', {
      params: { path: { id: String(id) }, header: { 'x-user-id': ctx.req.user?.sub ?? '', ...(ctx.correlationId ? { 'x-correlation-id': ctx.correlationId } : {}) } },
    });
    return !res.error;
  }
}

import { Field, ObjectType, Int } from '@nestjs/graphql';

@ObjectType()
export class EmployeeGql {
  @Field()
  id!: string;

  @Field()
  name!: string;

  @Field()
  email!: string;

  @Field()
  department!: string;

  @Field()
  createdAt!: string;
}
