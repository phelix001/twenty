import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { ServerFileFolder } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { Repository } from 'typeorm';
import { type QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

import { ApplicationRegistrationEntity } from 'src/engine/core-modules/application/application-registration/application-registration.entity';
import { type ApplicationRegistrationGalleryImage } from 'src/engine/core-modules/application/application-registration/types/application-registration-gallery-image.type';
import { isImageFilePath } from 'src/engine/core-modules/application/application-registration/utils/is-image-file-path.util';
import { toGalleryImagePaths } from 'src/engine/core-modules/application/application-registration/utils/to-gallery-image-paths.util';
import { ServerFileStorageService } from 'src/engine/core-modules/file-storage/services/server-file-storage.service';
import { prepareFileForStorageOrThrow } from 'src/engine/core-modules/file-storage/utils/prepare-file-for-storage-or-throw.util';
import type { ApplicationManifest } from 'twenty-shared/application';

export type ReadRegistrationAsset = (path: string) => Promise<Buffer | null>;

// Copies the manifest logo and gallery images into instance-global server file
// storage so their display URLs can be built at query time from fileIds,
// regardless of how the registration was created (LOCAL, TARBALL).
// NPM registrations are excluded: their assets are served from the registry
// CDN, resolved at query time from the package name and version.
@Injectable()
export class ApplicationRegistrationAssetService {
  private readonly logger = new Logger(
    ApplicationRegistrationAssetService.name,
  );

  constructor(
    @InjectRepository(ApplicationRegistrationEntity)
    private readonly applicationRegistrationRepository: Repository<ApplicationRegistrationEntity>,
    private readonly serverFileStorageService: ServerFileStorageService,
  ) {}

  async storeRegistrationAssets({
    applicationRegistrationId,
    manifestApplication,
    readAsset,
  }: {
    applicationRegistrationId: string;
    manifestApplication: ApplicationManifest | undefined;
    readAsset: ReadRegistrationAsset;
  }): Promise<void> {
    const logoFileId = await this.storeLogoFile({
      applicationRegistrationId,
      manifestApplication,
      readAsset,
    });

    const galleryImages = await this.storeGalleryImageFiles({
      applicationRegistrationId,
      manifestApplication,
      readAsset,
    });

    await this.applicationRegistrationRepository.update(
      applicationRegistrationId,
      {
        logoFileId,
        galleryImages,
      } as QueryDeepPartialEntity<ApplicationRegistrationEntity>,
    );
  }

  private async storeLogoFile({
    applicationRegistrationId,
    manifestApplication,
    readAsset,
  }: {
    applicationRegistrationId: string;
    manifestApplication: ApplicationManifest | undefined;
    readAsset: ReadRegistrationAsset;
  }): Promise<string | null> {
    const logoPath = manifestApplication?.logo ?? manifestApplication?.logoUrl;

    if (!isDefined(logoPath)) {
      return null;
    }

    return this.storeAssetFile({
      applicationRegistrationId,
      path: logoPath,
      readAsset,
    });
  }

  private async storeGalleryImageFiles({
    applicationRegistrationId,
    manifestApplication,
    readAsset,
  }: {
    applicationRegistrationId: string;
    manifestApplication: ApplicationManifest | undefined;
    readAsset: ReadRegistrationAsset;
  }): Promise<ApplicationRegistrationGalleryImage[]> {
    const galleryImages: ApplicationRegistrationGalleryImage[] = [];

    for (const path of toGalleryImagePaths(manifestApplication)) {
      const fileId = await this.storeAssetFile({
        applicationRegistrationId,
        path,
        readAsset,
      });

      // Entries without a fileId (absolute URLs, missing files) are kept so
      // the query-time URL resolution can still fall back on the raw path.
      galleryImages.push({ path, fileId });
    }

    return galleryImages;
  }

  private async storeAssetFile({
    applicationRegistrationId,
    path,
    readAsset,
  }: {
    applicationRegistrationId: string;
    path: string;
    readAsset: ReadRegistrationAsset;
  }): Promise<string | null> {
    if (
      path.startsWith('http://') ||
      path.startsWith('https://') ||
      !isImageFilePath(path)
    ) {
      return null;
    }

    try {
      const contents = await readAsset(path);

      if (!isDefined(contents)) {
        return null;
      }

      const { sourceFile, mimeType } = await prepareFileForStorageOrThrow({
        sourceFile: contents,
        resourcePath: path,
      });

      const savedFile = await this.serverFileStorageService.writeServerFile({
        fileFolder: ServerFileFolder.ApplicationRegistration,
        applicationRegistrationId,
        resourcePath: path,
        contents: Buffer.isBuffer(sourceFile)
          ? sourceFile
          : Buffer.from(sourceFile),
        mimeType,
      });

      return savedFile.id;
    } catch (error) {
      this.logger.warn(
        `Failed to store asset "${path}" for registration ${applicationRegistrationId}: ${error.message}`,
      );

      return null;
    }
  }
}
