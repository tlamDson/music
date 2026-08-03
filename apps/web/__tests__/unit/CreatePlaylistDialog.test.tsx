import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreatePlaylistDialog from '../../src/components/playlist/CreatePlaylistDialog';

describe('CreatePlaylistDialog', () => {
  it('does not render when closed', () => {
    render(<CreatePlaylistDialog open={false} onClose={jest.fn()} onCreate={jest.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls onCreate with the trimmed name and clears the field on success', async () => {
    const onCreate = jest.fn().mockResolvedValue(undefined);
    render(<CreatePlaylistDialog open onClose={jest.fn()} onCreate={onCreate} />);

    const dialog = screen.getByRole('dialog', { name: 'Tạo playlist' });
    const input = within(dialog).getByLabelText('Tên playlist') as HTMLInputElement;
    await userEvent.type(input, '  Ballad  ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tạo playlist' }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('Ballad'));
    expect(input.value).toBe('');
  });

  it('does not call onCreate with an empty name', async () => {
    const onCreate = jest.fn();
    render(<CreatePlaylistDialog open onClose={jest.fn()} onCreate={onCreate} />);

    const dialog = screen.getByRole('dialog', { name: 'Tạo playlist' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tạo playlist' }));

    expect(onCreate).not.toHaveBeenCalled();
  });
});
