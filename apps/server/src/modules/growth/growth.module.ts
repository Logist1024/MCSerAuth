import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GrowthController } from './growth.controller.js';
import { ProgressService } from './progress.service.js';

/**
 * Growth economy domain. Exported so forum authors can show level badges and
 * texture uploads can enforce the cape unlock.
 */
@Module({
  imports: [AuthModule],
  controllers: [GrowthController],
  providers: [ProgressService],
  exports: [ProgressService],
})
export class GrowthModule {}
