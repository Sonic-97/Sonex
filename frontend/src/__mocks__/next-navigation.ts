export const useRouter = jest.fn(() => ({ push: jest.fn(), replace: jest.fn() }));
export const usePathname = jest.fn(() => '/merchant/dashboard');
export const useParams = jest.fn(() => ({ id: 'test-order-123' }));
