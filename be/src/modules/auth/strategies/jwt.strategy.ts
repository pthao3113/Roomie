import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service.js';

export interface JwtPayload {
  sub: string;
  email: string;
  type?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'fallback_secret',
    });
  }

  async validate(payload: JwtPayload) {
    // Reject reactivation tokens used as standard access tokens
    if (payload.type === 'reactivation') {
      throw new UnauthorizedException('Mã xác thực không hợp lệ cho truy cập này');
    }

    const user = await this.usersService.findById(payload.sub);

    if (!user || user.deletedAt !== null) {
      throw new UnauthorizedException('Tài khoản không tồn tại hoặc đã bị xóa');
    }

    if (user.deactivatedAt !== null) {
      throw new ForbiddenException(
        'Tài khoản của bạn đang tạm khóa. Vui lòng đăng nhập lại để mở khóa tài khoản.',
      );
    }

    return user;
  }
}
