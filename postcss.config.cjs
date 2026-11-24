const buildTarget = require('./build-target.json');
const BROWSERS_TARGET = [buildTarget.legacyBrowsers];

module.exports = {
  plugins: {
    tailwindcss: {},
    'postcss-preset-env': {
      browsers: BROWSERS_TARGET,
      stage: 2,
      features: {
        'custom-properties': false,
        'color-functional-notation': true,
      },
    },
    autoprefixer: {
      overrideBrowserslist: BROWSERS_TARGET,
    },
  },
};
