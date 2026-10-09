import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema.js';

export interface CreateUserData {
  googleId: string;
  email: string;
  displayName: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  /**
   * Find an active or deactivated user by Google ID (excluding soft-deleted ones)
   */
  async findByGoogleId(googleId: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ googleId, deletedAt: null }).exec();
  }

  /**
   * Find an active or deactivated user by Email (excluding soft-deleted ones)
   */
  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ email: email.toLowerCase(), deletedAt: null })
      .exec();
  }

  /**
   * Find a user by MongoDB ObjectId
   */
  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  /**
   * Create a new user account with duplicate key fallback
   */
  async create(userData: CreateUserData): Promise<UserDocument> {
    try {
      const createdUser = new this.userModel({
        googleId: userData.googleId,
        email: userData.email.toLowerCase(),
        displayName: userData.displayName,
        deactivatedAt: null,
        pendingDeletionAt: null,
        deletedAt: null,
      });
      return await createdUser.save();
    } catch (error: any) {
      // Handle MongoDB E11000 Duplicate Key Error (Race condition fallback)
      if (error.code === 11000) {
        const existingUser = await this.findByGoogleId(userData.googleId);
        if (existingUser) {
          return existingUser;
        }
        throw new ConflictException(
          'Email hoặc tài khoản Google này đã được liên kết với một tài khoản khác trong hệ thống',
        );
      }
      throw error;
    }
  }

  /**
   * Deactivate user account (user-initiated temporary pause)
   */
  async deactivate(id: string): Promise<UserDocument> {
    const user = await this.userModel
      .findOneAndUpdate(
        { _id: id, deletedAt: null },
        { $set: { deactivatedAt: new Date() } },
        { new: true },
      )
      .exec();

    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản người dùng');
    }
    return user;
  }

  /**
   * Reactivate user account
   */
  async reactivate(id: string): Promise<UserDocument> {
    const user = await this.userModel
      .findOneAndUpdate(
        { _id: id, deletedAt: null },
        { $set: { deactivatedAt: null } },
        { new: true },
      )
      .exec();

    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản người dùng');
    }
    return user;
  }

  /**
   * Mark user account as pending deletion (Intermediate async deletion state)
   */
  async markPendingDeletion(id: string): Promise<UserDocument> {
    const user = await this.userModel
      .findOneAndUpdate(
        { _id: id, deletedAt: null },
        { $set: { pendingDeletionAt: new Date() } },
        { new: true },
      )
      .exec();

    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản người dùng');
    }
    return user;
  }

  /**
   * Anonymize PII and mark account as permanently deleted (Tombstone state)
   */
  async anonymizeAndMarkDeleted(id: string): Promise<UserDocument> {
    const now = new Date();
    const timestamp = now.getTime();

    const user = await this.userModel
      .findOneAndUpdate(
        { _id: id, deletedAt: null },
        {
          $set: {
            displayName: 'Người dùng đã xóa tài khoản',
            email: `deleted_${id}@anonymous.invalid`,
            googleId: `DELETED_${id}_${timestamp}`,
            deletedAt: now,
            pendingDeletionAt: null,
          },
        },
        { new: true },
      )
      .exec();

    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản người dùng');
    }
    return user;
  }
}
