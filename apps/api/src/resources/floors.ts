import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PartialType } from '@nestjs/mapped-types';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { PublicRead } from '../auth/public-read';
import { AuditService } from '../common/audit.service';
import { CrudService, RawQuery } from '../common/crud.service';
import { SupabaseService } from '../common/supabase.service';

// Generated from one field spec per resource. Field names match the database columns (snake_case).

export class CreateFloorDto {
  @IsUUID()
  building_id!: string;

  @IsInt()
  @Min(-5)
  @Max(60)
  level!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  model_object_id?: string;
}
export class UpdateFloorDto extends PartialType(CreateFloorDto) {}

@Injectable()
export class FloorsService extends CrudService {
  constructor(db: SupabaseService, audit: AuditService) {
    super(db, audit, {
      table: 'floors',
      entity: 'floor',
      filters: ['building_id', 'level'],
      orderBy: 'level',
    });
  }
}

@Controller('floors')
export class FloorsController {
  constructor(private readonly service: FloorsService) {}

  @PublicRead()
  @Get()
  list(@Query() query: RawQuery) {
    return this.service.list(query);
  }

  @PublicRead()
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }

  @Roles('admin')
  @Post()
  create(@Body() dto: CreateFloorDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Roles('admin')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFloorDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Roles('admin')
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }
}
