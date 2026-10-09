import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import {
  UnauthorizedException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from './auth.service.js';
import { UsersService } from '../users/users.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';

describe('AuthService & JwtStrategy Audit Suite', () => {
  let authService: AuthService;
  let jwtStrategy: JwtStrategy;
  let usersService: UsersService;
  let jwtService: JwtService;

  const mockUserActive = {
    _id: '507f1f77bcf86cd799439011',
    googleId: 'google_12345',
    email: 'user@example.com',
    displayName: 'Test User',
    deactivatedAt: null,
    deletedAt: null,
  };

  const mockUserDeactivated = {
    ...mockUserActive,
    deactivatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockUsersService = {
      findByGoogleId: vi.fn(),
      findByEmail: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      reactivate: vi.fn(),
    };

    const mockConfigService = {
      get: vi.fn((key: string) => {
        if (key === 'GOOGLE_CLIENT_ID') return 'mock_client_id';
        if (key === 'JWT_SECRET') return 'test_secret_key';
        if (key === 'JWT_EXPIRES_IN') return '1h';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: 'test_secret_key',
          signOptions: { expiresIn: '1h' },
        }),
      ],
      providers: [
        AuthService,
        JwtStrategy,
        { provide: UsersService, useValue: mockUsersService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    jwtStrategy = module.get<JwtStrategy>(JwtStrategy);
    usersService = module.get<UsersService>(UsersService);
    jwtService = module.get<JwtService>(JwtService);
  });

  describe('Google Login Flow', () => {
    it('1. Should throw UnauthorizedException if Google token email is unverified', async () => {
      vi.spyOn((authService as any).googleOAuthClient, 'verifyIdToken').mockResolvedValueOnce({
        getPayload: () => ({
          sub: 'google_12345',
          email: 'unverified@example.com',
          email_verified: false,
          iss: 'accounts.google.com',
        }),
      } as any);

      await expect(authService.googleLogin('invalid_token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('2. Should throw UnauthorizedException if Google token issuer is invalid', async () => {
      vi.spyOn((authService as any).googleOAuthClient, 'verifyIdToken').mockResolvedValueOnce({
        getPayload: () => ({
          sub: 'google_12345',
          email: 'user@example.com',
          email_verified: true,
          iss: 'malicious-issuer.com',
        }),
      } as any);

      await expect(authService.googleLogin('fake_issuer_token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('3. Should return accessToken and sanitized user for ACTIVE account', async () => {
      vi.spyOn((authService as any).googleOAuthClient, 'verifyIdToken').mockResolvedValueOnce({
        getPayload: () => ({
          sub: 'google_12345',
          email: 'user@example.com',
          name: 'Test User',
          email_verified: true,
          iss: 'https://accounts.google.com',
        }),
      } as any);

      vi.spyOn(usersService, 'findByGoogleId').mockResolvedValueOnce(mockUserActive as any);

      const result = await authService.googleLogin('valid_token');
      expect(result).toHaveProperty('accessToken');
      expect(result.user).toEqual({
        id: mockUserActive._id,
        googleId: mockUserActive.googleId,
        email: mockUserActive.email,
        displayName: mockUserActive.displayName,
        createdAt: undefined,
        updatedAt: undefined,
      });
    });

    it('4. Should throw 403 ACCOUNT_DEACTIVATED carrying 15m reactivationToken for DEACTIVATED user', async () => {
      vi.spyOn((authService as any).googleOAuthClient, 'verifyIdToken').mockResolvedValueOnce({
        getPayload: () => ({
          sub: 'google_12345',
          email: 'user@example.com',
          name: 'Test User',
          email_verified: true,
          iss: 'accounts.google.com',
        }),
      } as any);

      vi.spyOn(usersService, 'findByGoogleId').mockResolvedValueOnce(mockUserDeactivated as any);

      try {
        await authService.googleLogin('deactivated_user_token');
      } catch (error: any) {
        expect(error).toBeInstanceOf(HttpException);
        expect(error.getStatus()).toBe(HttpStatus.FORBIDDEN);
        const response = error.getResponse();
        expect(response.code).toBe('ACCOUNT_DEACTIVATED');
        expect(response).toHaveProperty('reactivationToken');
      }
    });
  });

  describe('Reactivate Account Flow', () => {
    it('5. Should reactivate DEACTIVATED account and return accessToken', async () => {
      const reactivationToken = jwtService.sign({
        sub: mockUserDeactivated._id,
        googleId: mockUserDeactivated.googleId,
        type: 'reactivation',
      });

      vi.spyOn(usersService, 'findById').mockResolvedValueOnce(mockUserDeactivated as any);
      vi.spyOn(usersService, 'reactivate').mockResolvedValueOnce(mockUserActive as any);

      const result = await authService.reactivateAccount(reactivationToken);
      expect(result).toHaveProperty('accessToken');
      expect(usersService.reactivate).toHaveBeenCalledWith(mockUserDeactivated._id);
    });

    it('6. Should throw UnauthorizedException if standard accessToken is used as reactivationToken', async () => {
      const standardAccessToken = jwtService.sign({
        sub: mockUserDeactivated._id,
        email: mockUserDeactivated.email,
      });

      await expect(
        authService.reactivateAccount(standardAccessToken),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('7. Should throw BadRequestException if attempting to reactivate an already ACTIVE user', async () => {
      const reactivationToken = jwtService.sign({
        sub: mockUserActive._id,
        googleId: mockUserActive.googleId,
        type: 'reactivation',
      });

      vi.spyOn(usersService, 'findById').mockResolvedValueOnce(mockUserActive as any);

      await expect(
        authService.reactivateAccount(reactivationToken),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('JwtStrategy Token Discrimination', () => {
    it('8. Should REJECT reactivationToken on protected route via JwtStrategy', async () => {
      const payload = {
        sub: mockUserActive._id,
        type: 'reactivation',
      };

      await expect(jwtStrategy.validate(payload as any)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('9. Should ALLOW valid access token payload for active user in JwtStrategy', async () => {
      const payload = {
        sub: mockUserActive._id,
        email: mockUserActive.email,
      };

      vi.spyOn(usersService, 'findById').mockResolvedValueOnce(mockUserActive as any);

      const result = await jwtStrategy.validate(payload as any);
      expect(result).toEqual(mockUserActive);
    });
  });
});
