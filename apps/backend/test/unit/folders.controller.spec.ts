import {
  CanActivate,
  ExecutionContext,
  INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtPayload } from '@cafe-music/shared';
import { FoldersController } from '../../src/modules/playlists/folders.controller';
import { FoldersService } from '../../src/modules/playlists/folders.service';
import { PlaylistsController } from '../../src/modules/playlists/playlists.controller';
import { PlaylistsService } from '../../src/modules/playlists/playlists.service';
import { JwtAuthGuard } from '../../src/modules/auth/guards/jwt-auth.guard';

/**
 * Route folders từng nằm chung PlaylistsController và bị `@Get(':id')` khai báo
 * trước nuốt mất — `GET /playlists/folders` luôn rơi vào findOne('folders') rồi
 * trả 404. Test dựng app thật (guard giả) để bắt đúng lớp routing, thứ mà unit
 * test gọi thẳng method controller không thể phát hiện.
 */
describe('FoldersController (routing)', () => {
  let app: INestApplication;
  let currentUser: JwtPayload;

  const foldersService = {
    create: jest.fn(),
    findAll: jest.fn(),
    remove: jest.fn(),
  };

  const playlistsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    addTrack: jest.fn(),
    reorderTracks: jest.fn(),
    removeTrack: jest.fn(),
  };

  class StubJwtAuthGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const req = context.switchToHttp().getRequest<{ user: JwtPayload }>();
      req.user = currentUser;
      return true;
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PlaylistsController, FoldersController],
      providers: [
        { provide: PlaylistsService, useValue: playlistsService },
        { provide: FoldersService, useValue: foldersService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(StubJwtAuthGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    currentUser = {
      sub: 'user-1',
      email: 'admin@cafe.com',
      role: 'ORG_ADMIN',
      organizationId: 'org-1',
      storeId: null,
    };
  });

  it('lists folders instead of falling through to playlist lookup', async () => {
    foldersService.findAll.mockResolvedValue([
      { id: 'folder-1', name: 'Chill' },
    ]);

    const res = await request(app.getHttpServer())
      .get('/api/v1/folders')
      .expect(200);

    expect(res.body).toEqual([{ id: 'folder-1', name: 'Chill' }]);
    expect(foldersService.findAll).toHaveBeenCalledWith(currentUser);
    expect(playlistsService.findOne).not.toHaveBeenCalled();
  });

  it('creates a folder for org admins', async () => {
    foldersService.create.mockResolvedValue({ id: 'folder-2', name: 'Ballad' });

    await request(app.getHttpServer())
      .post('/api/v1/folders')
      .send({ name: 'Ballad' })
      .expect(201);

    expect(foldersService.create).toHaveBeenCalledWith('Ballad', currentUser);
  });

  it('rejects folder creation for store admins', async () => {
    currentUser = { ...currentUser, role: 'STORE_ADMIN', storeId: 'store-1' };

    await request(app.getHttpServer())
      .post('/api/v1/folders')
      .send({ name: 'Ballad' })
      .expect(403);

    expect(foldersService.create).not.toHaveBeenCalled();
  });

  it('deletes a folder by id', async () => {
    foldersService.remove.mockResolvedValue({ message: 'Folder deleted' });

    await request(app.getHttpServer())
      .delete('/api/v1/folders/folder-1')
      .expect(200);

    expect(foldersService.remove).toHaveBeenCalledWith('folder-1', currentUser);
  });

  it('still resolves playlist detail routes', async () => {
    playlistsService.findOne.mockResolvedValue({
      id: 'playlist-1',
      name: 'V-Pop',
    });

    await request(app.getHttpServer())
      .get('/api/v1/playlists/playlist-1')
      .expect(200);

    expect(playlistsService.findOne).toHaveBeenCalledWith(
      'playlist-1',
      currentUser,
    );
  });
});
