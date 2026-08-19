/**
 * @fileoverview Public API for the auth module.
 */

export {
  setAuth,
  deleteAuth,
  getAuth,
  listProvidersWithAuth,
  hasAuth,
} from './store.js';
export type { Provider, Auth } from './types.js';
