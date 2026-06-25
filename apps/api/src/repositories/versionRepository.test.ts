import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VersionRepository } from './versionRepository.js';

// Mock node:child_process
vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>();
  return {
    ...original,
    spawnSync: vi.fn().mockImplementation((command, args, options) => {
      // Nếu là chạy thật lệnh tar hoặc gzip để test tích hợp, hoặc kiểm tra version tar
      if (command === 'tar' || command === 'gzip') {
        return original.spawnSync(command, args, options);
      }
      // Mặc định trả về success cho các mock
      return {
        status: 0,
        stdout: '',
        stderr: '',
        pid: 123,
        output: [],
        signal: null
      };
    })
  };
});

let tempDir: string;
let repo: VersionRepository;

beforeEach(() => {
  tempDir = mkdtempSync(path.join(tmpdir(), 'version-repo-test-'));
  repo = new VersionRepository(tempDir);
  const mockedSpawnSync = spawnSync as any;
  mockedSpawnSync.mockClear();
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('VersionRepository', () => {
  // Test 1: Kiểm tra cấu hình spawnSync của runCommand
  it('should run spawnSync with optimized parameters (ignore stdout, capture stderr, large maxBuffer)', () => {
    const mockedSpawnSync = spawnSync as any;

    repo.runCommand('dummy-cmd', ['arg1', 'arg2']);

    expect(mockedSpawnSync).toHaveBeenCalledWith(
      'dummy-cmd',
      ['arg1', 'arg2'],
      expect.objectContaining({
        stdio: ['ignore', 'ignore', 'pipe'],
        maxBuffer: 50 * 1024 * 1024,
        encoding: 'utf8'
      })
    );
  });

  // Test 2: Kiểm tra cờ quiet (-q) được truyền cho unzip
  it('should call unzip with quiet flag -q', () => {
    const mockedSpawnSync = spawnSync as any;
    const tempZip = path.join(tempDir, 'test.zip');
    const destDir = path.join(tempDir, 'dest');

    repo.extractArchive(tempZip, 'test.zip', destDir);

    expect(mockedSpawnSync).toHaveBeenCalledWith(
      'unzip',
      ['-q', '-o', tempZip, '-d', destDir],
      expect.any(Object)
    );
  });

  // Test 3: Giải nén thực tế bằng tar (nếu lệnh tar và gzip hoạt động tốt)
  it('should extract tar.gz archive successfully if tar command is available', () => {
    // Để gọi nguyên bản tar --version, chúng ta cần mockImplementation tạm thời
    // nhưng mock ở trên đã gọi original.spawnSync khi command là 'tar' nên an toàn.
    const tarCheck = spawnSync('tar', ['--version']);
    if (tarCheck.status !== 0) {
      // Nếu không có tar trên môi trường chạy test, bỏ qua test này
      return;
    }

    // 1. Tạo thư mục chứa file test nguồn
    const srcDir = path.join(tempDir, 'src-tar');
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(path.join(srcDir, 'test-file.txt'), 'hello tar content', 'utf8');

    // 2. Nén thành file tar.gz
    const tarPath = path.join(tempDir, 'test.tar.gz');
    const tarResult = spawnSync('tar', ['-czf', tarPath, '-C', srcDir, '.'], { stdio: 'pipe' });
    expect(tarResult.status).toBe(0);

    // 3. Giải nén vào thư mục đích bằng repo.extractArchive
    const destDir = path.join(tempDir, 'dest-tar');
    mkdirSync(destDir, { recursive: true });
    repo.extractArchive(tarPath, 'test.tar.gz', destDir);

    // 4. Kiểm tra xem file đã được giải nén đúng chưa
    const extractedFilePath = path.join(destDir, 'test-file.txt');
    expect(existsSync(extractedFilePath)).toBe(true);
    expect(readFileSync(extractedFilePath, 'utf8')).toBe('hello tar content');
  });

  // Test 4: Báo lỗi định dạng không hỗ trợ
  it('should throw error for unsupported archive formats', () => {
    const destDir = path.join(tempDir, 'dest-unsupported');
    mkdirSync(destDir, { recursive: true });
    
    expect(() => {
      repo.extractArchive(path.join(tempDir, 'test.rar'), 'test.rar', destDir);
    }).toThrow('Unsupported archive format');
  });

  // Test 5: Báo lỗi khi lệnh con chạy thất bại và có lỗi trong stderr
  it('should throw error when command fails and propagate stderr', () => {
    const mockedSpawnSync = spawnSync as any;
    mockedSpawnSync.mockImplementationOnce(() => ({
      status: 1,
      stdout: '',
      stderr: 'Mocked unzip error message',
      pid: 123,
      output: [],
      signal: null
    }));

    const destDir = path.join(tempDir, 'dest-failed');
    mkdirSync(destDir, { recursive: true });

    expect(() => {
      repo.extractArchive(path.join(tempDir, 'mocked-fail.zip'), 'mocked-fail.zip', destDir);
    }).toThrow('Mocked unzip error message');
  });
});
