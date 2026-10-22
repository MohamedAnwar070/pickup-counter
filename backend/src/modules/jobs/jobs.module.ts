import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ExpirySweeperService } from './expiry-sweeper.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [ExpirySweeperService],
  exports: [ExpirySweeperService],
})
export class JobsModule {}
