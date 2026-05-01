import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Order } from './order.entity';

@Entity({ name: 'order_lines' })
export class OrderLine {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Order, (o) => o.lines, { onDelete: 'CASCADE' })
  order!: Order;

  @Column()
  productId!: string;

  @Column({ type: 'int' })
  quantity!: number;

  /** Snapshot price in cents at order time */
  @Column({ type: 'int', default: 0 })
  priceCents!: number;
}
