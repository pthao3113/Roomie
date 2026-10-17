import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ConfirmationsService } from './confirmations.service.js';
import { ConfirmationTargetParamDto } from './dto/confirmation-target-param.dto.js';
import { QueryMyConfirmationsDto } from './dto/query-my-confirmations.dto.js';
import { COMMUNITY_CONFIG } from './community.config.js';

const execOf = (value: any) => ({ exec: vi.fn().mockResolvedValue(value) });

describe('ConfirmationsService (Migration 4 - LU1 Community Confirmation)', () => {
  let service: ConfirmationsService;
  let confirmationModel: any;
  let propertyModel: any;
  let rentalUnitModel: any;

  const creatorId = new Types.ObjectId();
  const userId = new Types.ObjectId().toString();
  const propertyId = new Types.ObjectId();
  const unitId = new Types.ObjectId();

  const propertyDoc = { _id: propertyId, createdBy: creatorId, deletedAt: null };
  const unitDoc = {
    _id: unitId,
    propertyId,
    createdBy: creatorId,
    deletedAt: null,
  };

  const makeSavedConfirmation = (targetType: string, targetId: Types.ObjectId) => ({
    _id: new Types.ObjectId(),
    userId: new Types.ObjectId(userId),
    targetType,
    targetId,
    propertyId,
    createdAt: new Date('2026-10-16T00:00:00Z'),
    deletedAt: null,
  });

  beforeEach(() => {
    confirmationModel = {
      create: vi.fn(),
      countDocuments: vi.fn().mockReturnValue(execOf(0)),
      findOneAndUpdate: vi.fn(),
      aggregate: vi.fn(),
      find: vi.fn(),
    };
    propertyModel = { findOne: vi.fn().mockReturnValue(execOf(propertyDoc)) };
    rentalUnitModel = { findOne: vi.fn().mockReturnValue(execOf(unitDoc)) };

    service = new ConfirmationsService(confirmationModel, propertyModel, rentalUnitModel);
  });

  describe('Validation (DTOs and ids)', () => {
    it('param DTO accepts a valid ObjectId and rejects invalid ones', async () => {
      const ok = plainToInstance(ConfirmationTargetParamDto, {
        id: propertyId.toString(),
      });
      expect(await validate(ok)).toHaveLength(0);

      const bad = plainToInstance(ConfirmationTargetParamDto, { id: 'not-an-id' });
      expect((await validate(bad)).length).toBeGreaterThan(0);
    });

    it('query DTO applies defaults and accepts valid pagination', async () => {
      const dto = plainToInstance(QueryMyConfirmationsDto, { page: '2', limit: '20' });
      expect(await validate(dto)).toHaveLength(0);
      expect(dto.page).toBe(2);
      expect(dto.limit).toBe(20);

      const defaults = plainToInstance(QueryMyConfirmationsDto, {});
      expect(defaults.page).toBe(1);
      expect(defaults.limit).toBe(COMMUNITY_CONFIG.pagination.defaultLimit);
    });

    it('query DTO rejects page < 1, limit > max, and non-integers', async () => {
      const cases = [
        { page: 0 },
        { limit: COMMUNITY_CONFIG.pagination.maxLimit + 1 },
        { limit: 0 },
        { page: 1.5 },
        { page: 'abc' },
      ];
      for (const c of cases) {
        const dto = plainToInstance(QueryMyConfirmationsDto, c);
        expect((await validate(dto)).length).toBeGreaterThan(0);
      }
    });

    it('service rejects invalid ObjectIds with 400', async () => {
      await expect(service.confirmProperty('bad', userId)).rejects.toThrow(BadRequestException);
      await expect(service.confirmRentalUnit('bad', userId)).rejects.toThrow(BadRequestException);
      await expect(service.getPropertySummary('bad')).rejects.toThrow(BadRequestException);
      await expect(service.withdrawPropertyConfirmation('bad', userId)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.withdrawRentalUnitConfirmation('bad', userId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('Create confirmation', () => {
    it('creates a Property confirmation and does not expose userId', async () => {
      confirmationModel.create.mockResolvedValueOnce(
        makeSavedConfirmation('property', propertyId),
      );

      const result = await service.confirmProperty(propertyId.toString(), userId);

      expect(confirmationModel.create).toHaveBeenCalledTimes(1);
      const arg = confirmationModel.create.mock.calls[0][0];
      expect(arg.targetType).toBe('property');
      expect(arg.targetId.equals(propertyId)).toBe(true);
      expect(arg.deletedAt).toBeNull();
      expect(result.targetType).toBe('property');
      expect(result.targetId).toBe(propertyId.toString());
      expect(result).not.toHaveProperty('userId');
      expect(JSON.stringify(result)).not.toContain(userId);
    });

    it('creates a RentalUnit confirmation with its propertyId', async () => {
      confirmationModel.create.mockResolvedValueOnce(
        makeSavedConfirmation('rental_unit', unitId),
      );

      const result = await service.confirmRentalUnit(unitId.toString(), userId);

      const arg = confirmationModel.create.mock.calls[0][0];
      expect(arg.targetType).toBe('rental_unit');
      expect(arg.propertyId.equals(propertyId)).toBe(true);
      expect(result.targetType).toBe('rental_unit');
    });

    it('forbids the creator from confirming their own Property', async () => {
      await expect(
        service.confirmProperty(propertyId.toString(), creatorId.toString()),
      ).rejects.toThrow(ForbiddenException);
      expect(confirmationModel.create).not.toHaveBeenCalled();
    });

    it('forbids the creator from confirming their own RentalUnit', async () => {
      await expect(
        service.confirmRentalUnit(unitId.toString(), creatorId.toString()),
      ).rejects.toThrow(ForbiddenException);
      expect(confirmationModel.create).not.toHaveBeenCalled();
    });

    it('rejects confirming a missing or soft-deleted Property (404)', async () => {
      propertyModel.findOne.mockReturnValueOnce(execOf(null));
      await expect(service.confirmProperty(propertyId.toString(), userId)).rejects.toThrow(
        NotFoundException,
      );
      expect(propertyModel.findOne).toHaveBeenCalledWith({
        _id: propertyId.toString(),
        deletedAt: null,
      });
    });

    it('rejects confirming a missing or soft-deleted RentalUnit (404)', async () => {
      rentalUnitModel.findOne.mockReturnValueOnce(execOf(null));
      await expect(service.confirmRentalUnit(unitId.toString(), userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects confirming a RentalUnit whose parent Property is deleted (404)', async () => {
      propertyModel.findOne.mockReturnValueOnce(execOf(null));
      await expect(service.confirmRentalUnit(unitId.toString(), userId)).rejects.toThrow(
        NotFoundException,
      );
      expect(confirmationModel.create).not.toHaveBeenCalled();
    });

    it('maps E11000 (duplicate active confirmation) to 409 Conflict', async () => {
      confirmationModel.create.mockRejectedValueOnce({ code: 11000 });
      await expect(service.confirmProperty(propertyId.toString(), userId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('rethrows unexpected database errors', async () => {
      const err = new Error('boom');
      confirmationModel.create.mockRejectedValueOnce(err);
      await expect(service.confirmProperty(propertyId.toString(), userId)).rejects.toBe(err);
    });
  });

  describe('Rate limit (20 creations / user / 24h, from MongoDB)', () => {
    it('counts ALL records of the user in the window, including withdrawn ones', async () => {
      confirmationModel.create.mockResolvedValueOnce(
        makeSavedConfirmation('property', propertyId),
      );
      const before = Date.now();

      await service.confirmProperty(propertyId.toString(), userId);

      const filter = confirmationModel.countDocuments.mock.calls[0][0];
      expect(filter.userId.toString()).toBe(userId);
      // Must NOT exclude soft-deleted records, otherwise withdraw + re-confirm bypasses the limit
      expect(filter).not.toHaveProperty('deletedAt');
      const sinceMs = filter.createdAt.$gte.getTime();
      expect(sinceMs).toBeGreaterThanOrEqual(before - COMMUNITY_CONFIG.rateLimit.windowMs - 1000);
      expect(sinceMs).toBeLessThanOrEqual(Date.now() - COMMUNITY_CONFIG.rateLimit.windowMs + 1000);
    });

    it('uses the centralized limit of 20 over 24 hours', () => {
      expect(COMMUNITY_CONFIG.rateLimit.confirmationsPerWindow).toBe(20);
      expect(COMMUNITY_CONFIG.rateLimit.windowMs).toBe(24 * 60 * 60 * 1000);
    });

    it('allows the 20th creation (19 existing)', async () => {
      confirmationModel.countDocuments.mockReturnValueOnce(execOf(19));
      confirmationModel.create.mockResolvedValueOnce(
        makeSavedConfirmation('property', propertyId),
      );
      await expect(
        service.confirmProperty(propertyId.toString(), userId),
      ).resolves.toBeDefined();
    });

    it('returns 429 when 20 creations already exist in the window', async () => {
      confirmationModel.countDocuments.mockReturnValueOnce(execOf(20));

      await expect(
        service.confirmProperty(propertyId.toString(), userId),
      ).rejects.toMatchObject({ status: 429 });
      expect(confirmationModel.create).not.toHaveBeenCalled();
    });

    it('429 is an HttpException', async () => {
      confirmationModel.countDocuments.mockReturnValueOnce(execOf(25));
      await expect(service.confirmRentalUnit(unitId.toString(), userId)).rejects.toBeInstanceOf(
        HttpException,
      );
    });
  });

  describe('Withdrawal and re-confirmation', () => {
    it('soft-deletes only the caller\'s own active confirmation', async () => {
      confirmationModel.findOneAndUpdate.mockReturnValueOnce(
        execOf({ _id: new Types.ObjectId() }),
      );

      const result = await service.withdrawPropertyConfirmation(propertyId.toString(), userId);

      const [filter, update] = confirmationModel.findOneAndUpdate.mock.calls[0];
      expect(filter.userId.toString()).toBe(userId);
      expect(filter.targetType).toBe('property');
      expect(filter.targetId.equals(propertyId)).toBe(true);
      expect(filter.deletedAt).toBeNull();
      expect(update.$set.deletedAt).toBeInstanceOf(Date);
      expect(result.targetType).toBe('property');
      expect(result.withdrawnAt).toBeInstanceOf(Date);
    });

    it('withdraws a RentalUnit confirmation', async () => {
      confirmationModel.findOneAndUpdate.mockReturnValueOnce(
        execOf({ _id: new Types.ObjectId() }),
      );
      const result = await service.withdrawRentalUnitConfirmation(unitId.toString(), userId);
      expect(result.targetType).toBe('rental_unit');
      expect(confirmationModel.findOneAndUpdate.mock.calls[0][0].targetType).toBe('rental_unit');
    });

    it('returns 404 when there is no active confirmation to withdraw', async () => {
      confirmationModel.findOneAndUpdate.mockReturnValueOnce(execOf(null));
      await expect(
        service.withdrawPropertyConfirmation(propertyId.toString(), userId),
      ).rejects.toThrow(NotFoundException);
    });

    it('allows re-confirming after withdrawal by inserting a NEW record that is still rate-limit counted', async () => {
      confirmationModel.create
        .mockResolvedValueOnce(makeSavedConfirmation('property', propertyId))
        .mockResolvedValueOnce(makeSavedConfirmation('property', propertyId));
      confirmationModel.findOneAndUpdate.mockReturnValueOnce(
        execOf({ _id: new Types.ObjectId() }),
      );
      // 1st create: 0 existing; withdrawn record then counts as 1 for the 2nd create
      confirmationModel.countDocuments
        .mockReturnValueOnce(execOf(0))
        .mockReturnValueOnce(execOf(1));

      await service.confirmProperty(propertyId.toString(), userId);
      await service.withdrawPropertyConfirmation(propertyId.toString(), userId);
      await service.confirmProperty(propertyId.toString(), userId);

      expect(confirmationModel.create).toHaveBeenCalledTimes(2);
      // The withdrawal never reactivates/hard-deletes: it only sets deletedAt
      const update = confirmationModel.findOneAndUpdate.mock.calls[0][1];
      expect(Object.keys(update)).toEqual(['$set']);
      expect(Object.keys(update.$set)).toEqual(['deletedAt']);
      // Both rate-limit checks counted without a deletedAt filter
      for (const call of confirmationModel.countDocuments.mock.calls) {
        expect(call[0]).not.toHaveProperty('deletedAt');
      }
    });

    it('toggling cannot exceed the limit: 20 records (incl. withdrawn) block the next create', async () => {
      confirmationModel.countDocuments.mockReturnValueOnce(execOf(20));
      await expect(
        service.confirmProperty(propertyId.toString(), userId),
      ).rejects.toMatchObject({ status: 429 });
    });
  });

  describe('Public summary', () => {
    it('counts only active confirmations from active (non-deactivated, non-deleted) users', async () => {
      confirmationModel.aggregate.mockReturnValueOnce(execOf([{ count: 3 }]));

      const result = await service.getPropertySummary(propertyId.toString());

      const pipeline = confirmationModel.aggregate.mock.calls[0][0];
      expect(pipeline[0].$match).toMatchObject({ targetType: 'property', deletedAt: null });
      expect(pipeline[0].$match.targetId.equals(propertyId)).toBe(true);
      const lookup = pipeline[1].$lookup;
      expect(lookup.from).toBe('users');
      expect(lookup.pipeline[0].$match).toEqual({ deletedAt: null, deactivatedAt: null });
      expect(pipeline[2].$match).toEqual({ 'activeUser.0': { $exists: true } });
      expect(pipeline[3]).toEqual({ $count: 'count' });

      expect(result).toEqual({
        targetType: 'property',
        targetId: propertyId.toString(),
        confirmationCount: 3,
      });
    });

    it('returns 0 when there are no qualifying confirmations', async () => {
      confirmationModel.aggregate.mockReturnValueOnce(execOf([]));
      const result = await service.getRentalUnitSummary(unitId.toString());
      expect(result.confirmationCount).toBe(0);
      expect(result.targetType).toBe('rental_unit');
    });

    it('does not expose user identity or rating fields', async () => {
      confirmationModel.aggregate.mockReturnValueOnce(execOf([{ count: 1 }]));
      const result: any = await service.getPropertySummary(propertyId.toString());
      expect(Object.keys(result).sort()).toEqual(['confirmationCount', 'targetId', 'targetType']);
      expect(result).not.toHaveProperty('averageRating');
      expect(result).not.toHaveProperty('reviewCount');
      expect(result).not.toHaveProperty('verified');
    });

    it('returns 404 for a deleted target', async () => {
      propertyModel.findOne.mockReturnValueOnce(execOf(null));
      await expect(service.getPropertySummary(propertyId.toString())).rejects.toThrow(
        NotFoundException,
      );
      expect(confirmationModel.aggregate).not.toHaveBeenCalled();
    });
  });

  describe('GET /me/confirmations', () => {
    const buildFindChain = (items: any[]) => {
      const chain: any = {
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(items),
      };
      confirmationModel.find.mockReturnValueOnce(chain);
      return chain;
    };

    it('returns only the caller\'s active confirmations with pagination', async () => {
      const chain = buildFindChain([
        makeSavedConfirmation('property', propertyId),
        makeSavedConfirmation('rental_unit', unitId),
      ]);
      confirmationModel.countDocuments.mockReturnValueOnce(execOf(25));

      const result = await service.getMyConfirmations(userId, { page: 2, limit: 10 });

      const filter = confirmationModel.find.mock.calls[0][0];
      expect(filter.userId.toString()).toBe(userId);
      expect(filter.deletedAt).toBeNull();
      expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(chain.skip).toHaveBeenCalledWith(10);
      expect(chain.limit).toHaveBeenCalledWith(10);
      expect(result.data).toHaveLength(2);
      expect(result.pagination).toEqual({ page: 2, limit: 10, total: 25, totalPages: 3 });
      expect(JSON.stringify(result)).not.toContain('userId');
    });

    it('uses defaults and caps limit at the configured maximum', async () => {
      const chain = buildFindChain([]);
      confirmationModel.countDocuments.mockReturnValueOnce(execOf(0));

      const result = await service.getMyConfirmations(userId, { limit: 500 });

      expect(chain.limit).toHaveBeenCalledWith(COMMUNITY_CONFIG.pagination.maxLimit);
      expect(chain.skip).toHaveBeenCalledWith(0);
      expect(result.pagination.totalPages).toBe(0);
    });
  });
});
