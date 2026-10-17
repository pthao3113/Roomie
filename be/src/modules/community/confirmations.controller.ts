import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConfirmationsService } from './confirmations.service.js';
import { ConfirmationTargetParamDto } from './dto/confirmation-target-param.dto.js';
import { QueryMyConfirmationsDto } from './dto/query-my-confirmations.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { UserDocument } from '../users/schemas/user.schema.js';

@Controller()
export class ConfirmationsController {
  constructor(private readonly confirmationsService: ConfirmationsService) {}

  /** Confirm an active Property (Authenticated, not the creator) */
  @Post('properties/:id/confirmation')
  @UseGuards(JwtAuthGuard)
  async confirmProperty(
    @Param() params: ConfirmationTargetParamDto,
    @CurrentUser() user: UserDocument,
  ) {
    return this.confirmationsService.confirmProperty(params.id, user._id.toString());
  }

  /** Withdraw own confirmation of a Property (Authenticated) */
  @Delete('properties/:id/confirmation')
  @UseGuards(JwtAuthGuard)
  async withdrawPropertyConfirmation(
    @Param() params: ConfirmationTargetParamDto,
    @CurrentUser() user: UserDocument,
  ) {
    return this.confirmationsService.withdrawPropertyConfirmation(
      params.id,
      user._id.toString(),
    );
  }

  /** Public confirmation count for a Property (no JWT) */
  @Get('properties/:id/confirmations/summary')
  async getPropertySummary(@Param() params: ConfirmationTargetParamDto) {
    return this.confirmationsService.getPropertySummary(params.id);
  }

  /** Confirm an active RentalUnit (Authenticated, not the creator) */
  @Post('units/:id/confirmation')
  @UseGuards(JwtAuthGuard)
  async confirmRentalUnit(
    @Param() params: ConfirmationTargetParamDto,
    @CurrentUser() user: UserDocument,
  ) {
    return this.confirmationsService.confirmRentalUnit(params.id, user._id.toString());
  }

  /** Withdraw own confirmation of a RentalUnit (Authenticated) */
  @Delete('units/:id/confirmation')
  @UseGuards(JwtAuthGuard)
  async withdrawRentalUnitConfirmation(
    @Param() params: ConfirmationTargetParamDto,
    @CurrentUser() user: UserDocument,
  ) {
    return this.confirmationsService.withdrawRentalUnitConfirmation(
      params.id,
      user._id.toString(),
    );
  }

  /** Public confirmation count for a RentalUnit (no JWT) */
  @Get('units/:id/confirmations/summary')
  async getRentalUnitSummary(@Param() params: ConfirmationTargetParamDto) {
    return this.confirmationsService.getRentalUnitSummary(params.id);
  }

  /** Own active confirmations, paginated (Authenticated) */
  @Get('me/confirmations')
  @UseGuards(JwtAuthGuard)
  async getMyConfirmations(
    @CurrentUser() user: UserDocument,
    @Query() query: QueryMyConfirmationsDto,
  ) {
    return this.confirmationsService.getMyConfirmations(user._id.toString(), query);
  }
}
