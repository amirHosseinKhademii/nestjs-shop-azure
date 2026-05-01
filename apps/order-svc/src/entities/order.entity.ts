import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { OrderLine } from './order-line.entity';

@Entity({ name: 'orders' })
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  userId!: string;

  @Column()
  cartId!: string;

  @Column({ unique: true })
  correlationId!: string;

  @Column({ default: 'pending' })
  status!: string;

  @OneToMany(() => OrderLine, (l) => l.order, { cascade: true })
  lines!: OrderLine[];

  @CreateDateColumn()
  createdAt!: Date;
}
