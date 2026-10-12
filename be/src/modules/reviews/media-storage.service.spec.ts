import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MediaStorageService } from './media-storage.service.js';
import { MediaUpload } from './schemas/media-upload.schema.js';
import { v2 as cloudinary } from 'cloudinary';

describe('MediaStorageService Unit Suite (Migration 3 - LU2 Review Media Management)', () => {
  let service: MediaStorageService;
  let mockMediaUploadModel: any;

  beforeEach(async () => {
    function MockMediaUploadModel(this: any, dto: any) {
      Object.assign(this, dto);
    }
    MockMediaUploadModel.prototype.save = vi.fn().mockImplementation(function (
      this: any,
    ) {
      return Promise.resolve({ _id: 'media_id_123', ...this });
    });

    mockMediaUploadModel = MockMediaUploadModel;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaStorageService,
        {
          provide: getModelToken(MediaUpload.name),
          useValue: mockMediaUploadModel,
        },
      ],
    }).compile();

    service = module.get<MediaStorageService>(MediaStorageService);
  });

  describe('validateFile', () => {
    it('1. Should validate and accept genuine JPEG buffer', () => {
      const jpegBuffer = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      ]);
      const file = {
        buffer: jpegBuffer,
        size: 1024,
      } as Express.Multer.File;

      const result = service.validateFile(file);
      expect(result.type).toBe('image');
      expect(result.format).toBe('jpg');
    });

    it('2. Should validate and accept genuine PNG buffer', () => {
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      ]);
      const file = {
        buffer: pngBuffer,
        size: 2048,
      } as Express.Multer.File;

      const result = service.validateFile(file);
      expect(result.type).toBe('image');
      expect(result.format).toBe('png');
    });

    it('3. Should validate and accept genuine WebP buffer', () => {
      const webpBuffer = Buffer.concat([
        Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00]),
        Buffer.from('WEBP'),
      ]);
      const file = {
        buffer: webpBuffer,
        size: 512,
      } as Express.Multer.File;

      const result = service.validateFile(file);
      expect(result.type).toBe('image');
      expect(result.format).toBe('webp');
    });

    it('4. Should validate and accept genuine MP4 ISOBMFF container', () => {
      const mp4Buffer = Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x20]),
        Buffer.from('ftypisom'),
        Buffer.from([0x00, 0x00, 0x02, 0x00]),
      ]);
      const file = {
        buffer: mp4Buffer,
        size: 1024 * 1024,
      } as Express.Multer.File;

      const result = service.validateFile(file);
      expect(result.type).toBe('video');
      expect(result.format).toBe('mp4');
    });

    it('5. Should reject tampered or non-media file (magic bytes mismatch)', () => {
      const textBuffer = Buffer.from('Hello world this is not an image file');
      const file = {
        buffer: textBuffer,
        size: textBuffer.length,
      } as Express.Multer.File;

      expect(() => service.validateFile(file)).toThrow(BadRequestException);
    });

    it('6. Should reject image exceeding 5MB limit', () => {
      const largeJpegBuffer = Buffer.alloc(6 * 1024 * 1024);
      largeJpegBuffer[0] = 0xff;
      largeJpegBuffer[1] = 0xd8;
      largeJpegBuffer[2] = 0xff;

      const file = {
        buffer: largeJpegBuffer,
        size: 6 * 1024 * 1024,
      } as Express.Multer.File;

      expect(() => service.validateFile(file)).toThrow(BadRequestException);
    });

    it('7. Should reject video exceeding 40MB limit', () => {
      const largeVideoBuffer = Buffer.alloc(45 * 1024 * 1024);
      largeVideoBuffer.write('ftyp', 4);

      const file = {
        buffer: largeVideoBuffer,
        size: 45 * 1024 * 1024,
      } as Express.Multer.File;

      expect(() => service.validateFile(file)).toThrow(BadRequestException);
    });
  });

  describe('Compensation rollback', () => {
    it('8. Should call cloudinary destroy if MongoDB save fails', async () => {
      const jpegBuffer = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      ]);
      const file = {
        buffer: jpegBuffer,
        size: 1024,
      } as Express.Multer.File;

      vi.spyOn(service, 'uploadFileToCloudinary').mockResolvedValueOnce({
        publicId: 'roomie/reviews/test_img',
        url: 'https://cloudinary.com/test_img.jpg',
      });

      const destroySpy = vi
        .spyOn(cloudinary.uploader, 'destroy')
        .mockResolvedValueOnce({ result: 'ok' } as any);

      vi.spyOn(mockMediaUploadModel.prototype, 'save').mockRejectedValueOnce(
        new Error('MongoDB Connection Error'),
      );

      await expect(
        service.processAndSaveUpload(file, '507f1f77bcf86cd799439033'),
      ).rejects.toThrow('MongoDB Connection Error');

      expect(destroySpy).toHaveBeenCalledWith('roomie/reviews/test_img', {
        resource_type: 'image',
      });
    });
  });
});
