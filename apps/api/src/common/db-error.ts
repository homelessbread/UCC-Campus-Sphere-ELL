import {
  BadRequestException,
  ConflictException,
  HttpException,
  InternalServerErrorException,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';

interface PgLikeError {
  code?: string;
  message?: string;
  details?: string | null;
}

const logger = new Logger('Database');

/** Turns a PostgREST/Postgres error into a clean HTTP error. Raw SQL text is logged, never returned. */
export function dbError(error: PgLikeError): HttpException {
  const code = error.code ?? '';
  const text = error.message ?? '';
  switch (code) {
    // Scheduling rules raised by the database (see migration 4). The message is written for people and safe to show.
    case 'UC001': // room inactive
    case 'UC002': // room under maintenance
    case 'UC008': // clashes with a one-date change or another class
      return new ConflictException(text);
    case 'UC003': // capacity below enrollment
    case 'UC004': // wrong room type
    case 'UC005': // missing equipment
    case 'UC006': // outside the academic term
    case 'UC009': // invalid input
    case 'UC010': // teacher inactive
    case 'UC011': // invalid exception date
      return new UnprocessableEntityException(text);
    case '40P01': // deadlock detected
    case '40001': // serialization failure
      return new ConflictException(
        'Another change to the same room or teacher was happening at the same moment. Please try again.',
      );
    case '23P01':
      if (text.includes('class_schedules_no_room_overlap')) {
        return new ConflictException(
          'This room is already booked at an overlapping time on at least one date in this range.',
        );
      }
      if (text.includes('class_schedules_no_teacher_overlap')) {
        return new ConflictException(
          'This teacher already teaches another class at an overlapping time on at least one date in this range.',
        );
      }
      return new ConflictException('This change overlaps an existing term or maintenance block.');
    case '23505':
      return new ConflictException('A record with the same unique value already exists.');
    case '23503':
      return new ConflictException(
        'This record refers to something that does not exist, or other records still depend on it.',
      );
    case '23514':
    case '22P02':
    case '22007':
    case '22008':
    case '22023':
    case '23502':
      return new BadRequestException('One or more values are invalid for this record.');
    case 'PGRST116':
      return new BadRequestException('The record was not found.');
    default:
      logger.error(`Unexpected database error ${code}: ${error.message ?? ''}`);
      return new InternalServerErrorException('The database request failed.');
  }
}
