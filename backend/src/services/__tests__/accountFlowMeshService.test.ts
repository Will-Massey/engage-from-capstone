/**
 * Mesh safety: default mode must never require live AF.
 */
import { getMeshStatus, listMockAccountFlowState } from '../accountFlowMeshService.js';

describe('accountFlowMeshService', () => {
  const prevMode = process.env.ACCOUNTFLOW_MESH_MODE;
  const prevLive = process.env.ACCOUNTFLOW_MESH_ALLOW_LIVE;
  const prevUrl = process.env.ACCOUNTFLOW_BASE_URL;

  afterEach(() => {
    if (prevMode === undefined) delete process.env.ACCOUNTFLOW_MESH_MODE;
    else process.env.ACCOUNTFLOW_MESH_MODE = prevMode;
    if (prevLive === undefined) delete process.env.ACCOUNTFLOW_MESH_ALLOW_LIVE;
    else process.env.ACCOUNTFLOW_MESH_ALLOW_LIVE = prevLive;
    if (prevUrl === undefined) delete process.env.ACCOUNTFLOW_BASE_URL;
    else process.env.ACCOUNTFLOW_BASE_URL = prevUrl;
  });

  it('defaults to mock-available without live flags', () => {
    delete process.env.ACCOUNTFLOW_MESH_MODE;
    delete process.env.ACCOUNTFLOW_MESH_ALLOW_LIVE;
    delete process.env.ACCOUNTFLOW_BASE_URL;
    const s = getMeshStatus();
    expect(s.mode).toBe('mock');
    expect(s.available).toBe(true);
    expect(s.allowLive).toBe(false);
    expect(s.message.toLowerCase()).toMatch(/mock|not/);
  });

  it('refuses live without ACCOUNTFLOW_MESH_ALLOW_LIVE', () => {
    process.env.ACCOUNTFLOW_MESH_MODE = 'live';
    process.env.ACCOUNTFLOW_BASE_URL = 'https://accountflow.example.com';
    delete process.env.ACCOUNTFLOW_MESH_ALLOW_LIVE;
    const s = getMeshStatus();
    // Forced off live path
    expect(s.allowLive).toBe(false);
    expect(s.mode === 'mock' || s.available).toBe(true);
  });

  it('local mode rejects public URLs (prod protection)', () => {
    process.env.ACCOUNTFLOW_MESH_MODE = 'local';
    process.env.ACCOUNTFLOW_BASE_URL = 'https://accountflow.example.com';
    const s = getMeshStatus();
    expect(s.mode).toBe('mock');
    expect(s.message.toLowerCase()).toMatch(/private|mock|refused/);
  });

  it('lists empty mock state for unknown tenant', () => {
    const st = listMockAccountFlowState('tenant-does-not-exist');
    expect(st.clients).toEqual([]);
    expect(st.work).toEqual([]);
  });
});
