import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { PlayerProvider } from '../../src/components/player/PlayerProvider';

/**
 * PlayerProvider nằm ở layout gốc của app, nên mọi trang có nút phát đều chạy
 * bên trong nó — test render trang phải dựng lại đúng bối cảnh đó.
 */
export function renderWithPlayer(ui: ReactElement) {
  return render(<PlayerProvider>{ui}</PlayerProvider>);
}
