import { Module } from '@nestjs/common';
import { AdminController, AdminService } from './admin/admin';
import { AvailabilityController } from './scheduling/availability.controller';
import { AvailabilityService } from './scheduling/availability.service';
import { CommonModule } from './common/common.module';
import { HealthModule } from './health/health.module';
import { MeController } from './me/me.controller';
import {
  EquipmentTypesService,
  ReferenceController,
  RoomCategoriesService,
  RoomEquipmentService,
} from './reference/reference.controller';
import { BuildingsController, BuildingsService } from './resources/buildings';
import { ClassroomsController, ClassroomsService } from './resources/classrooms';
import { FloorsController, FloorsService } from './resources/floors';
import {
  MaintenanceBlocksController,
  MaintenanceBlocksService,
} from './resources/maintenance-blocks';
import {
  NonInstructionalDaysController,
  NonInstructionalDaysService,
} from './resources/non-instructional-days';
import {
  ScheduleCancellationsController,
  ScheduleCancellationsService,
} from './resources/schedule-cancellations';
import {
  ScheduleExceptionsController,
  ScheduleExceptionsService,
} from './resources/schedule-exceptions';
import { SchedulesController, SchedulesService } from './resources/schedules';
import { SectionsController, SectionsService } from './resources/sections';
import { SubjectsController, SubjectsService } from './resources/subjects';
import { TeachersController, TeachersService } from './resources/teachers';
import { TermsController, TermsService } from './resources/terms';

@Module({
  imports: [CommonModule, HealthModule],
  controllers: [
    MeController,
    ReferenceController,
    AvailabilityController,
    AdminController,
    BuildingsController,
    FloorsController,
    ClassroomsController,
    TeachersController,
    SubjectsController,
    SectionsController,
    TermsController,
    SchedulesController,
    ScheduleExceptionsController,
    ScheduleCancellationsController,
    NonInstructionalDaysController,
    MaintenanceBlocksController,
  ],
  providers: [
    AvailabilityService,
    AdminService,
    RoomCategoriesService,
    EquipmentTypesService,
    RoomEquipmentService,
    BuildingsService,
    FloorsService,
    ClassroomsService,
    TeachersService,
    SubjectsService,
    SectionsService,
    TermsService,
    SchedulesService,
    ScheduleExceptionsService,
    ScheduleCancellationsService,
    NonInstructionalDaysService,
    MaintenanceBlocksService,
  ],
})
export class AppModule {}
