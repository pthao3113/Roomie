import {
  Injectable,
  NotFoundException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId, Types } from 'mongoose';
import { Property, PropertyDocument } from './schemas/property.schema.js';
import { CreatePropertyDto } from './dto/create-property.dto.js';
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

    // Search active properties within 100 meters radius
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

    const normalizedAddressInput = AddressNormalizer.normalize(address);
    const normalizedNameInput = AddressNormalizer.normalize(name);

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

    // Validate latitude boundary explicitly (-90 to 90)
    if (lat < -90 || lat > 90) {
      throw new BadRequestException('Vĩ độ phải nằm trong khoảng từ -90 đến 90');
    }

    const normalizedAddress = AddressNormalizer.normalize(dto.address);

    // Basic Deduplication Check
    const possibleDuplicates = await this.findPossibleDuplicates(
      dto.coordinates,
      dto.address,
      dto.name,
    );

    // If possible duplicates exist and user has not confirmed yet, throw 409 Conflict
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

    // Save new Property document to MongoDB
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
