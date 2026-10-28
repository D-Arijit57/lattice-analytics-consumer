import {useEffect, useMemo, useState} from 'react';
import {loadRecords} from './api.ts';
import {createRefreshController, initialState, type RefreshState} from './refresh.ts';

export function useRecords() {
  const [state, setState] = useState<RefreshState>(initialState);
  const controller = useMemo(() => createRefreshController({load: loadRecords, onChange: setState}), []);
  useEffect(() => {
    controller.start();
    return () => controller.stop();
  }, [controller]);
  return {state, refresh: controller.refresh};
}
