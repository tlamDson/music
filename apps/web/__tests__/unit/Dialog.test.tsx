import { render, screen, fireEvent, act } from '@testing-library/react';
import Dialog from '../../src/components/ui/Dialog';

describe('Dialog', () => {
  it('renders nothing when closed and was never opened', () => {
    render(
      <Dialog open={false} onClose={jest.fn()} ariaLabel="Test dialog">
        <p>nội dung</p>
      </Dialog>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders content when open', () => {
    render(
      <Dialog open onClose={jest.fn()} ariaLabel="Test dialog">
        <p>nội dung</p>
      </Dialog>,
    );

    expect(screen.getByRole('dialog', { name: 'Test dialog' })).toBeInTheDocument();
    expect(screen.getByText('nội dung')).toBeInTheDocument();
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = jest.fn();
    render(
      <Dialog open onClose={onClose} ariaLabel="Test dialog">
        <p>nội dung</p>
      </Dialog>,
    );

    fireEvent.click(screen.getByTestId('dialog-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when the panel content is clicked', () => {
    const onClose = jest.fn();
    render(
      <Dialog open onClose={onClose} ariaLabel="Test dialog">
        <p>nội dung</p>
      </Dialog>,
    );

    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = jest.fn();
    render(
      <Dialog open onClose={onClose} ariaLabel="Test dialog">
        <p>nội dung</p>
      </Dialog>,
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps rendering briefly after close to let the exit animation play, then unmounts', () => {
    jest.useFakeTimers();
    const { rerender } = render(
      <Dialog open onClose={jest.fn()} ariaLabel="Test dialog">
        <p>nội dung</p>
      </Dialog>,
    );

    rerender(
      <Dialog open={false} onClose={jest.fn()} ariaLabel="Test dialog">
        <p>nội dung</p>
      </Dialog>,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    jest.useRealTimers();
  });
});
