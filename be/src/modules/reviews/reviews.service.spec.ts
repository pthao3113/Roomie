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
import { MediaUpload } from './schemas/media-upload.schema.js';
import { Property } from '../properties/schemas/property.schema.js';
import { RentalUnit } from '../properties/schemas/rental-unit.schema.js';
import { MediaStorageService } from './media-storage.service.js';

describe('ReviewsService Unit Suite (Migration 3 - LU1 & LU2 Review Management)', () => {
  let service: ReviewsService;
  let mockReviewModel: any;
  let mockMediaUploadModel: any;
  let mockPropertyModel: any;
  let mockRentalUnitModel: any;
  let mockMediaStorageService: any;

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
    _id: new Types.ObjectId(validReviewId),
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

    mockMediaStorageService = {
      destroyCloudinaryMedia: vi.fn().mockResolvedValue(undefined),
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

    mockMediaUploadModel = {
      find: vi.fn().mockReturnThis(),
      findOne: vi.fn().mockReturnThis(),
      findOneAndUpdate: vi.fn().mockResolvedValue(null),
      updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
      deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
      exec: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        {
          provide: getModelToken(Review.name),
          useValue: mockReviewModel,
        },
        {
          provide: getModelToken(MediaUpload.name),
          useValue: mockMediaUploadModel,
        },
        {
          provide: getModelToken(Property.name),
          useValue: mockPropertyModel,
        },
        {
          provide: getModelToken(RentalUnit.name),
          useValue: mockRentalUnitModel,
        },
        {
          provide: MediaStorageService,
          useValue: mockMediaStorageService,
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

    it('3. Should attach valid media to review and claim it atomically', async () => {
      vi.spyOn(mockPropertyModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(mockActiveProperty),
      } as any);

      const mockMediaDoc = {
        publicId: 'roomie/reviews/img_1',
        url: 'https://cloudinary.com/img_1.jpg',
        type: 'image',
        userId: { equals: (id: Types.ObjectId) => id.toString() === authorUserId },
        reviewId: null,
        isAttached: false,
        detachedAt: null,
      };

      vi.spyOn(mockMediaUploadModel, 'find').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce([mockMediaDoc]),
      } as any);

      const result = await service.createReview(validPropId, authorUserId, {
        rating: 5,
        media: [{ publicId: 'roomie/reviews/img_1' }],
      });

      expect(result).toBeDefined();
      expect(result.media).toHaveLength(1);
      expect(result.media[0].publicId).toBe('roomie/reviews/img_1');
      expect(mockMediaUploadModel.updateMany).toHaveBeenCalled();
    });

    it('4. Should throw ForbiddenException if user attempts to attach media owned by someone else', async () => {
      vi.spyOn(mockPropertyModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(mockActiveProperty),
      } as any);

      const mockOtherUserMedia = {
        publicId: 'roomie/reviews/img_stolen',
        url: 'https://cloudinary.com/img_stolen.jpg',
        type: 'image',
        userId: { equals: (id: Types.ObjectId) => id.toString() === otherUserId }, // not author
        reviewId: null,
        isAttached: false,
        detachedAt: null,
      };

      vi.spyOn(mockMediaUploadModel, 'find').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce([mockOtherUserMedia]),
      } as any);

      await expect(
        service.createReview(validPropId, authorUserId, {
          rating: 5,
          media: [{ publicId: 'roomie/reviews/img_stolen' }],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('5. Should throw BadRequestException if media exceeds 5 images or 1 video limit', async () => {
      vi.spyOn(mockPropertyModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(mockActiveProperty),
      } as any);

      const mock2Videos = [
        {
          publicId: 'v1',
          url: 'url1',
          type: 'video',
          userId: { equals: () => true },
          reviewId: null,
          detachedAt: null,
        },
        {
          publicId: 'v2',
          url: 'url2',
          type: 'video',
          userId: { equals: () => true },
          reviewId: null,
          detachedAt: null,
        },
      ];

      vi.spyOn(mockMediaUploadModel, 'find').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(mock2Videos),
      } as any);

      await expect(
        service.createReview(validPropId, authorUserId, {
          rating: 5,
          media: [{ publicId: 'v1' }, { publicId: 'v2' }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('6. Should throw BadRequestException for invalid propertyId', async () => {
      await expect(
        service.createReview('invalid-id', authorUserId, {
          rating: 5,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('7. Should throw NotFoundException if property does not exist or is soft-deleted', async () => {
      vi.spyOn(mockPropertyModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(null),
      } as any);

      await expect(
        service.createReview(validPropId, authorUserId, {
          rating: 5,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('8. Should throw BadRequestException if rentalUnit does not belong to target property', async () => {
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

    it('9. Should catch duplicate error code 11000 and throw ConflictException', async () => {
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
    it('10. Should update review successfully when called by author', async () => {
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

    it('11. Should detach all media when media is updated to empty array', async () => {
      const reviewWithMedia = {
        ...mockActiveReview,
        media: [{ publicId: 'old_img', url: 'old_url', type: 'image' }],
        save: vi.fn().mockImplementation(function (this: any) {
          return Promise.resolve(this);
        }),
      };

      vi.spyOn(mockReviewModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(reviewWithMedia),
      } as any);

      const result = await service.updateReview(validReviewId, authorUserId, {
        media: [],
      });

      expect(result.media).toHaveLength(0);
      expect(mockMediaUploadModel.updateMany).toHaveBeenCalledWith(
        { reviewId: reviewWithMedia._id },
        expect.objectContaining({
          $set: expect.objectContaining({ isAttached: false }),
        }),
      );
    });

    it('12. Should throw ForbiddenException if user is not review author', async () => {
      vi.spyOn(mockReviewModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(mockActiveReview),
      } as any);

      await expect(
        service.updateReview(validReviewId, otherUserId, {
          rating: 4,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('13. Should throw NotFoundException if review does not exist or is soft-deleted', async () => {
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
    it('14. Should soft-delete review successfully when called by author', async () => {
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

    it('15. Should throw ForbiddenException if user attempting delete is not author', async () => {
      vi.spyOn(mockReviewModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(mockActiveReview),
      } as any);

      await expect(
        service.deleteReview(validReviewId, otherUserId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('16. Should throw NotFoundException if review is already soft-deleted', async () => {
      vi.spyOn(mockReviewModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(null),
      } as any);

      await expect(
        service.deleteReview(validReviewId, authorUserId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('cleanupOrphanMedia', () => {
    it('17. Should claim with findOneAndUpdate and delete unattached media older than cutoff time', async () => {
      const orphanRecord = {
        _id: 'orphan_1',
        publicId: 'roomie/reviews/orphan_img',
        type: 'image',
      };

      vi.spyOn(mockMediaUploadModel, 'find').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce([orphanRecord]),
      } as any);

      vi.spyOn(mockMediaUploadModel, 'findOneAndUpdate').mockResolvedValueOnce(
        orphanRecord,
      );
      vi.spyOn(mockMediaStorageService, 'destroyCloudinaryMedia').mockResolvedValueOnce(true);

      const count = await service.cleanupOrphanMedia(24);

      expect(count).toBe(1);
      expect(mockMediaUploadModel.findOneAndUpdate).toHaveBeenCalled();
      expect(mockMediaStorageService.destroyCloudinaryMedia).toHaveBeenCalledWith(
        'roomie/reviews/orphan_img',
        'image',
      );
      expect(mockMediaUploadModel.deleteOne).toHaveBeenCalledWith({
        _id: 'orphan_1',
      });
    });

    it('18. Should retain record and reset isCleaningUp to false if Cloudinary destroy fails', async () => {
      const orphanRecord = {
        _id: 'orphan_failed_destroy',
        publicId: 'roomie/reviews/failed_img',
        type: 'image',
      };

      vi.spyOn(mockMediaUploadModel, 'find').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce([orphanRecord]),
      } as any);

      vi.spyOn(mockMediaUploadModel, 'findOneAndUpdate').mockResolvedValueOnce(
        orphanRecord,
      );
      // Destroy returns false (failed)
      vi.spyOn(mockMediaStorageService, 'destroyCloudinaryMedia').mockResolvedValueOnce(false);

      const count = await service.cleanupOrphanMedia(24);

      expect(count).toBe(0);
      expect(mockMediaUploadModel.deleteOne).not.toHaveBeenCalled();
      expect(mockMediaUploadModel.updateOne).toHaveBeenCalledWith(
        { _id: 'orphan_failed_destroy' },
        { $set: { isCleaningUp: false } },
      );
    });
  });

  describe('Atomic Claim Failure & Rollback in updateReview', () => {
    it('19. Should rollback only added claims and throw BadRequestException if updateReview has partial claim failure', async () => {
      const reviewWithNoMedia = {
        ...mockActiveReview,
        media: [],
        save: vi.fn().mockResolvedValue(mockActiveReview),
      };

      vi.spyOn(mockReviewModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(reviewWithNoMedia),
      } as any);

      const mockDoc = {
        publicId: 'new_img_1',
        url: 'url_1',
        type: 'image',
        userId: { equals: (id: Types.ObjectId) => id.toString() === authorUserId },
        reviewId: null,
        detachedAt: null,
      };

      vi.spyOn(mockMediaUploadModel, 'find').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce([mockDoc]),
      } as any);

      // Simulate partial or failed claim: modifiedCount is 0 instead of 1
      vi.spyOn(mockMediaUploadModel, 'updateMany')
        .mockResolvedValueOnce({ modifiedCount: 0 }) // claim fails
        .mockResolvedValueOnce({ modifiedCount: 0 }); // rollback

      await expect(
        service.updateReview(validReviewId, authorUserId, {
          media: [{ publicId: 'new_img_1' }],
        }),
      ).rejects.toThrow(BadRequestException);

      // Verify rollback was called with the review._id
      expect(mockMediaUploadModel.updateMany).toHaveBeenCalledWith(
        { publicId: { $in: ['new_img_1'] }, reviewId: reviewWithNoMedia._id },
        { $set: { reviewId: null, isAttached: false } },
      );
    });
  });
});
