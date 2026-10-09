import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { UsersService } from '../users/users.service.js';
import { UserDocument } from '../users/schemas/user.schema.js';

@Injectable()
export class AuthService {
  private googleOAuthClient: OAuth2Client;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {
    const googleClientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    this.googleOAuthClient = new OAuth2Client(googleClientId);
  }

  /**
   * Verify Google ID Token and authenticate/register user
   */
  async googleLogin(idToken: string) {
    let googleId: string;
    let email: string;
    let displayName: string;

    try {
      const googleClientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
      const ticket = await this.googleOAuthClient.verifyIdToken({
        idToken,
        audience: googleClientId,
      });
      const payload = ticket.getPayload();

      if (!payload || !payload.sub || !payload.email) {
        throw new UnauthorizedException('Mã Google Token không hợp lệ');
      }

      // Verify Google issuer
      const validIssuers = ['accounts.google.com', 'https://accounts.google.com'];
      if (!payload.iss || !validIssuers.includes(payload.iss)) {
        throw new UnauthorizedException('Nguồn phát hành Google Token không hợp lệ');
      }

      // Verify email verification status
      if (payload.email_verified === false) {
        throw new UnauthorizedException('Địa chỉ Email Google chưa được xác minh');
      }

      googleId = payload.sub;
      email = payload.email;
      displayName = payload.name || payload.email.split('@')[0];
    } catch (error: any) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof BadRequestException ||
        error instanceof HttpException
      ) {
        throw error;
      }
      throw new UnauthorizedException(
        `Xác thực Google thất bại: ${error.message || 'Token không hợp lệ'}`,
      );
    }

    // Check if user exists in database
    let user = await this.usersService.findByGoogleId(googleId);

    if (!user) {
      // Create new user account if not existing
      user = await this.usersService.create({
        googleId,
        email,
        displayName,
      });
    }

    // Handle DEACTIVATED user account state
    if (user.deactivatedAt !== null) {
      const reactivationToken = this.jwtService.sign(
        {
          sub: user._id.toString(),
          googleId: user.googleId,
          type: 'reactivation',
        },
        { expiresIn: '15m' },
      );

      throw new HttpException(
        {
          statusCode: HttpStatus.FORBIDDEN,
          code: 'ACCOUNT_DEACTIVATED',
          message:
            'Tài khoản của bạn đang tạm khóa. Bạn có muốn kích hoạt lại tài khoản không?',
          reactivationToken,
          user: {
            id: user._id,
            email: user.email,
            displayName: user.displayName,
          },
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // Issue standard JWT Access Token (1 hour expiration configured in JwtModule)
    const accessToken = this.jwtService.sign({
      sub: user._id.toString(),
      email: user.email,
    });

    return {
      accessToken,
      user: this.sanitizeUser(user),
    };
  }

  /**
   * Confirm account reactivation using time-bound reactivation token
   */
  async reactivateAccount(reactivationToken: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(reactivationToken);
    } catch {
      throw new UnauthorizedException(
        'Mã xác thực mở khóa đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.',
      );
    }

    if (payload.type !== 'reactivation') {
      throw new UnauthorizedException('Mã xác thực không đúng loại');
    }

    const existingUser = await this.usersService.findById(payload.sub);

    if (!existingUser || existingUser.deletedAt !== null) {
      throw new UnauthorizedException(
        'Tài khoản đã bị xóa vĩnh viễn, không thể khôi phục',
      );
    }

    if (existingUser.deactivatedAt === null) {
      throw new BadRequestException('Tài khoản đã ở trạng thái đang hoạt động');
    }

    const user = await this.usersService.reactivate(payload.sub);

    const accessToken = this.jwtService.sign({
      sub: user._id.toString(),
      email: user.email,
    });

    return {
      accessToken,
      user: this.sanitizeUser(user),
    };
  }

  /**
   * Helper to format public user output object
   */
  private sanitizeUser(user: UserDocument) {
    return {
      id: user._id,
      googleId: user.googleId,
      email: user.email,
      displayName: user.displayName,
      createdAt: (user as any).createdAt,
      updatedAt: (user as any).updatedAt,
    };
  }
}
