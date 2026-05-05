import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GqlJwtGuard } from './gql-jwt.guard';
import { BackendContractsService } from '../contracts/backend-contracts.service';
import { unwrapOrThrow } from '../contracts/openapi-helpers';
import {
  CreateTaskInputGql,
  TaskGql,
  TasksPageGql,
  TaskPriorityGql,
  TaskStatusGql,
  UpdateTaskInputGql,
} from './types';

function toTaskStatus(value: unknown): TaskStatusGql {
  if (value === TaskStatusGql.Todo) return TaskStatusGql.Todo;
  if (value === TaskStatusGql.InProgress) return TaskStatusGql.InProgress;
  if (value === TaskStatusGql.Done) return TaskStatusGql.Done;
  // If the generated OpenAPI types model enums as numbers (some generators do),
  // fall back to a stable mapping.
  if (value === 0) return TaskStatusGql.Todo;
  if (value === 1) return TaskStatusGql.InProgress;
  if (value === 2) return TaskStatusGql.Done;
  return TaskStatusGql.Todo;
}

function toTaskPriority(value: unknown): TaskPriorityGql {
  if (value === TaskPriorityGql.Low) return TaskPriorityGql.Low;
  if (value === TaskPriorityGql.Medium) return TaskPriorityGql.Medium;
  if (value === TaskPriorityGql.High) return TaskPriorityGql.High;
  if (value === 0) return TaskPriorityGql.Low;
  if (value === 1) return TaskPriorityGql.Medium;
  if (value === 2) return TaskPriorityGql.High;
  return TaskPriorityGql.Medium;
}

function mapTask(dto: {
  id: string;
  title: string;
  description: string | null;
  status: unknown;
  priority: unknown;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}): TaskGql {
  return {
    id: dto.id,
    title: dto.title,
    description: dto.description ?? undefined,
    status: toTaskStatus(dto.status),
    priority: toTaskPriority(dto.priority),
    dueDate: dto.dueDate ?? undefined,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

@Resolver()
export class TasksResolver {
  constructor(private readonly backends: BackendContractsService) {}

  @Query(() => TasksPageGql)
  @UseGuards(GqlJwtGuard)
  async tasks(
    @Args('page', { type: () => Int, nullable: true }) page?: number,
    @Args('pageSize', { type: () => Int, nullable: true }) pageSize?: number,
    @Args('status', { type: () => TaskStatusGql, nullable: true }) status?: TaskStatusGql,
    @Args('priority', { type: () => TaskPriorityGql, nullable: true }) priority?: TaskPriorityGql,
    @Args('q', { nullable: true }) q?: string,
  ): Promise<TasksPageGql> {
    const res = await this.backends.task.GET('/api/tasks', {
      params: {
        query: {
          Page: page,
          PageSize: pageSize,
          Status: status as unknown as never,
          Priority: priority as unknown as never,
          Q: q,
        },
      },
    });
    const data = unwrapOrThrow(res);
    const items = data.items.map(mapTask);
    return {
      items,
      page: Number(data.page),
      pageSize: Number(data.pageSize),
      totalItems: Number(data.totalItems),
      totalPages: Number(data.totalPages ?? 0),
    };
  }

  @Query(() => TaskGql, { nullable: true })
  @UseGuards(GqlJwtGuard)
  async task(@Args('id') id: string) {
    const res = await this.backends.task.GET('/api/tasks/{id}', {
      params: { path: { id } },
    });
    if (res.error) return null;
    const dto = unwrapOrThrow(res);
    return mapTask(dto);
  }

  @Mutation(() => TaskGql)
  @UseGuards(GqlJwtGuard)
  async createTask(@Args('input', { type: () => CreateTaskInputGql }) input: CreateTaskInputGql) {
    const res = await this.backends.task.POST('/api/tasks', {
      body: {
        title: input.title,
        description: input.description ?? null,
        status: (input.status ?? null) as unknown as never,
        priority: (input.priority ?? null) as unknown as never,
        dueDate: input.dueDate ?? null,
      },
    });
    const dto = unwrapOrThrow(res);
    return mapTask(dto);
  }

  @Mutation(() => TaskGql)
  @UseGuards(GqlJwtGuard)
  async updateTask(
    @Args('id') id: string,
    @Args('input', { type: () => UpdateTaskInputGql }) input: UpdateTaskInputGql,
  ) {
    const res = await this.backends.task.PUT('/api/tasks/{id}', {
      params: { path: { id } },
      body: {
        title: input.title,
        description: input.description ?? null,
        status: input.status as unknown as never,
        priority: input.priority as unknown as never,
        dueDate: input.dueDate ?? null,
      },
    });
    const dto = unwrapOrThrow(res);
    return mapTask(dto);
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlJwtGuard)
  async deleteTask(@Args('id') id: string) {
    const res = await this.backends.task.DELETE('/api/tasks/{id}', {
      params: { path: { id } },
    });
    if (res.error) return false;
    unwrapOrThrow(res);
    return true;
  }
}
