import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { Redis } from 'ioredis';
import { randomUUID } from 'crypto';
import { Product, ProductDocument } from './schemas/product.schema';
import { CreateProductDto } from './dto/create-product.dto';
import { REDIS_CLIENT } from './redis/redis.module';

const CART_TTL_SEC = 60 * 60 * 24 * 7;

@Injectable()
export class ShopService {
  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async listProducts(): Promise<ProductDocument[]> {
    return this.productModel.find().exec();
  }

  async getProduct(id: string): Promise<ProductDocument> {
    const p = await this.productModel.findById(id).exec();
    if (!p) throw new NotFoundException('Product not found');
    return p;
  }

  async createProduct(dto: CreateProductDto): Promise<ProductDocument> {
    const doc = new this.productModel({
      name: dto.name,
      description: dto.description,
      priceCents: dto.priceCents,
      stock: dto.stock ?? 0,
    });
    return doc.save();
  }

  private cartKey(userId: string) {
    return `cart:${userId}`;
  }

  async getCart(userId: string): Promise<{ items: { productId: string; qty: number }[] }> {
    const raw = await this.redis.get(this.cartKey(userId));
    if (!raw) return { items: [] };
    try {
      const parsed = JSON.parse(raw) as { items: { productId: string; qty: number }[] };
      return parsed;
    } catch {
      return { items: [] };
    }
  }

  async addToCart(userId: string, productId: string, qty: number) {
    if (qty < 1) throw new BadRequestException('qty must be >= 1');
    await this.getProduct(productId);
    const cart = await this.getCart(userId);
    const idx = cart.items.findIndex((i) => i.productId === productId);
    if (idx >= 0) cart.items[idx].qty += qty;
    else cart.items.push({ productId, qty });
    await this.redis.set(this.cartKey(userId), JSON.stringify(cart), 'EX', CART_TTL_SEC);
    return cart;
  }

  async clearCart(userId: string): Promise<void> {
    await this.redis.del(this.cartKey(userId));
  }

  /** Snapshot for checkout event. */
  async buildCheckoutPayload(userId: string, correlationId: string) {
    const cart = await this.getCart(userId);
    if (!cart.items.length) throw new BadRequestException('Cart is empty');
    const productIds: string[] = [];
    const quantities: number[] = [];
    for (const line of cart.items) {
      productIds.push(line.productId);
      quantities.push(line.qty);
    }
    const cartId = randomUUID();
    return {
      correlationId,
      userId,
      cartId,
      productIds,
      quantities,
    };
  }
}
