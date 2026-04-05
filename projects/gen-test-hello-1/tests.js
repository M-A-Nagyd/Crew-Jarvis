const { test } = require('tape');
const main = require('./main.js');

test("main", (t) => {
  process.stdout.write = jest.spyOn(process.stdout, 'write');
  main.main();
  const output = process.stdout.write.mock.calls[0][0];
  t.equal(output.trim(), 'Hello World');
});