import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PropertiesService } from './properties.service.js';
import { CreatePropertyDto } from './dto/create-property.dto.js';
import { QueryMapPropertyDto } from './dto/query-map-property.dto.js';
import { UpdatePropertyDto } from './dto/update-property.dto.js';
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
   * Search active properties on interactive rental map (Radius or Viewport mode)
   * NOTE: Must be declared BEFORE GET /properties/:id to avoid matching 'map' as an ObjectId parameter
   */
  @Get('map')
  async searchMapProperties(@Query() query: QueryMapPropertyDto) {
    return this.propertiesService.searchMapProperties(query);
  }

  /**
   * Get detail of an active Property by ID
   */
  @Get(':id')
  async getPropertyById(@Param('id') id: string) {
    return this.propertiesService.findById(id);
  }

  /**
   * Update an existing Property (Allowed only for property creator)
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async updateProperty(
    @Param('id') id: string,
    @CurrentUser() user: UserDocument,
    @Body() dto: UpdatePropertyDto,
  ) {
    return this.propertiesService.updateProperty(id, user._id.toString(), dto);
  }
}
