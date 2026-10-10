import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RentalUnitsService } from './rental-units.service.js';
import { Property } from './schemas/property.schema.js';
import { RentalUnit, normalizeUnitName } from './schemas/rental-unit.schema.js';

describe('RentalUnitsService Unit Suite (LU3 RentalUnit Management)', () => {
  let service: RentalUnitsService;
  let mockPropertyModel: any;
  let mockRentalUnitModel: any;

  const validPropId = '507f1f77bcf86cd799439011';
  const validUnitId = '507f1f77bcf86cd799439022';
  const ownerUserId = '507f1f77bcf86cd799439033';
  const otherUserId = '507f1f77bcf86cd799439044';

  const mockActiveProperty = {
    _id: validPropId,
    name: 'Nhà trọ Sunset',
    deletedAt: null,
  };

  const mockActiveRentalUnit = {
    _id: validUnitId,
    propertyId: validPropId,
    unitName: 'Phòng 101 A',
    normalizedUnitName: 'phòng 101 a',
    price: 3500000,
    area: 25,
    createdBy: {
      equals: (id: string) => id === ownerUserId,
    },
    deletedAt: null,
    save: vi.fn(),
  };

  beforeEach(async () => {
    mockPropertyModel = {
      findOne: vi.fn().mockReturnThis(),
      exec: vi.fn(),
    };

    function MockRentalUnitModel(this: any, dto: any) {
      Object.assign(this, dto);
    }

    MockRentalUnitModel.prototype.save = vi.fn().mockImplementation(function (this: any) {
      return Promise.resolve({ _id: validUnitId, ...this });
    });

    MockRentalUnitModel.find = vi.fn().mockReturnThis();
    MockRentalUnitModel.findById = vi.fn().mockReturnThis();
    MockRentalUnitModel.findOne = vi.fn().mockReturnThis();
    MockRentalUnitModel.sort = vi.fn().mockReturnThis();
    MockRentalUnitModel.exec = vi.fn();

    mockRentalUnitModel = MockRentalUnitModel;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RentalUnitsService,
        {
          provide: getModelToken(Property.name),
          useValue: mockPropertyModel,
        },
        {
          provide: getModelToken(RentalUnit.name),
          useValue: mockRentalUnitModel,
        },
      ],
    }).compile();

    service = module.get<RentalUnitsService>(RentalUnitsService);
  });

  describe('normalizeUnitName Helper', () => {
    it('1. Should trim, collapse multiple spaces, and lowercase unit name', () => {
      expect(normalizeUnitName('  Phòng   101 A ')).toBe('phòng 101 a');
      expect(normalizeUnitName('P. 202-B  ')).toBe('p. 202-b');
      expect(normalizeUnitName('')).toBe('');
    });
  });

  describe('createRentalUnit', () => {
    it('2. Should throw BadRequestException for invalid propertyId', async () => {
      await expect(
        service.createRentalUnit('invalid-id', ownerUserId, {
          unitName: 'Phòng 101',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('3. Should throw NotFoundException if property does not exist or is soft-deleted', async () => {
      vi.spyOn(mockPropertyModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(null),
      } as any);

      await expect(
        service.createRentalUnit(validPropId, ownerUserId, {
          unitName: 'Phòng 101',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('4. Should create RentalUnit successfully for active property', async () => {
      vi.spyOn(mockPropertyModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(mockActiveProperty),
      } as any);

      const result = await service.createRentalUnit(validPropId, ownerUserId, {
        unitName: '  Phòng   101 A ',
        price: 3500000,
        area: 25,
      });

      expect(result).toBeDefined();
      expect(result.normalizedUnitName).toBe('phòng 101 a');
    });

    it('5. Should catch E11000 duplicate error and throw ConflictException', async () => {
      vi.spyOn(mockPropertyModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(mockActiveProperty),
      } as any);

      vi.spyOn(mockRentalUnitModel.prototype, 'save').mockRejectedValueOnce({
        code: 11000,
      });

      await expect(
        service.createRentalUnit(validPropId, ownerUserId, {
          unitName: 'Phòng 101',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateRentalUnit', () => {
    it('6. Should throw ForbiddenException if current user is not unit creator', async () => {
      vi.spyOn(mockRentalUnitModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(mockActiveRentalUnit),
      } as any);

      vi.spyOn(mockPropertyModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(mockActiveProperty),
      } as any);

      await expect(
        service.updateRentalUnit(validUnitId, otherUserId, {
          unitName: 'Phòng 102',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteRentalUnit', () => {
    it('7. Should soft delete RentalUnit when owner calls deleteRentalUnit', async () => {
      const mockSave = vi.fn().mockResolvedValue({
        ...mockActiveRentalUnit,
        deletedAt: new Date(),
      });
      const unitToSoftDelete = { ...mockActiveRentalUnit, save: mockSave };

      vi.spyOn(mockRentalUnitModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(unitToSoftDelete),
      } as any);

      vi.spyOn(mockPropertyModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(mockActiveProperty),
      } as any);

      const result = await service.deleteRentalUnit(validUnitId, ownerUserId);

      expect(mockSave).toHaveBeenCalled();
      expect(result.deletedAt).toBeDefined();
    });

    it('8. Should throw NotFoundException when attempting to delete an already soft-deleted RentalUnit', async () => {
      vi.spyOn(mockRentalUnitModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(null),
      } as any);

      await expect(
        service.deleteRentalUnit(validUnitId, ownerUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('9. Should throw BadRequestException if unitName is empty or only whitespace', async () => {
      vi.spyOn(mockPropertyModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(mockActiveProperty),
      } as any);

      await expect(
        service.createRentalUnit(validPropId, ownerUserId, {
          unitName: '     ',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
