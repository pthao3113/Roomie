import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
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
import { User } from '../users/schemas/user.schema.js';
import { MediaStorageService } from './media-storage.service.js';

describe('ReviewsService Unit Suite (Migration 3 - LU1, LU2 & LU3 Review Management)', () => {
  let service: ReviewsService;
  let mockReviewModel: any;
  let mockMediaUploadModel: any;
  let mockPropertyModel: any;
  let mockRentalUnitModel: any;
  let mockUserModel: any;
  let mockMediaStorageService: any;

  const validPropId = '507f1f77bcf86cd799439011';
  const validUnitId = '507f1f77bcf86cd799439022';
  const validReviewId = '507f1f77bcf86cd799439055';
  const authorUserId = '507f1f77bcf86cd799439033';
  const otherUserId = '507f1f77bcf86cd799439044';

  const mockActiveProperty = {
    _id: new Types.ObjectId(validPropId),
    name: 'Nhà trọ Sunset',
    averageRating: 4.5,
    reviewCount: 10,
    deletedAt: null,
  };

  const mockActiveRentalUnit = {
    _id: new Types.ObjectId(validUnitId),
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
      _id: new Types.ObjectId(authorUserId),
      displayName: 'Nguyễn Văn A',
      deactivatedAt: null,
      deletedAt: null,
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
      find: vi.fn().mockReturnThis(),
      findOne: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
      exec: vi.fn(),
    };

    mockRentalUnitModel = {
      find: vi.fn().mockReturnThis(),
      findOne: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
      exec: vi.fn(),
    };

    mockUserModel = {
      find: vi.fn().mockReturnThis(),
      findOne: vi.fn().mockReturnThis(),
      exec: vi.fn(),
    };

    mockMediaStorageService = {
      destroyCloudinaryMedia: vi.fn().mockResolvedValue(true),
    };

    function MockReviewModel(this: any, dto: any) {
      Object.assign(this, dto);
    }

    MockReviewModel.prototype.save = vi.fn().mockImplementation(function (
      this: any,
    ) {
      return Promise.resolve({
        _id: new Types.ObjectId(validReviewId),
        propertyId: new Types.ObjectId(validPropId),
        ...this,
      });
    });

    MockReviewModel.find = vi.fn().mockReturnThis();
    MockReviewModel.findById = vi.fn().mockReturnThis();
    MockReviewModel.findOne = vi.fn().mockReturnThis();
    MockReviewModel.sort = vi.fn().mockReturnThis();
    MockReviewModel.skip = vi.fn().mockReturnThis();
    MockReviewModel.limit = vi.fn().mockReturnThis();
    MockReviewModel.populate = vi.fn().mockReturnThis();
    MockReviewModel.countDocuments = vi.fn().mockReturnThis();
    MockReviewModel.aggregate = vi.fn().mockResolvedValue([
      { _id: new Types.ObjectId(validPropId), avgRating: 4.333, count: 3 },
    ]);
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
          provide: getModelToken(User.name),
          useValue: mockUserModel,
        },
        {
          provide: MediaStorageService,
          useValue: mockMediaStorageService,
        },
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
  });

  describe('Rating Recalculation & Backfill (LU3)', () => {
    it('1. recalculatePropertyRating should round to 1 decimal place and update Property', async () => {
      mockReviewModel.aggregate.mockResolvedValueOnce([
        { _id: new Types.ObjectId(validPropId), avgRating: 4.6666, count: 6 },
      ]);

      await service.recalculatePropertyRating(new Types.ObjectId(validPropId));

      expect(mockPropertyModel.updateOne).toHaveBeenCalledWith(
        { _id: new Types.ObjectId(validPropId) },
        { $set: { averageRating: 4.7, reviewCount: 6 } },
      );
    });

    it('2. recalculatePropertyRating should set rating to 0 when there are no reviews', async () => {
      mockReviewModel.aggregate.mockResolvedValueOnce([]);

      await service.recalculatePropertyRating(new Types.ObjectId(validPropId));

      expect(mockPropertyModel.updateOne).toHaveBeenCalledWith(
        { _id: new Types.ObjectId(validPropId) },
        { $set: { averageRating: 0, reviewCount: 0 } },
      );
    });

    it('3. recalculateRentalUnitRating should calculate and update RentalUnit rating', async () => {
      mockReviewModel.aggregate.mockResolvedValueOnce([
        { _id: new Types.ObjectId(validUnitId), avgRating: 4.0, count: 2 },
      ]);

      await service.recalculateRentalUnitRating(new Types.ObjectId(validUnitId));

      expect(mockRentalUnitModel.updateOne).toHaveBeenCalledWith(
        { _id: new Types.ObjectId(validUnitId) },
        { $set: { averageRating: 4.0, reviewCount: 2 } },
      );
    });

    it('4. backfillAllRatings should iterate and recalculate all active properties and units in batches', async () => {
      vi.spyOn(mockPropertyModel, 'exec')
        .mockResolvedValueOnce([mockActiveProperty])
        .mockResolvedValueOnce([]);

      vi.spyOn(mockRentalUnitModel, 'exec')
        .mockResolvedValueOnce([mockActiveRentalUnit])
        .mockResolvedValueOnce([]);

      const result = await service.backfillAllRatings(50);

      expect(result.propertiesUpdated).toBe(1);
      expect(result.unitsUpdated).toBe(1);
      expect(mockPropertyModel.updateOne).toHaveBeenCalled();
      expect(mockRentalUnitModel.updateOne).toHaveBeenCalled();
    });

    it('4b. handleDailyRatingReconciliation should execute cron batch reconciliation and log summary', async () => {
      vi.spyOn(service, 'reconcileAllRatingsInBatches').mockResolvedValueOnce({
        propertiesUpdated: 5,
        unitsUpdated: 12,
      });

      await expect(
        service.handleDailyRatingReconciliation(),
      ).resolves.toBeUndefined();
      expect(service.reconcileAllRatingsInBatches).toHaveBeenCalledWith(50);
    });

    it('5. reconcilePropertyRating should reconcile rating on demand for valid propertyId', async () => {
      await service.reconcilePropertyRating(validPropId);
      expect(mockPropertyModel.updateOne).toHaveBeenCalled();
    });
  });

  describe('getReviewsByProperty (LU3 Public Listing & Presentation)', () => {
    it('6. Should throw NotFoundException if property does not exist or is soft-deleted', async () => {
      vi.spyOn(mockPropertyModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(null),
      } as any);

      await expect(
        service.getReviewsByProperty(validPropId, {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('7. Should throw BadRequestException if rentalUnit does not belong to property', async () => {
      vi.spyOn(mockPropertyModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(mockActiveProperty),
      } as any);

      const unitOfDifferentProp = {
        _id: new Types.ObjectId(validUnitId),
        propertyId: {
          equals: () => false, // different property
        },
        deletedAt: null,
      };

      vi.spyOn(mockRentalUnitModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(unitOfDifferentProp),
      } as any);

      await expect(
        service.getReviewsByProperty(validPropId, { rentalUnitId: validUnitId }),
      ).rejects.toThrow(BadRequestException);
    });

    it('8. Should return reviews with overall property summary and pagination', async () => {
      vi.spyOn(mockPropertyModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(mockActiveProperty),
      } as any);

      mockReviewModel.countDocuments.mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(1),
      });

      mockReviewModel.exec.mockResolvedValueOnce([mockActiveReview]);

      const result = await service.getReviewsByProperty(validPropId, {
        page: 1,
        limit: 10,
      });

      expect(result).toBeDefined();
      expect(result.summary.averageRating).toBe(4.5);
      expect(result.summary.reviewCount).toBe(10);
      expect(result.pagination.total).toBe(1);
      expect(result.data).toHaveLength(1);
    });

    it('9. Should anonymize author when isAnonymous is true and omit publicId from media', async () => {
      vi.spyOn(mockPropertyModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(mockActiveProperty),
      } as any);

      mockReviewModel.countDocuments.mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(1),
      });

      const anonymousReviewWithMedia = {
        ...mockActiveReview,
        isAnonymous: true,
        media: [
          {
            type: 'image',
            url: 'https://cloudinary.com/img.jpg',
            publicId: 'roomie/reviews/secret_public_id',
          },
        ],
      };

      mockReviewModel.exec.mockResolvedValueOnce([anonymousReviewWithMedia]);

      const result = await service.getReviewsByProperty(validPropId, {});

      const item = result.data[0];
      expect(item.author.displayName).toBe('Người dùng ẩn danh');
      // Verify publicId is stripped
      expect((item.media[0] as any).publicId).toBeUndefined();
      expect(item.media[0].url).toBe('https://cloudinary.com/img.jpg');
    });

    it('10. Should show appropriate author status for deactivated and deleted accounts', async () => {
      vi.spyOn(mockPropertyModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(mockActiveProperty),
      } as any);

      mockReviewModel.countDocuments.mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(2),
      });

      const deactivatedUserReview = {
        ...mockActiveReview,
        _id: new Types.ObjectId(),
        isAnonymous: false,
        userId: {
          displayName: 'User Deactivated',
          deactivatedAt: new Date(),
          deletedAt: null,
        },
      };

      const deletedUserReview = {
        ...mockActiveReview,
        _id: new Types.ObjectId(),
        isAnonymous: false,
        userId: {
          displayName: 'User Deleted',
          deactivatedAt: null,
          deletedAt: new Date(),
        },
      };

      mockReviewModel.exec.mockResolvedValueOnce([
        deactivatedUserReview,
        deletedUserReview,
      ]);

      const result = await service.getReviewsByProperty(validPropId, {});

      expect(result.data[0].author.displayName).toBe(
        'Tài khoản đã bị vô hiệu hóa',
      );
      expect(result.data[1].author.displayName).toBe('Tài khoản đã xóa');
    });
  });

  describe('createReview (with Live Rating Hooks)', () => {
    it('11. Should create review for Property and trigger property rating recalculation', async () => {
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
      expect(mockPropertyModel.updateOne).toHaveBeenCalled();
    });

    it('12. Should create review for RentalUnit and trigger both Property & RentalUnit recalculations', async () => {
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
      expect(mockPropertyModel.updateOne).toHaveBeenCalled();
      expect(mockRentalUnitModel.updateOne).toHaveBeenCalled();
    });

    it('13. Should attach valid media to review and claim it atomically', async () => {
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

    it('14. Should throw ForbiddenException if user attempts to attach media owned by someone else', async () => {
      vi.spyOn(mockPropertyModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(mockActiveProperty),
      } as any);

      const mockOtherUserMedia = {
        publicId: 'roomie/reviews/img_stolen',
        url: 'https://cloudinary.com/img_stolen.jpg',
        type: 'image',
        userId: { equals: (id: Types.ObjectId) => id.toString() === otherUserId },
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

    it('15. Should throw BadRequestException if media exceeds 5 images or 1 video limit', async () => {
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
  });

  describe('updateReview (with Live Rating Hooks)', () => {
    it('16. Should update rating and trigger rating recalculation', async () => {
      const mockReviewToUpdate = {
        ...mockActiveReview,
        rating: 4,
        save: vi.fn().mockResolvedValue({
          ...mockActiveReview,
          rating: 2,
        }),
      };

      vi.spyOn(mockReviewModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(mockReviewToUpdate),
      } as any);

      await service.updateReview(validReviewId, authorUserId, {
        rating: 2,
      });

      expect(mockPropertyModel.updateOne).toHaveBeenCalled();
    });

    it('17. Should detach all media when media is updated to empty array', async () => {
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

    it('18. Should rollback only added claims and throw BadRequestException if updateReview has partial claim failure', async () => {
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

      vi.spyOn(mockMediaUploadModel, 'updateMany')
        .mockResolvedValueOnce({ modifiedCount: 0 })
        .mockResolvedValueOnce({ modifiedCount: 0 });

      await expect(
        service.updateReview(validReviewId, authorUserId, {
          media: [{ publicId: 'new_img_1' }],
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockMediaUploadModel.updateMany).toHaveBeenCalledWith(
        { publicId: { $in: ['new_img_1'] }, reviewId: reviewWithNoMedia._id },
        { $set: { reviewId: null, isAttached: false } },
      );
    });
  });

  describe('deleteReview (with Live Rating Hooks)', () => {
    it('19. Should soft-delete review and trigger rating recalculation', async () => {
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
      expect(mockPropertyModel.updateOne).toHaveBeenCalled();
    });
  });

  describe('cleanupOrphanMedia', () => {
    it('20. Should claim with findOneAndUpdate and delete unattached media older than cutoff time', async () => {
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

    it('16. Should retain record and reset isCleaningUp to false if Cloudinary destroy fails', async () => {
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
});
