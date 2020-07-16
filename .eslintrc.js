'use strict';

module.exports = {
  env: {
    commonjs: true,
    es2020: true,
    node: true,
    jquery: true,
    browser: true,
  },
  extends: [
    'airbnb-base',
  ],
  parserOptions: {
    ecmaVersion: 11,
    sourceType: 'script',
    ecmaFeatures: {
      modules: false,
    },
  },
  rules: {
    strict: [2, 'global'],
  },
  globals: {
    OT: 'readonly',
  },
};
