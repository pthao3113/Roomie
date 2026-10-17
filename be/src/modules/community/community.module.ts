import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Confirmation, ConfirmationSchema } from './schemas/confirmation.schema.js';
import { Property, PropertySchema } from '../properties/schemas/property.schema.js';
import {
  RentalUnit,
  RentalUnitSchema,
} from '../properties/schemas/rental-unit.schema.js';
import { ConfirmationsService } from './confirmations.service.js';
import { ConfirmationsController } from './confirmations.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Confirmation.name, schema: ConfirmationSchema },
      { name: Property.name, schema: PropertySchema },
      { name: RentalUnit.name, schema: RentalUnitSchema },
    ]),
  ],
  controllers: [ConfirmationsController],
  providers: [ConfirmationsService],
  exports: [ConfirmationsService],
})
export class CommunityModule {}
