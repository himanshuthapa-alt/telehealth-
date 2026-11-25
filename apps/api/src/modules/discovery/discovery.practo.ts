import { AppError } from '../../platform/http/errors';
import type { DoctorDirectoryProvider } from './discovery.repository';

/**
 * Practo doctor-directory adapter (stub). Selected by `DOCTOR_PROVIDER=practo`.
 *
 * It fails clearly until a partner integration exists: we will not scrape Practo
 * or call undocumented endpoints. To make it real you need partner approval and
 * API credentials (see docs/ARCHITECTURE.md → Doctor network); then implement
 * `search`/`get` against their API, mapping their fields to `DoctorCard` /
 * `DoctorDetail` and setting `source: 'practo'`.
 */
export function createPractoDirectory(): DoctorDirectoryProvider {
  const notConfigured = () => {
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'External doctor directory (Practo) is not configured');
  };
  return {
    search: async () => notConfigured(),
    get: async () => notConfigured(),
  };
}
