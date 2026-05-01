import { HttpException, Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class BackendHttpService {
  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  private internalHeaders(extra?: Record<string, string>, correlationId?: string) {
    return {
      'x-internal-key': this.config.get('INTERNAL_API_KEY', 'dev-internal-key'),
      ...(correlationId ? { 'x-correlation-id': correlationId } : {}),
      ...extra,
    };
  }

  /** Maps user/shop/order HTTP errors into Nest exceptions so GraphQL surfaces the message. */
  private upstreamError(e: unknown): never {
    if (!(e instanceof AxiosError) || !e.response) throw e;
    const { status, data } = e.response;
    const body = data as { message?: string | string[] };
    const message = Array.isArray(body?.message)
      ? body.message.join(', ')
      : typeof body?.message === 'string'
        ? body.message
        : e.message;
    throw new HttpException(message, status);
  }

  get userBase() {
    return this.config.get('USER_SVC_URL', 'http://localhost:3001');
  }
  get shopBase() {
    return this.config.get('SHOP_SVC_URL', 'http://localhost:3002');
  }
  get orderBase() {
    return this.config.get('ORDER_SVC_URL', 'http://localhost:3003');
  }

  async register(
    body: { email: string; password: string; displayName?: string },
    correlationId?: string,
  ) {
    try {
      const { data } = await firstValueFrom(
        this.http.post(`${this.userBase}/auth/register`, body, {
          headers: this.internalHeaders(undefined, correlationId),
        }),
      );
      return data;
    } catch (e) {
      this.upstreamError(e);
    }
  }

  async login(body: { email: string; password: string }, correlationId?: string) {
    try {
      const { data } = await firstValueFrom(
        this.http.post(`${this.userBase}/auth/login`, body, {
          headers: this.internalHeaders(undefined, correlationId),
        }),
      );
      return data;
    } catch (e) {
      this.upstreamError(e);
    }
  }

  async me(authHeader: string | undefined, correlationId?: string) {
    const { data } = await firstValueFrom(
      this.http.get(`${this.userBase}/auth/me`, {
        headers: this.internalHeaders(
          {
            Authorization: authHeader ?? '',
          },
          correlationId,
        ),
      }),
    );
    return data;
  }

  async products(correlationId?: string) {
    const { data } = await firstValueFrom(
      this.http.get(`${this.shopBase}/products`, {
        headers: this.internalHeaders(undefined, correlationId),
      }),
    );
    return data;
  }

  async createProduct(
    body: { name: string; description?: string; priceCents: number; stock?: number },
    correlationId?: string,
  ) {
    const { data } = await firstValueFrom(
      this.http.post(`${this.shopBase}/products`, body, {
        headers: this.internalHeaders(undefined, correlationId),
      }),
    );
    return data;
  }

  async cart(userId: string, correlationId?: string) {
    const { data } = await firstValueFrom(
      this.http.get(`${this.shopBase}/cart`, {
        headers: this.internalHeaders(
          {
            'x-user-id': userId,
          },
          correlationId,
        ),
      }),
    );
    return data;
  }

  async addToCart(
    userId: string,
    body: { productId: string; qty: number },
    correlationId?: string,
  ) {
    const { data } = await firstValueFrom(
      this.http.post(`${this.shopBase}/cart/items`, body, {
        headers: this.internalHeaders(
          {
            'x-user-id': userId,
          },
          correlationId,
        ),
      }),
    );
    return data;
  }

  async checkout(userId: string, correlationId?: string) {
    const { data } = await firstValueFrom(
      this.http.post(
        `${this.shopBase}/checkout`,
        {},
        {
          headers: this.internalHeaders(
            {
              'x-user-id': userId,
            },
            correlationId,
          ),
        },
      ),
    );
    return data;
  }

  async orders(userId: string, correlationId?: string) {
    const { data } = await firstValueFrom(
      this.http.get(`${this.orderBase}/orders`, {
        headers: this.internalHeaders(
          {
            'x-user-id': userId,
          },
          correlationId,
        ),
      }),
    );
    return data;
  }

  async order(userId: string, id: string, correlationId?: string) {
    try {
      const res = await firstValueFrom(
        this.http.get(`${this.orderBase}/orders/${id}`, {
          headers: this.internalHeaders(
            {
              'x-user-id': userId,
            },
            correlationId,
          ),
          validateStatus: () => true,
        }),
      );
      if (res.status === 404) return null;
      return res.data;
    } catch {
      return null;
    }
  }
}
