import { router } from 'expo-router';
import type { RemixTemplate } from './types';

type Dispatch = (a: { type: 'pendingRemix'; template: RemixTemplate | null } | { type: 'pendingFamily'; on: boolean }) => void;

/** "Create My Version": hand only the template (story data) to the Create screen. */
export function openRemix(dispatch: Dispatch, template: RemixTemplate) {
  dispatch({ type: 'pendingRemix', template });
  router.navigate('/create');
}

export function openFamilyCreate(dispatch: Dispatch) {
  dispatch({ type: 'pendingFamily', on: true });
  router.navigate('/create');
}
