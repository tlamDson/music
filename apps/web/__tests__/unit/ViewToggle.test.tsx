import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ViewToggle from '../../src/components/ui/ViewToggle';

describe('ViewToggle', () => {
  it('marks the active mode as pressed', () => {
    render(<ViewToggle value="list" onChange={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Xem dạng danh sách' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Xem dạng lưới' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('calls onChange with the clicked mode', async () => {
    const onChange = jest.fn();
    render(<ViewToggle value="list" onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Xem dạng lưới' }));

    expect(onChange).toHaveBeenCalledWith('grid');
  });
});
