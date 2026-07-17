import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import {
  ImportPreview,
  ImportSession,
  ParsedProduct,
  ImportWarning,
  ImportError,
  ImportFileType,
  ImportResult,
  ImportEventPayload,
} from './interfaces/menu-import.interface';

@Injectable()
export class PreviewService {
  private readonly logger = new Logger(PreviewService.name);
  private sessions = new Map<string, ImportSession>();
  private listeners: Array<(payload: ImportEventPayload) => void> = [];

  onImportEvent(callback: (payload: ImportEventPayload) => void): void {
    this.listeners.push(callback);
  }

  private emit(event: string, payload: ImportEventPayload): void {
    for (const listener of this.listeners) {
      try { listener(payload); } catch { /* ignore */ }
    }
  }

  createPreview(
    products: ParsedProduct[],
    warnings: ImportWarning[],
    errors: ImportError[],
    validProducts: ParsedProduct[],
    fileName: string,
    fileType: ImportFileType,
    cafeId?: string,
    branchId?: string,
  ): ImportPreview {
    const categoriesMap = new Map<string, number>();

    for (const p of validProducts) {
      categoriesMap.set(p.category, (categoriesMap.get(p.category) || 0) + 1);
    }
    for (const p of products) {
      if (!categoriesMap.has(p.category)) {
        categoriesMap.set(p.category, 0);
      }
    }

    const categories = Array.from(categoriesMap.entries())
      .map(([name, productCount]) => ({ name, productCount }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const existingCats = 0;
    const newCats = categories.length;

    const sessionId = uuid();

    return {
      sessionId,
      fileName,
      fileType,
      categories,
      products: validProducts,
      warnings,
      errors,
      stats: {
        totalRows: products.length + errors.length,
        validProducts: validProducts.length,
        invalidProducts: products.length - validProducts.length,
        skippedRows: 0,
        newCategories: newCats,
        existingCategories: existingCats,
      },
    };
  }

  storeSession(preview: ImportPreview, cafeId?: string, branchId?: string): ImportSession {
    const session: ImportSession = {
      id: preview.sessionId,
      status: 'pending',
      preview,
      createdAt: new Date(),
      cafeId,
      branchId,
    };

    this.sessions.set(session.id, session);

    this.logger.log(`Import session ${session.id} created (${preview.products.length} products)`);

    this.emit('menu-import.started', {
      sessionId: session.id,
      fileName: preview.fileName,
      fileType: preview.fileType,
      totalProducts: preview.stats.totalRows,
      validProducts: preview.stats.validProducts,
      invalidProducts: preview.stats.invalidProducts,
      cafeId,
      timestamp: new Date().toISOString(),
    });

    return session;
  }

  getSession(sessionId: string): ImportSession | undefined {
    return this.sessions.get(sessionId);
  }

  async confirmSession(
    sessionId: string,
    importFn: (products: ParsedProduct[], cafeId?: string, branchId?: string) => Promise<{
      importedCount: number;
      failedCount: number;
      errors: ImportError[];
      categoriesCreated: string[];
      productsCreated: string[];
    }>,
  ): Promise<ImportResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException(`Import session ${sessionId} not found`);
    }

    if (session.status !== 'pending') {
      throw new NotFoundException(`Import session ${sessionId} is already ${session.status}`);
    }

    session.status = 'importing';

    try {
      const result = await importFn(session.preview.products, session.cafeId, session.branchId);
      session.status = 'completed';

      this.emit('menu-import.completed', {
        sessionId: session.id,
        fileName: session.preview.fileName,
        fileType: session.preview.fileType,
        totalProducts: session.preview.stats.totalRows,
        validProducts: result.importedCount,
        invalidProducts: result.failedCount,
        cafeId: session.cafeId,
        timestamp: new Date().toISOString(),
      });

      return { sessionId, status: 'completed', ...result };
    } catch (err) {
      session.status = 'failed';
      const message = err instanceof Error ? err.message : 'Import failed';

      this.emit('menu-import.failed', {
        sessionId: session.id,
        fileName: session.preview.fileName,
        fileType: session.preview.fileType,
        totalProducts: session.preview.stats.totalRows,
        validProducts: 0,
        invalidProducts: session.preview.stats.totalRows,
        cafeId: session.cafeId,
        timestamp: new Date().toISOString(),
      });

      return {
        sessionId,
        status: 'failed',
        importedCount: 0,
        failedCount: session.preview.products.length,
        errors: [{ message }],
        categoriesCreated: [],
        productsCreated: [],
      };
    }
  }
}
