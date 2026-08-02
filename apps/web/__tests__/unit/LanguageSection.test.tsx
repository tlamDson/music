import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LanguageSection from '../../src/components/settings/LanguageSection';

const mockRefresh = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

describe('LanguageSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.cookie = 'NEXT_LOCALE=; path=/; max-age=0';
  });

  it('renders a button for each supported locale', () => {
    render(<LanguageSection />);

    expect(screen.getByRole('button', { name: 'Tiếng Việt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument();
  });

  it('marks the active locale (vi, per the Jest next-intl mock) as pressed', () => {
    render(<LanguageSection />);

    expect(screen.getByRole('button', { name: 'Tiếng Việt' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('writes the NEXT_LOCALE cookie and refreshes the router when a locale is picked', async () => {
    render(<LanguageSection />);

    await userEvent.click(screen.getByRole('button', { name: 'English' }));

    expect(document.cookie).toContain('NEXT_LOCALE=en');
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});
