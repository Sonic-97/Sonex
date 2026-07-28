import { ApplicationError, ErrorDetails } from '../../shared-kernel';

export class ProductCatalogValidationError extends ApplicationError {
  constructor(message: string, details?: ErrorDetails) {
    super('PRODUCT_CATALOG_VALIDATION_FAILED', message, details);
  }
}

export class UnsupportedProductReferenceError extends ApplicationError {
  constructor(referenceKind: string) {
    super('PRODUCT_CATALOG_REFERENCE_UNSUPPORTED', 'This product reference is not supported by catalog persistence', { referenceKind });
  }
}

export class CafeTenantIdentityViolationError extends ApplicationError {
  constructor() {
    super('PRODUCT_CATALOG_TENANT_SCOPE_INVALID', 'The operational tenant does not match the requested cafe');
  }
}
