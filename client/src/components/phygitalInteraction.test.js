import { describe, expect, it } from 'vitest';
import * as PhygitalModalModule from './PhygitalModal.jsx';

describe('phygital modal keyboard ownership', () => {
  it('closes on Escape but keeps ordinary typing keys inside the modal', () => {
    expect(PhygitalModalModule.shouldClosePhygitalFromKey?.('Escape')).toBe(true);
    expect(PhygitalModalModule.shouldClosePhygitalFromKey?.('Enter')).toBe(false);
    expect(PhygitalModalModule.shouldClosePhygitalFromKey?.('S')).toBe(false);
  });
});
