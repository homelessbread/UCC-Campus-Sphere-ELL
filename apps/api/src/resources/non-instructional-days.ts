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
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { PublicRead } from '../auth/public-read';
import { AuditService } from '../common/audit.service';
import { CrudService, RawQuery } from '../common/crud.service';
import { SupabaseService } from '../common/supabase.service';

// Generated from one field spec per resource. Field names match the database columns (snake_case).
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateNonInstructionalDayDto {
  @Matches(DATE, { message: (args) => `${args.property} must look like YYYY-MM-DD` })
  day!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;
}
export class UpdateNonInstructionalDayDto extends PartialType(CreateNonInstructionalDayDto) {}

@Injectable()
export class NonInstructionalDaysService extends CrudService {
  constructor(db: SupabaseService, audit: AuditService) {
    super(db, audit, {
      table: 'non_instructional_days',
      entity: 'non-instructional day',
      filters: ['day'],
      orderBy: 'day',
    });
  }

  protected override createdBy(actor: AuthUser): object {
    return { created_by: actor.id };
  }
}

@Controller('non-instructional-days')
export class NonInstructionalDaysController {
  constructor(private readonly service: NonInstructionalDaysService) {}

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
  create(@Body() dto: CreateNonInstructionalDayDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Roles('admin')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNonInstructionalDayDto,
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
