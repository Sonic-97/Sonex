import { DomainError, ErrorDetails } from '../../shared-kernel';
export class ProductResolutionError extends DomainError { constructor(code: string, message: string, details?: ErrorDetails) { super(code, message, details); } }
export class ProductNotFoundError extends ProductResolutionError { constructor(reference: string) { super('PRODUCT_RESOLUTION_NOT_FOUND', 'Product was not found', { reference }); } }
export class TenantScopeViolationError extends ProductResolutionError { constructor() { super('PRODUCT_RESOLUTION_SCOPE_VIOLATION', 'Product is outside the requested tenant or cafe scope'); } }
export class ProductDisabledError extends ProductResolutionError { constructor() { super('PRODUCT_RESOLUTION_DISABLED', 'Product is disabled'); } }
export class ProductDeletedError extends ProductResolutionError { constructor() { super('PRODUCT_RESOLUTION_DELETED', 'Product is deleted'); } }
export class ProductHiddenError extends ProductResolutionError { constructor() { super('PRODUCT_RESOLUTION_HIDDEN', 'Product is hidden'); } }
export class ProductOutsideSellingWindowError extends ProductResolutionError { constructor() { super('PRODUCT_RESOLUTION_OUTSIDE_WINDOW', 'Product is outside its selling window'); } }
export class VariantUnavailableError extends ProductResolutionError { constructor() { super('PRODUCT_RESOLUTION_VARIANT_UNAVAILABLE', 'Selected variant is unavailable'); } }
export class ModifierGroupUnknownError extends ProductResolutionError { constructor() { super('PRODUCT_RESOLUTION_MODIFIER_GROUP_UNKNOWN', 'Modifier group is not available for this product'); } }
export class ModifierChoiceUnknownError extends ProductResolutionError { constructor() { super('PRODUCT_RESOLUTION_MODIFIER_CHOICE_UNKNOWN', 'Modifier choice is not available for this product'); } }
export class RequiredModifierMissingError extends ProductResolutionError { constructor() { super('PRODUCT_RESOLUTION_REQUIRED_MODIFIER_MISSING', 'A required modifier selection is missing'); } }
export class DuplicateModifierGroupError extends ProductResolutionError { constructor() { super('PRODUCT_RESOLUTION_DUPLICATE_MODIFIER_GROUP', 'Modifier group was selected more than once'); } }
export class DuplicateModifierChoiceError extends ProductResolutionError { constructor() { super('PRODUCT_RESOLUTION_DUPLICATE_MODIFIER_CHOICE', 'Modifier choice was selected more than once'); } }
export class TooManyModifiersError extends ProductResolutionError { constructor() { super('PRODUCT_RESOLUTION_TOO_MANY_MODIFIERS', 'Too many modifier choices were selected'); } }
export class InactiveModifierError extends ProductResolutionError { constructor() { super('PRODUCT_RESOLUTION_INACTIVE_MODIFIER', 'Selected modifier is inactive'); } }
export class ProductQuantityError extends ProductResolutionError { constructor(message: string) { super('PRODUCT_RESOLUTION_QUANTITY_INVALID', message); } }
export class AvailabilityConfigurationError extends ProductResolutionError { constructor() { super('PRODUCT_RESOLUTION_AVAILABILITY_INVALID', 'Selling window configuration is invalid'); } }
