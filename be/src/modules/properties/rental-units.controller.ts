import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { RentalUnitsService } from './rental-units.service.js';
import { CreateRentalUnitDto } from './dto/create-rental-unit.dto.js';
import { UpdateRentalUnitDto } from './dto/update-rental-unit.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { UserDocument } from '../users/schemas/user.schema.js';

@Controller()
export class RentalUnitsController {
  constructor(private readonly rentalUnitsService: RentalUnitsService) {}

  /**
   * Create a new RentalUnit inside an active Property (Authenticated)
   */
  @Post('properties/:propertyId/units')
  @UseGuards(JwtAuthGuard)
  async createRentalUnit(
    @Param('propertyId') propertyId: string,
    @CurrentUser() user: UserDocument,
    @Body() dto: CreateRentalUnitDto,
  ) {
    return this.rentalUnitsService.createRentalUnit(
      propertyId,
      user._id.toString(),
      dto,
    );
  }

  /**
   * Get all active RentalUnits for an active Property
   */
  @Get('properties/:propertyId/units')
  async getRentalUnitsByProperty(@Param('propertyId') propertyId: string) {
    return this.rentalUnitsService.getRentalUnitsByProperty(propertyId);
  }

  /**
   * Update an existing active RentalUnit (Authenticated, only unit creator)
   */
  @Patch('units/:id')
  @UseGuards(JwtAuthGuard)
  async updateRentalUnit(
    @Param('id') id: string,
    @CurrentUser() user: UserDocument,
    @Body() dto: UpdateRentalUnitDto,
  ) {
    return this.rentalUnitsService.updateRentalUnit(
      id,
      user._id.toString(),
      dto,
    );
  }

  /**
   * Soft-delete an active RentalUnit (Authenticated, only unit creator)
   */
  @Delete('units/:id')
  @UseGuards(JwtAuthGuard)
  async deleteRentalUnit(
    @Param('id') id: string,
    @CurrentUser() user: UserDocument,
  ) {
    return this.rentalUnitsService.deleteRentalUnit(id, user._id.toString());
  }
}
