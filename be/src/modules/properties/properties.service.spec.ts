import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PropertiesService } from './properties.service.js';
import { Property } from './schemas/property.schema.js';
import { QueryMapPropertyDto } from './dto/query-map-property.dto.js';

describe('PropertiesService Unit Suite (LU2 & LU4 Map Search & Rating Integration)', () => {
  let service: PropertiesService;
  let mockPropertyModel: any;

  const mockPropertyDoc = {
    _id: '507f1f77bcf86cd799439011',
    name: 'Nhà trọ Sunset',
    address: '123 Nguyễn Văn Cừ, P.2, Q.5',
    normalizedAddress: '123 duong nguyen van cu phuong 2 quan 5',
    location: { type: 'Point', coordinates: [106.68, 10.75] },
    createdBy: { equals: (id: string) => id === 'user_owner_123' },
    averageRating: 4.5,
    reviewCount: 12,
    deletedAt: null,
  };

  beforeEach(async () => {
    mockPropertyModel = {
      find: vi.fn().mockReturnThis(),
      findOne: vi.fn().mockReturnThis(),
      exec: vi.fn(),
      limit: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnThis(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PropertiesService,
        {
          provide: getModelToken(Property.name),
          useValue: mockPropertyModel,
        },
      ],
    }).compile();

    service = module.get<PropertiesService>(PropertiesService);
  });

  describe('QueryMapPropertyDto Validation (LU4)', () => {
    it('Should validate valid minRating values (1 to 5, max 1 decimal place)', async () => {
      const validCases = [
        { lat: 10.75, lng: 106.68, radius: 1000, minRating: 4.5 },
        { lat: 10.75, lng: 106.68, radius: 1000, minRating: 1 },
        { lat: 10.75, lng: 106.68, radius: 1000, minRating: 5 },
        { lat: 10.75, lng: 106.68, radius: 1000, minRating: 3.0 },
        { lat: 10.75, lng: 106.68, radius: 1000 }, // optional
      ];

      for (const val of validCases) {
        const dto = plainToInstance(QueryMapPropertyDto, val);
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      }
    });

    it('Should reject minRating outside 1-5 or with more than 1 decimal place', async () => {
      const invalidCases = [
        { lat: 10.75, lng: 106.68, radius: 1000, minRating: 0.9 }, // < 1
        { lat: 10.75, lng: 106.68, radius: 1000, minRating: 5.1 }, // > 5
        { lat: 10.75, lng: 106.68, radius: 1000, minRating: 4.25 }, // 2 decimal places
        { lat: 10.75, lng: 106.68, radius: 1000, minRating: 'invalid' as any },
      ];

      for (const val of invalidCases) {
        const dto = plainToInstance(QueryMapPropertyDto, val);
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((e) => e.property === 'minRating')).toBe(true);
      }
    });
  });

  describe('searchMapProperties (LU2 & LU4)', () => {
    it('1. Should throw BadRequestException if both Radius and Viewport modes are provided', async () => {
      await expect(
        service.searchMapProperties({
          lat: 10.75,
          lng: 106.68,
          radius: 1000,
          swLng: 106.6,
          swLat: 10.7,
          neLng: 106.7,
          neLat: 10.8,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('2. Should throw BadRequestException if invalid Viewport bounds (swLng >= neLng)', async () => {
      await expect(
        service.searchMapProperties({
          swLng: 106.8, // swLng > neLng
          swLat: 10.7,
          neLng: 106.7,
          neLat: 10.8,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('3. Should filter by GPS Radius with minRating (reviewCount > 0 and averageRating >= minRating)', async () => {
      vi.spyOn(mockPropertyModel, 'exec').mockResolvedValueOnce([mockPropertyDoc]);

      const result = await service.searchMapProperties({
        lat: 10.75,
        lng: 106.68,
        radius: 1500,
        minRating: 4.5,
      });

      expect(result).toHaveLength(1);
      expect(mockPropertyModel.find).toHaveBeenCalledWith({
        deletedAt: null,
        reviewCount: { $gt: 0 },
        averageRating: { $gte: 4.5 },
        location: {
          $near: {
            $geometry: { type: 'Point', coordinates: [106.68, 10.75] },
            $maxDistance: 1500,
          },
        },
      });
      expect(mockPropertyModel.limit).toHaveBeenCalledWith(50);
    });

    it('4. Should filter by Viewport Bounding Box with minRating', async () => {
      vi.spyOn(mockPropertyModel, 'exec').mockResolvedValueOnce([mockPropertyDoc]);

      const result = await service.searchMapProperties({
        swLng: 106.6,
        swLat: 10.7,
        neLng: 106.7,
        neLat: 10.8,
        minRating: 3.5,
        limit: 80,
      });

      expect(result).toHaveLength(1);
      expect(mockPropertyModel.find).toHaveBeenCalledWith({
        deletedAt: null,
        reviewCount: { $gt: 0 },
        averageRating: { $gte: 3.5 },
        location: {
          $geoWithin: {
            $box: [
              [106.6, 10.7],
              [106.7, 10.8],
            ],
          },
        },
      });
      expect(mockPropertyModel.limit).toHaveBeenCalledWith(80);
    });

    it('5. Should search without rating filter when minRating is not provided', async () => {
      vi.spyOn(mockPropertyModel, 'exec').mockResolvedValueOnce([mockPropertyDoc]);

      await service.searchMapProperties({
        lat: 10.75,
        lng: 106.68,
        radius: 1000,
      });

      expect(mockPropertyModel.find).toHaveBeenCalledWith({
        deletedAt: null,
        location: {
          $near: {
            $geometry: { type: 'Point', coordinates: [106.68, 10.75] },
            $maxDistance: 1000,
          },
        },
      });
      const findCallArg = mockPropertyModel.find.mock.calls[0][0];
      expect(findCallArg.averageRating).toBeUndefined();
      expect(findCallArg.reviewCount).toBeUndefined();
    });

    it('6. Should enforce maximum cap of 100 pins even if query requests higher limit', async () => {
      vi.spyOn(mockPropertyModel, 'exec').mockResolvedValueOnce([]);

      await service.searchMapProperties({
        lat: 10.75,
        lng: 106.68,
        radius: 1000,
        limit: 250, // Exceeds 100
      });

      expect(mockPropertyModel.limit).toHaveBeenCalledWith(100);
    });

    it('7. Should ensure averageRating and reviewCount default to 0 if missing from legacy records', async () => {
      const legacyDocWithoutRating: any = {
        _id: 'legacy_prop_1',
        name: 'Nhà trọ Cũ Chưa Có Rating',
        address: '456 Lê Lợi',
        location: { type: 'Point', coordinates: [106.69, 10.77] },
      };

      vi.spyOn(mockPropertyModel, 'exec').mockResolvedValueOnce([legacyDocWithoutRating]);

      const result = await service.searchMapProperties({
        lat: 10.75,
        lng: 106.68,
        radius: 1000,
      });

      expect(result).toHaveLength(1);
      expect(result[0].averageRating).toBe(0);
      expect(result[0].reviewCount).toBe(0);
    });
  });

  describe('updateProperty', () => {
    it('3. Should throw BadRequestException if propertyId is invalid Mongo ObjectId', async () => {
      await expect(
        service.updateProperty('invalid-id', 'user_owner_123', { name: 'New Name' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('4. Should throw ForbiddenException if user is not the property creator', async () => {
      vi.spyOn(mockPropertyModel, 'findOne').mockReturnValueOnce({
        exec: vi.fn().mockResolvedValueOnce(mockPropertyDoc),
      } as any);

      await expect(
        service.updateProperty(
          '507f1f77bcf86cd799439011',
          'user_other_456', // Different user ID
          { name: 'New Name' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
