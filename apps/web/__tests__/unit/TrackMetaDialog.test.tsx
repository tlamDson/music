import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TrackMetaDialog from '../../src/components/track/TrackMetaDialog';

describe('TrackMetaDialog', () => {
  it('does not render when closed', () => {
    render(
      <TrackMetaDialog
        open={false}
        mode="upload"
        defaultTitle=""
        defaultArtist=""
        saving={false}
        onSubmit={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows upload copy and calls onSubmit with the trimmed values', async () => {
    const onSubmit = jest.fn();
    render(
      <TrackMetaDialog
        open
        mode="upload"
        defaultTitle="new-song"
        defaultArtist=""
        saving={false}
        onSubmit={onSubmit}
        onClose={jest.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Thông tin bài hát' });
    expect(within(dialog).getByRole('button', { name: 'Tải lên' })).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Ca sĩ'), '  Sơn Tùng  ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tải lên' }));

    expect(onSubmit).toHaveBeenCalledWith({ title: 'new-song', artist: 'Sơn Tùng' });
  });

  it('shows edit copy and prefills both fields', () => {
    render(
      <TrackMetaDialog
        open
        mode="edit"
        defaultTitle="Old Title"
        defaultArtist="Old Artist"
        saving={false}
        onSubmit={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Sửa bài hát' });
    expect(within(dialog).getByLabelText('Tên bài hát')).toHaveValue('Old Title');
    expect(within(dialog).getByLabelText('Ca sĩ')).toHaveValue('Old Artist');
    expect(within(dialog).getByRole('button', { name: 'Lưu' })).toBeInTheDocument();
  });

  it('does not submit with an empty title', async () => {
    const onSubmit = jest.fn();
    render(
      <TrackMetaDialog
        open
        mode="edit"
        defaultTitle="Old Title"
        defaultArtist=""
        saving={false}
        onSubmit={onSubmit}
        onClose={jest.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Sửa bài hát' });
    await userEvent.clear(within(dialog).getByLabelText('Tên bài hát'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the saving label and disables submit while saving', () => {
    render(
      <TrackMetaDialog
        open
        mode="edit"
        defaultTitle="Old Title"
        defaultArtist=""
        saving
        onSubmit={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Sửa bài hát' });
    const submit = within(dialog).getByRole('button', { name: 'Đang lưu...' });
    expect(submit).toBeDisabled();
  });
});
