import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.21.0', 1783698499446)
export class AddLogoFileIdToApplicationRegistrationFastInstanceCommand
  implements FastInstanceCommand
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "core"."applicationRegistration" ADD "logoFileId" uuid',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."applicationRegistration" ADD CONSTRAINT "UQ_796819fb23559c233e6ebd49f34" UNIQUE ("logoFileId")',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."applicationRegistration" ADD CONSTRAINT "FK_796819fb23559c233e6ebd49f34" FOREIGN KEY ("logoFileId") REFERENCES "core"."file"("id") ON DELETE SET NULL ON UPDATE NO ACTION',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "core"."applicationRegistration" DROP CONSTRAINT "FK_796819fb23559c233e6ebd49f34"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."applicationRegistration" DROP CONSTRAINT "UQ_796819fb23559c233e6ebd49f34"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."applicationRegistration" DROP COLUMN "logoFileId"',
    );
  }
}
