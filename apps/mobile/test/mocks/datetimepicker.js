// SPEC-4003 — native date picker stub.
const React = require('react');
const { View } = require('react-native');
module.exports = function DateTimePicker() {
  return React.createElement(View, { testID: 'mock-datetimepicker' });
};
module.exports.default = module.exports;
