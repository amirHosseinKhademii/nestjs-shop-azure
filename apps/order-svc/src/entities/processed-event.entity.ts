import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity({ name: 'processed_events' })
export class ProcessedEvent {
  /** Idempotency key: correlationId or Service Bus message id */
  @PrimaryColumn()
  id!: string;

  @Column({ nullable: true })
  orderId?: string;

  @CreateDateColumn()
  processedAt!: Date;
}
