import { PipeTransform, ArgumentMetadata, HttpStatus } from '@nestjs/common';
import { ZodSchema, ZodError } from 'zod';
import { AppError } from '../errors/app-error';

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata) {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Request validation failed',
          HttpStatus.BAD_REQUEST,
          error.errors.map((err) => ({
            path: err.path.join('.'),
            message: err.message,
          })),
        );
      }
      throw new AppError('VALIDATION_ERROR', 'Validation failed', HttpStatus.BAD_REQUEST);
    }
  }
}
