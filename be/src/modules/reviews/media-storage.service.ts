import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import 'multer';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import {
  MediaUpload,
  MediaUploadDocument,
} from './schemas/media-upload.schema.js';

export interface ValidatedMediaInfo {
  type: 'image' | 'video';
  format: string;
}

@Injectable()
export class MediaStorageService {
  private readonly logger = new Logger(MediaStorageService.name);

  constructor(
    @InjectModel(MediaUpload.name)
    private readonly mediaUploadModel: Model<MediaUploadDocument>,
  ) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'roomie-demo',
      api_key: process.env.CLOUDINARY_API_KEY || 'demo-key',
      api_secret: process.env.CLOUDINARY_API_SECRET || 'demo-secret',
    });
  }

  /**
   * Validate file binary magic bytes and size (ISOBMFF container check for video, header bytes for image)
   */
  validateFile(file: Express.Multer.File): ValidatedMediaInfo {
    if (!file || !file.buffer || file.buffer.length < 12) {
      throw new BadRequestException('Tệp tải lên không hợp lệ hoặc rỗng');
    }

    const buf = file.buffer;
    const maxImageSize = 5 * 1024 * 1024; // 5 MB
    const maxVideoSize = 40 * 1024 * 1024; // 40 MB

    // 1. JPEG Check: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      if (file.size > maxImageSize) {
        throw new BadRequestException('Ảnh JPEG vượt quá dung lượng tối đa 5MB');
      }
      return { type: 'image', format: 'jpg' };
    }

    // 2. PNG Check: 89 50 4E 47 0D 0A 1A 0A
    if (
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    ) {
      if (file.size > maxImageSize) {
        throw new BadRequestException('Ảnh PNG vượt quá dung lượng tối đa 5MB');
      }
      return { type: 'image', format: 'png' };
    }

    // 3. WebP Check: RIFF .... WEBP
    if (
      buf[0] === 0x52 &&
      buf[1] === 0x49 &&
      buf[2] === 0x46 &&
      buf[3] === 0x46 &&
      buf.toString('ascii', 8, 12) === 'WEBP'
    ) {
      if (file.size > maxImageSize) {
        throw new BadRequestException('Ảnh WebP vượt quá dung lượng tối đa 5MB');
      }
      return { type: 'image', format: 'webp' };
    }

    // 4. Video ISOBMFF check (MP4 / QuickTime MOV): Box ftyp at offset 4..8
    const boxType = buf.toString('ascii', 4, 8);
    if (boxType === 'ftyp' || boxType === 'moov' || boxType === 'wide') {
      if (file.size > maxVideoSize) {
        throw new BadRequestException('Video vượt quá dung lượng tối đa 40MB');
      }
      return { type: 'video', format: 'mp4' };
    }

    throw new BadRequestException(
      'Định dạng tệp không được hỗ trợ hoặc bị giả mạo. Chỉ hỗ trợ ảnh JPEG, PNG, WebP và video MP4/MOV',
    );
  }

  /**
   * Upload stream to Cloudinary with compensation rollback if database save fails
   */
  async uploadFileToCloudinary(
    file: Express.Multer.File,
    info: ValidatedMediaInfo,
  ): Promise<{ publicId: string; url: string }> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'roomie/reviews',
          resource_type: info.type === 'video' ? 'video' : 'image',
        },
        (error, result: UploadApiResponse | undefined) => {
          if (error || !result) {
            return reject(
              new BadRequestException(
                `Lỗi khi tải tệp lên máy chủ lưu trữ: ${error?.message || 'Không có kết quả'}`,
              ),
            );
          }
          resolve({
            publicId: result.public_id,
            url: result.secure_url || result.url,
          });
        },
      );

      uploadStream.end(file.buffer);
    });
  }

  /**
   * Process and save uploaded media for a user
   */
  async processAndSaveUpload(
    file: Express.Multer.File,
    userId: string,
  ): Promise<MediaUploadDocument> {
    const info = this.validateFile(file);
    const { publicId, url } = await this.uploadFileToCloudinary(file, info);

    try {
      const mediaUpload = new this.mediaUploadModel({
        publicId,
        url,
        type: info.type,
        userId: new Types.ObjectId(userId),
        reviewId: null,
        isAttached: false,
        detachedAt: null,
      });

      return await mediaUpload.save();
    } catch (dbError) {
      // Rollback compensation: Delete orphaned file from Cloudinary immediately
      this.logger.warn(
        `Lỗi lưu MediaUpload vào DB, đang xóa bù file trên Cloudinary: ${publicId}`,
      );
      try {
        await cloudinary.uploader.destroy(publicId, {
          resource_type: info.type === 'video' ? 'video' : 'image',
        });
      } catch (compensationError: any) {
        this.logger.error(
          `[ORPHAN_CLOUDINARY_LEAK] Không thể xóa bù file ${publicId}: ${compensationError.message}`,
        );
      }
      throw dbError;
    }
  }

  /**
   * Delete media from Cloudinary (returns true if deleted or not found, false on failure)
   */
  async destroyCloudinaryMedia(
    publicId: string,
    type: 'image' | 'video',
  ): Promise<boolean> {
    try {
      const res = await cloudinary.uploader.destroy(publicId, {
        resource_type: type === 'video' ? 'video' : 'image',
      });
      return res.result === 'ok' || res.result === 'not found';
    } catch (err: any) {
      this.logger.error(
        `Không thể xóa file ${publicId} trên Cloudinary: ${err.message}`,
      );
      return false;
    }
  }
}
