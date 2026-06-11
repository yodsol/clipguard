// Test setup file to mock electron-store before tests
jest.mock('electron-store', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    clear: jest.fn(),
    delete: jest.fn(),
  }));
});

jest.mock('fs');
jest.mock('path');
jest.mock('../../permissions/platform-detector');
