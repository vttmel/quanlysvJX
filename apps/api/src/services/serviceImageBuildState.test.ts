import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getServiceBuildReadiness,
  markServiceImagePrepared
} from './serviceImageBuildState.js';

const composeConfig = {
  services: {
    paysys: {
      image: 'paysys',
      build: { context: '.', dockerfile: './dockerfiles/Dockerfile.paysys' }
    },
    goddess: {
      image: 'jx-centos',
      build: { context: './dockerfiles', dockerfile: 'Dockerfile.jx-centos' }
    },
    jxserver: {
      image: 'jx-centos',
      build: { context: './dockerfiles', dockerfile: 'Dockerfile.jx-centos' }
    },
    jxmysql: {
      image: 'mysql:5.6'
    }
  }
};

function createProject() {
  const root = mkdtempSync(path.join(tmpdir(), 'image-build-state-'));
  const dockerfilesDir = path.join(root, 'apps/jx-services/dockerfiles');
  mkdirSync(dockerfilesDir, { recursive: true });
  writeFileSync(path.join(dockerfilesDir, 'Dockerfile.paysys'), 'FROM ubuntu:22.04\n', 'utf8');
  writeFileSync(path.join(dockerfilesDir, 'Dockerfile.jx-centos'), 'FROM centos:7\n', 'utf8');
  writeFileSync(path.join(dockerfilesDir, 'paysys-entrypoint.sh'), '#!/bin/sh\n', 'utf8');
  writeFileSync(path.join(dockerfilesDir, 's3relay-entrypoint.sh'), '#!/bin/sh\n', 'utf8');
  writeFileSync(path.join(dockerfilesDir, 'paysys-setup-mdac.sh'), '#!/bin/sh\n', 'utf8');
  writeFileSync(path.join(dockerfilesDir, 'entrypoint.sh'), '#!/bin/sh\n', 'utf8');
  return root;
}

describe('service image build state', () => {
  it('does not require rebuild for services without build config', () => {
    const root = createProject();

    expect(getServiceBuildReadiness(root, composeConfig, 'jxmysql', true)).toMatchObject({
      needsRebuild: false,
      buildReason: null
    });
  });

  it('requires rebuild when a build-backed image has no saved signature', () => {
    const root = createProject();

    expect(getServiceBuildReadiness(root, composeConfig, 'paysys', true)).toMatchObject({
      needsRebuild: true,
      buildReason: 'Chưa có thông tin lần build gần nhất.'
    });
  });

  it('marks image prepared and detects later entrypoint changes', () => {
    const root = createProject();

    markServiceImagePrepared(root, composeConfig, 'paysys');
    expect(getServiceBuildReadiness(root, composeConfig, 'paysys', true)).toMatchObject({
      needsRebuild: false,
      buildReason: null
    });

    writeFileSync(
      path.join(root, 'apps/jx-services/dockerfiles/paysys-entrypoint.sh'),
      '#!/bin/sh\necho changed\n',
      'utf8'
    );

    expect(getServiceBuildReadiness(root, composeConfig, 'paysys', true)).toMatchObject({
      needsRebuild: true,
      buildReason: 'Dockerfile hoặc entrypoint đã thay đổi sau lần build gần nhất.'
    });
  });

  it('scopes entrypoint changes to the matching Dockerfile family', () => {
    const root = createProject();

    markServiceImagePrepared(root, composeConfig, 'paysys');
    markServiceImagePrepared(root, composeConfig, 'goddess');
    expect(getServiceBuildReadiness(root, composeConfig, 'jxserver', true)).toMatchObject({
      needsRebuild: false
    });

    writeFileSync(
      path.join(root, 'apps/jx-services/dockerfiles/paysys-entrypoint.sh'),
      '#!/bin/sh\necho changed\n',
      'utf8'
    );

    expect(getServiceBuildReadiness(root, composeConfig, 'paysys', true)).toMatchObject({
      needsRebuild: true
    });
    expect(getServiceBuildReadiness(root, composeConfig, 'goddess', true)).toMatchObject({
      needsRebuild: false
    });

    writeFileSync(
      path.join(root, 'apps/jx-services/dockerfiles/entrypoint.sh'),
      '#!/bin/sh\necho jx-centos changed\n',
      'utf8'
    );

    expect(getServiceBuildReadiness(root, composeConfig, 'goddess', true)).toMatchObject({
      needsRebuild: true
    });
    expect(getServiceBuildReadiness(root, composeConfig, 'jxserver', true)).toMatchObject({
      needsRebuild: true
    });
  });
});
