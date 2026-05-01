import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('live returns ok', () => {
    const controller = new HealthController();
    expect(controller.live()).toEqual({ status: 'ok' });
  });

  it('ready returns ok', () => {
    const controller = new HealthController();
    expect(controller.ready()).toEqual({ status: 'ok' });
  });
});
