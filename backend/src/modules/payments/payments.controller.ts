import {
  Controller,
  Post,
  Req,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
} from '@nestjs/common';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { normalizeWebhookPayload } from './payments.schema';
import { verifySignature } from '../../common/crypto/hmac';
import { AppError } from '../../common/errors/app-error';
import { WebhookResponse } from '../../common';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);
  private readonly webhookSecret: string;
  private readonly demoMode: boolean;

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly configService: ConfigService,
  ) {
    this.webhookSecret = this.configService.get<string>('WEBHOOK_SECRET') || '';
    this.demoMode = this.configService.get<boolean>('DEMO_MODE') === true;
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-signature') signature?: string,
  ): Promise<WebhookResponse> {
    const rawBody = req.rawBody;

    // 1. Webhook signature verification on raw bytes
    if (!verifySignature(rawBody, signature, this.webhookSecret)) {
      this.logger.warn('Rejected webhook: invalid or missing signature');
      throw new AppError(
        'INVALID_SIGNATURE',
        'Invalid or missing HMAC signature header',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // 2. Parse and validate JSON payload
    let rawJson: Record<string, unknown>;
    try {
      rawJson = JSON.parse(rawBody!.toString('utf8'));
    } catch {
      throw new AppError('VALIDATION_ERROR', 'Malformed JSON in request body', HttpStatus.BAD_REQUEST);
    }

    let payload;
    try {
      payload = normalizeWebhookPayload(rawJson);
    } catch (err: any) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Validation failed: ${err.message || 'invalid webhook payload'}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.paymentsService.handleWebhook(payload, rawJson);
  }

  @Post('demo/:orderId')
  @HttpCode(HttpStatus.OK)
  async demoPayment(@Param('orderId') orderId: string): Promise<WebhookResponse> {
    if (!this.demoMode) {
      throw new AppError(
        'DEMO_DISABLED',
        'Demo checkout is disabled. Use a signed provider webhook.',
        HttpStatus.NOT_FOUND,
      );
    }

    this.logger.log(`[DEMO] Processing demo payment for orderId=${orderId}`);
    return this.paymentsService.handleDemoPayment(orderId);
  }
}
