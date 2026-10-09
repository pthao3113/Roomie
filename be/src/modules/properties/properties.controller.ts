import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { PropertiesService } from './properties.service.js';
import { CreatePropertyDto } from './dto/create-property.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { UserDocument } from '../users/schemas/user.schema.js';

@Controller('properties')
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  /**
   * Create a new Property (Authenticated, includes Basic Deduplication check)
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  async createProperty(
    @CurrentUser() user: UserDocument,
    @Body() dto: CreatePropertyDto,
  ) {
    return this.propertiesService.createProperty(user._id.toString(), dto);
  }

  /**
   * Get detail of an active Property by ID
   */
  @Get(':id')
  async getPropertyById(@Param('id') id: string) {
    return this.propertiesService.findById(id);
  }
}
