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

export class CreateSectionDto {
  @IsUUID()
  term_id!: string;

  @IsUUID()
  subject_id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  section_code!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5000)
  enrollment?: number;
}
export class UpdateSectionDto extends PartialType(CreateSectionDto) {}

@Injectable()
export class SectionsService extends CrudService {
  constructor(db: SupabaseService, audit: AuditService) {
    super(db, audit, {
      table: 'class_sections',
      entity: 'class section',
      filters: ['term_id', 'subject_id'],
      orderBy: 'section_code',
    });
  }
}

@Controller('sections')
export class SectionsController {
  constructor(private readonly service: SectionsService) {}

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
  create(@Body() dto: CreateSectionDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Roles('admin')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSectionDto,
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
