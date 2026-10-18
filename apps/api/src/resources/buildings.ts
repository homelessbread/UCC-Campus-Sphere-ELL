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
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { PublicRead } from '../auth/public-read';
import { AuditService } from '../common/audit.service';
import { CrudService, RawQuery } from '../common/crud.service';
import { SupabaseService } from '../common/supabase.service';

// Generated from one field spec per resource. Field names match the database columns (snake_case).

export class CreateBuildingDto {
  @IsUUID()
  campus_id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  model_object_id?: string;
}
export class UpdateBuildingDto extends PartialType(CreateBuildingDto) {}

@Injectable()
export class BuildingsService extends CrudService {
  constructor(db: SupabaseService, audit: AuditService) {
    super(db, audit, {
      table: 'buildings',
      entity: 'building',
      filters: ['campus_id'],
      orderBy: 'code',
    });
  }
}

@Controller('buildings')
export class BuildingsController {
  constructor(private readonly service: BuildingsService) {}

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
  create(@Body() dto: CreateBuildingDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Roles('admin')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBuildingDto,
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
