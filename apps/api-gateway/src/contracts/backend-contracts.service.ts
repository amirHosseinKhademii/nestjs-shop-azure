import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createUserSvcClient, type UserSvcOpenApiClient } from '@shop/user-svc-contract';
import { createShopSvcClient, type ShopSvcOpenApiClient } from '@shop/shop-svc-contract';
import { createOrderSvcClient, type OrderSvcOpenApiClient } from '@shop/order-svc-contract';
import { createTaskSvcClient, type TaskSvcOpenApiClient } from '@shop/task-svc-contract';
import {
  createManagementSvcClient,
  type ManagementSvcOpenApiClient,
} from '@shop/management-svc-contract';

@Injectable()
export class BackendContractsService {
  private userClient?: UserSvcOpenApiClient;
  private shopClient?: ShopSvcOpenApiClient;
  private orderClient?: OrderSvcOpenApiClient;
  private taskClient?: TaskSvcOpenApiClient;
  private managementClient?: ManagementSvcOpenApiClient;

  constructor(private readonly config: ConfigService) {}

  private get userBase() {
    return this.config.get('USER_SVC_URL', 'http://localhost:3001');
  }
  private get shopBase() {
    return this.config.get('SHOP_SVC_URL', 'http://localhost:3002');
  }
  private get orderBase() {
    return this.config.get('ORDER_SVC_URL', 'http://localhost:3003');
  }
  private get taskBase() {
    return this.config.get('TASK_SVC_URL', 'http://localhost:3004');
  }
  private get managementBase() {
    return this.config.get('MANAGEMENT_SVC_URL', 'http://localhost:3010');
  }

  get user() {
    return (this.userClient ??= createUserSvcClient(this.userBase));
  }
  get shop() {
    return (this.shopClient ??= createShopSvcClient(this.shopBase));
  }
  get order() {
    return (this.orderClient ??= createOrderSvcClient(this.orderBase));
  }
  get task() {
    return (this.taskClient ??= createTaskSvcClient(this.taskBase));
  }
  get management(): ManagementSvcOpenApiClient {
    return (this.managementClient ??= createManagementSvcClient(this.managementBase));
  }
}
