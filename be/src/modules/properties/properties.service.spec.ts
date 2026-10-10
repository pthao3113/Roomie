import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PropertiesService } from './properties.service.js';
import { Property } from './schemas/property.schema.js';

describe('PropertiesService Unit Suite (LU2 Map Search & Management)', () => {
  let service: PropertiesService;
  let mockPropertyModel: any;

  const mockPropertyDoc = {
    _id: '507f1f77bcf86cd799439011',
    name: 'Nhà trọ Sunset',
    address: '123 Nguyễn Văn Cừ, P.2, Q.5',
    normalizedAddress: '123 duong nguyen van cu phuong 2 quan 5',
    location: { type: 'Point', coordinates: [106.68, 10.75] },
    createdBy: { equals: (id: string) => id === 'user_owner_123' },
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

  describe('searchMapProperties', () => {
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
