import { Resolver, Query, Mutation, Args, Context, Int } from '@nestjs/graphql';
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
    const res = await this.backends.management.GET('/employees');
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
    const res = await this.backends.management.GET('/employees/{id}', { params: { path: { id } } });
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
      params: { path: { email } },
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
    const res = await (this.backends.management as any).PUT('/employees', {
      body: { name, email, department },
    });
    // Align with OpenAPI AddEmployeeResponse (may not include id). Use returned id if present.
    const created = unwrapOrThrow(res) as any;
    const id = created.id ? String(created.id) : '';
    return {
      id,
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
    const res = await (this.backends.management as any).PUT('/employees/{id}', {
      params: {
        path: { id: String(id) },
        header: {
          'x-user-id': ctx.req.user?.sub ?? '',
          ...(ctx.correlationId ? { 'x-correlation-id': ctx.correlationId } : {}),
        },
      },
      body: { name, email, department },
    });
    const updated = unwrapOrThrow(res) as any;
    // OpenAPI UpdateEmployeeResponse lacks createdAt, synthesize timestamp
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
  async deleteEmployee(
    @Args('id', { type: () => Int }) id: number,
    @Context() ctx: GatewayGraphqlContext,
  ) {
    const res = await (this.backends.management as any).DELETE('/employees/{id}', {
      params: {
        path: { id: String(id) },
        header: {
          'x-user-id': ctx.req.user?.sub ?? '',
          ...(ctx.correlationId ? { 'x-correlation-id': ctx.correlationId } : {}),
        },
      },
    });
    return !res.error;
  }
}

import { Field, ObjectType } from '@nestjs/graphql';

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
