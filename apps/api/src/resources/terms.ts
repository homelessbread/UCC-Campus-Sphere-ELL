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
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { PublicRead } from '../auth/public-read';
import { AuditService } from '../common/audit.service';
import { CrudService, RawQuery } from '../common/crud.service';
import { SupabaseService } from '../common/supabase.service';

// Generated from one field spec per resource. Field names match the database columns (snake_case).
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateTermDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @Matches(DATE, { message: (args) => `${args.property} must look like YYYY-MM-DD` })
  start_date!: string;

  @Matches(DATE, { message: (args) => `${args.property} must look like YYYY-MM-DD` })
  end_date!: string;

  @IsOptional()
  @IsBoolean()
  is_current?: boolean;
}
export class UpdateTermDto extends PartialType(CreateTermDto) {}

@Injectable()
export class TermsService extends CrudService {
  constructor(db: SupabaseService, audit: AuditService) {
    super(db, audit, {
      table: 'academic_terms',
      entity: 'academic term',
      filters: ['is_current'],
      orderBy: 'start_date',
    });
  }
}

@Controller('terms')
export class TermsController {
  constructor(private readonly service: TermsService) {}

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
  create(@Body() dto: CreateTermDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Roles('admin')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTermDto,
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
