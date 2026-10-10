import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Property, PropertySchema } from './schemas/property.schema.js';
import { RentalUnit, RentalUnitSchema } from './schemas/rental-unit.schema.js';
import { PropertiesService } from './properties.service.js';
import { PropertiesController } from './properties.controller.js';
import { RentalUnitsService } from './rental-units.service.js';
import { RentalUnitsController } from './rental-units.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Property.name, schema: PropertySchema },
      { name: RentalUnit.name, schema: RentalUnitSchema },
    ]),
  ],
  controllers: [PropertiesController, RentalUnitsController],
  providers: [PropertiesService, RentalUnitsService],
  exports: [PropertiesService, RentalUnitsService],
})
export class PropertiesModule {}

