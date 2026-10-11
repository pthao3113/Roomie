import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { ReviewsService } from './reviews.service.js';
import { Review } from './schemas/review.schema.js';
import { Property } from '../properties/schemas/property.schema.js';
import { RentalUnit } from '../properties/schemas/rental-unit.schema.js';

describe('ReviewsService Unit Suite (Migration 3 - LU1 Review Core & CRUD)', () => {
  let service: ReviewsService;
  let mockReviewModel: any;
  let mockPropertyModel: any;
  let mockRentalUnitModel: any;

  const validPropId = '507f1f77bcf86cd799439011';
  const otherPropId = '507f1f77bcf86cd799439099';
  const validUnitId = '507f1f77bcf86cd799439022';
  const validReviewId = '507f1f77bcf86cd799439055';
  const authorUserId = '507f1f77bcf86cd799439033';
  const otherUserId = '507f1f77bcf86cd799439044';

  const mockActiveProperty = {
    _id: validPropId,
    name: 'Nhà trọ Sunset',
    deletedAt: null,
  };

  const mockActiveRentalUnit = {
    _id: validUnitId,
    propertyId: {
      equals: (id: string | Types.ObjectId) =>
        id.toString() === validPropId.toString(),
    },
    unitName: 'Phòng 101',
    deletedAt: null,
  };

  const mockActiveReview = {
    _id: validReviewId,
    propertyId: new Types.ObjectId(validPropId),
    rentalUnitId: null,
    userId: {
      equals: (id: string | Types.ObjectId) =>
        id.toString() === authorUserId.toString(),
    },
    rating: 5,
    comment: 'Nhà trọ sạch sẽ, an ninh tốt',
    isAnonymous: false,
    media: [],
    deletedAt: null,
    save: vi.fn(),
  };

  beforeEach(async () => {
    mockPropertyModel = {
      findOne: vi.fn().mockReturnThis(),
      exec: vi.fn(),
    };

    mockRentalUnitModel = {
      findOne: vi.fn().mockReturnThis(),
      exec: vi.fn(),
    };

    function MockReviewModel(this: any, dto: any) {
      Object.assign(this, dto);
    }

    MockReviewModel.prototype.save = vi.fn().mockImplementation(function (
      this: any,
    ) {
      return Promise.resolve({ _id: validReviewId, ...this });
    });

    MockReviewModel.find = vi.fn().mockReturnThis();
    MockReviewModel.findById = vi.fn().mockReturnThis();
    MockReviewModel.findOne = vi.fn().mockReturnThis();
    MockReviewModel.exec = vi.fn();

    mockReviewModel = MockReviewModel;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        {
          provide: getModelToken(Review.name),
          useValue: mockReviewModel,
        },
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

    service = module.get<ReviewsService>(ReviewsService);
  });

  describe('createReview', () => {
    it('1. Should create review for Property successfully (with rentalUnitId: null)', async () => {
      vi.spyOn(mockPropertyModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(mockActiveProperty),
      } as any);

      const result = await service.createReview(validPropId, authorUserId, {
        rating: 5,
        comment: 'Rất ưng ý với nhà trọ này',
        isAnonymous: true,
      });

      expect(result).toBeDefined();
      expect(result.rating).toBe(5);
      expect(result.isAnonymous).toBe(true);
      expect(result.rentalUnitId).toBeNull();
    });

    it('2. Should create review for RentalUnit successfully when unit belongs to property', async () => {
      vi.spyOn(mockPropertyModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(mockActiveProperty),
      } as any);

      vi.spyOn(mockRentalUnitModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(mockActiveRentalUnit),
      } as any);

      const result = await service.createReview(validPropId, authorUserId, {
        rentalUnitId: validUnitId,
        rating: 4,
        comment: 'Phòng thoáng mát',
      });

      expect(result).toBeDefined();
      expect(result.rating).toBe(4);
      expect(result.rentalUnitId).toBeDefined();
    });

    it('3. Should throw BadRequestException for invalid propertyId', async () => {
      await expect(
        service.createReview('invalid-id', authorUserId, {
          rating: 5,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('4. Should throw NotFoundException if property does not exist or is soft-deleted', async () => {
      vi.spyOn(mockPropertyModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(null),
      } as any);

      await expect(
        service.createReview(validPropId, authorUserId, {
          rating: 5,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('5. Should throw BadRequestException if rentalUnit does not belong to target property', async () => {
      vi.spyOn(mockPropertyModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(mockActiveProperty),
      } as any);

      const unitOfDifferentProp = {
        _id: validUnitId,
        propertyId: {
          equals: (id: string | Types.ObjectId) =>
            id.toString() === otherPropId.toString(),
        },
        deletedAt: null,
      };

      vi.spyOn(mockRentalUnitModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(unitOfDifferentProp),
      } as any);

      await expect(
        service.createReview(validPropId, authorUserId, {
          rentalUnitId: validUnitId,
          rating: 5,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('6. Should catch duplicate error code 11000 and throw ConflictException', async () => {
      vi.spyOn(mockPropertyModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(mockActiveProperty),
      } as any);

      vi.spyOn(mockReviewModel.prototype, 'save').mockRejectedValueOnce({
        code: 11000,
      });

      await expect(
        service.createReview(validPropId, authorUserId, {
          rating: 5,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateReview', () => {
    it('7. Should update review successfully when called by author', async () => {
      const mockReviewToUpdate = {
        ...mockActiveReview,
        save: vi.fn().mockResolvedValue({
          ...mockActiveReview,
          rating: 3,
          comment: 'Đã cập nhật nhận xét',
          isAnonymous: true,
        }),
      };

      vi.spyOn(mockReviewModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(mockReviewToUpdate),
      } as any);

      const result = await service.updateReview(validReviewId, authorUserId, {
        rating: 3,
        comment: 'Đã cập nhật nhận xét',
        isAnonymous: true,
      });

      expect(result.rating).toBe(3);
      expect(result.comment).toBe('Đã cập nhật nhận xét');
      expect(result.isAnonymous).toBe(true);
    });

    it('8. Should throw ForbiddenException if user is not review author', async () => {
      vi.spyOn(mockReviewModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(mockActiveReview),
      } as any);

      await expect(
        service.updateReview(validReviewId, otherUserId, {
          rating: 4,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('9. Should throw NotFoundException if review does not exist or is soft-deleted', async () => {
      vi.spyOn(mockReviewModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(null),
      } as any);

      await expect(
        service.updateReview(validReviewId, authorUserId, {
          rating: 4,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteReview', () => {
    it('10. Should soft-delete review successfully when called by author', async () => {
      const mockSave = vi.fn().mockResolvedValue({
        ...mockActiveReview,
        deletedAt: new Date(),
      });
      const reviewToDelete = { ...mockActiveReview, save: mockSave };

      vi.spyOn(mockReviewModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(reviewToDelete),
      } as any);

      const result = await service.deleteReview(validReviewId, authorUserId);

      expect(mockSave).toHaveBeenCalled();
      expect(result.deletedAt).toBeDefined();
    });

    it('11. Should throw ForbiddenException if user attempting delete is not author', async () => {
      vi.spyOn(mockReviewModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(mockActiveReview),
      } as any);

      await expect(
        service.deleteReview(validReviewId, otherUserId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('12. Should throw NotFoundException if review is already soft-deleted', async () => {
      vi.spyOn(mockReviewModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(null),
      } as any);

      await expect(
        service.deleteReview(validReviewId, authorUserId),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
