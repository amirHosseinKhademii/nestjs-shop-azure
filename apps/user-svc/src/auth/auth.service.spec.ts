import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { User } from '../entities/user.entity';

describe('AuthService', () => {
  let service: AuthService;
  const mockUsers = {
    findOne: jest.fn(),
    create: jest.fn((u: Partial<User>) => ({ id: 'user-1', ...u })),
    save: jest.fn(async (u: User) => u),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: mockUsers },
        { provide: JwtService, useValue: { sign: jest.fn().mockReturnValue('test-jwt') } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('15m') } },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('register saves new user and returns accessToken', async () => {
    mockUsers.findOne.mockResolvedValue(null);
    const out = await service.register({
      email: 'new@example.com',
      password: 'password12',
    });
    expect(out.accessToken).toBe('test-jwt');
    expect(out.user.email).toBe('new@example.com');
    expect(mockUsers.save).toHaveBeenCalled();
  });

  it('register throws when email already exists', async () => {
    mockUsers.findOne.mockResolvedValue({ id: 'existing' });
    await expect(
      service.register({ email: 'taken@example.com', password: 'password12' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(mockUsers.save).not.toHaveBeenCalled();
  });
});
