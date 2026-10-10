import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId, Types } from 'mongoose';
import { Property, PropertyDocument } from './schemas/property.schema.js';
import { CreatePropertyDto } from './dto/create-property.dto.js';
import { QueryMapPropertyDto } from './dto/query-map-property.dto.js';
import { UpdatePropertyDto } from './dto/update-property.dto.js';
import { AddressNormalizer } from '../../common/utils/address-normalizer.util.js';

export interface PossibleDuplicateItem {
  id: string;
  name: string;
  address: string;
}

@Injectable()
export class PropertiesService {
  constructor(
    @InjectModel(Property.name)
    private readonly propertyModel: Model<PropertyDocument>,
  ) {}

  /**
   * Find nearby active properties with matching normalized address or name (100m radius)
   */
  async findPossibleDuplicates(
    coordinates: number[],
    address: string,
    name: string,
  ): Promise<PossibleDuplicateItem[]> {
    const [lng, lat] = coordinates;

    const nearbyProperties = await this.propertyModel
      .find({
        location: {
          $near: {
            $geometry: { type: 'Point', coordinates: [lng, lat] },
            $maxDistance: 100, // 100 meters
          },
        },
        deletedAt: null,
      })
      .exec();

    const possibleDuplicates: PossibleDuplicateItem[] = [];

    for (const prop of nearbyProperties) {
      const isAddressMatching = AddressNormalizer.isMatch(
        prop.address,
        address,
      );
      const isNameMatching = AddressNormalizer.isMatch(prop.name, name);

      if (isAddressMatching || isNameMatching) {
        possibleDuplicates.push({
          id: prop._id.toString(),
          name: prop.name,
          address: prop.address,
        });
      }
    }

    return possibleDuplicates;
  }

  /**
   * Create a new Property with Basic Deduplication check and full Validation
   */
  async createProperty(
    creatorId: string,
    dto: CreatePropertyDto,
  ): Promise<PropertyDocument> {
    const [lng, lat] = dto.coordinates;

    if (lat < -90 || lat > 90) {
      throw new BadRequestException('Vĩ độ phải nằm trong khoảng từ -90 đến 90');
    }

    const normalizedAddress = AddressNormalizer.normalize(dto.address);

    const possibleDuplicates = await this.findPossibleDuplicates(
      dto.coordinates,
      dto.address,
      dto.name,
    );

    if (possibleDuplicates.length > 0 && dto.confirmDuplicate !== true) {
      throw new HttpException(
        {
          statusCode: HttpStatus.CONFLICT,
          code: 'POSSIBLE_DUPLICATE',
          message:
            'Địa điểm có thể đã tồn tại trên bản đồ. Vui lòng xác nhận nếu bạn muốn tiếp tục tạo mới.',
          possibleDuplicates,
        },
        HttpStatus.CONFLICT,
      );
    }

    const createdProperty = new this.propertyModel({
      name: dto.name,
      address: dto.address,
      normalizedAddress,
      location: {
        type: 'Point',
        coordinates: [lng, lat],
      },
      description: dto.description || '',
      amenities: dto.amenities || [],
      createdBy: new Types.ObjectId(creatorId),
      deletedAt: null,
    });

    return await createdProperty.save();
  }

  /**
   * Search active properties on map using either Radius mode OR Viewport Bounding Box mode
   */
  async searchMapProperties(query: QueryMapPropertyDto): Promise<PropertyDocument[]> {
    const isRadiusMode =
      query.lat !== undefined &&
      query.lng !== undefined &&
      query.radius !== undefined;

    const isViewportMode =
      query.swLng !== undefined &&
      query.swLat !== undefined &&
      query.neLng !== undefined &&
      query.neLat !== undefined;

    // Must select strictly ONE mode
    if ((isRadiusMode && isViewportMode) || (!isRadiusMode && !isViewportMode)) {
      throw new BadRequestException(
        'Vui lòng chọn đúng 1 chế độ tìm kiếm: Bán kính GPS (lat, lng, radius) HOẶC Khung nhìn Viewport (swLng, swLat, neLng, neLat)',
      );
    }

    const limit = Math.min(query.limit || 50, 100);
    const filterQuery: any = { deletedAt: null };

    if (isRadiusMode) {
      filterQuery.location = {
        $near: {
          $geometry: { type: 'Point', coordinates: [query.lng, query.lat] },
          $maxDistance: query.radius,
        },
      };
    } else if (isViewportMode) {
      // Validate Viewport coordinates
      if (query.swLng! >= query.neLng! || query.swLat! >= query.neLat!) {
        throw new BadRequestException(
          'Tọa độ Viewport không hợp lệ: Yêu cầu swLng < neLng và swLat < neLat',
        );
      }

      filterQuery.location = {
        $geoWithin: {
          $box: [
            [query.swLng, query.swLat],
            [query.neLng, query.neLat],
          ],
        },
      };
    }

    return this.propertyModel.find(filterQuery).limit(limit).exec();
  }

  /**
   * Update an existing Property (Allowed only for property creator, location is unchangeable)
   */
  async updateProperty(
    propertyId: string,
    currentUserId: string,
    dto: UpdatePropertyDto,
  ): Promise<PropertyDocument> {
    if (!isValidObjectId(propertyId)) {
      throw new BadRequestException('ID nhà trọ không hợp lệ');
    }

    const property = await this.propertyModel
      .findOne({ _id: propertyId, deletedAt: null })
      .exec();

    if (!property) {
      throw new NotFoundException('Không tìm thấy nhà trọ');
    }

    // Authorization check: Only original creator can update property info
    if (!property.createdBy.equals(currentUserId)) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa thông tin nhà trọ này');
    }

    const newAddress = dto.address ?? property.address;
    const newName = dto.name ?? property.name;

    // Run Deduplication check if address or name is being changed
    if (dto.address !== undefined || dto.name !== undefined) {
      const duplicates = await this.findPossibleDuplicates(
        property.location.coordinates,
        newAddress,
        newName,
      );

      // Exclude self from duplicates list
      const otherDuplicates = duplicates.filter(
        (item) => item.id !== propertyId,
      );

      if (otherDuplicates.length > 0 && dto.confirmDuplicate !== true) {
        throw new HttpException(
          {
            statusCode: HttpStatus.CONFLICT,
            code: 'POSSIBLE_DUPLICATE',
            message:
              'Thông tin nhà trọ sau khi cập nhật có thể bị trùng lặp với một địa điểm khác',
            possibleDuplicates: otherDuplicates,
          },
          HttpStatus.CONFLICT,
        );
      }

      property.name = newName;
      property.address = newAddress;
      property.normalizedAddress = AddressNormalizer.normalize(newAddress);
    }

    if (dto.description !== undefined) {
      property.description = dto.description;
    }

    if (dto.amenities !== undefined) {
      property.amenities = dto.amenities;
    }

    return await property.save();
  }

  /**
   * Find an active Property by ObjectId
   */
  async findById(id: string): Promise<PropertyDocument> {
    if (!isValidObjectId(id)) {
      throw new BadRequestException('ID nhà trọ không hợp lệ');
    }

    const property = await this.propertyModel
      .findOne({ _id: id, deletedAt: null })
      .populate('createdBy', 'displayName email')
      .exec();

    if (!property) {
      throw new NotFoundException('Không tìm thấy nhà trọ');
    }

    return property;
  }
}
