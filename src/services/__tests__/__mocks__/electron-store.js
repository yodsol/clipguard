// Manual mock for electron-store
class MockStore {
  constructor(options) {
    this.options = options;
    this.data = {};
  }

  get(key, defaultValue) {
    return this.data[key] !== undefined ? this.data[key] : defaultValue;
  }

  set(key, value) {
    this.data[key] = value;
  }

  clear() {
    this.data = {};
  }

  delete(key) {
    delete this.data[key];
  }
}

module.exports = MockStore;
module.exports.default = MockStore;
